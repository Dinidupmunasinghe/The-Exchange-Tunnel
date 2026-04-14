const { Op } = require("sequelize");
const db = require("../models");
const sequelize = require("../config/database");
const { decrypt } = require("../utils/crypto");
const {
  verifyEngagement,
  likeObjectAsPage,
  unlikeObjectAsPage,
  commentOnObjectAsPage,
  shareLinkAsPage,
  deleteObjectAsPage
} = require("../services/soundcloudService");
const scNative = require("../services/soundcloudNativeService");
const { earnCredits, refundCredits, reverseEarnCredits } = require("../services/creditService");
const { ENGAGEMENT_TYPES, bundleAllowsAction } = require("../constants/engagement");

function isLikelyFacebookPostUrl(url) {
  return /^https?:\/\/(www\.)?(facebook\.com|m\.facebook\.com|fb\.com|fb\.watch)/i.test(String(url || ""));
}

function isSuspiciousSubmission(proofText) {
  if (!proofText) return true;
  const repeatedChars = /(.)\1{8,}/.test(proofText);
  const tooShort = proofText.trim().length < 10;
  return repeatedChars || tooShort;
}

/** Campaign is runnable: active, or scheduled time has arrived while still pending. */
function runnableCampaignWhere() {
  return {
    [Op.or]: [
      { status: "active" },
      {
        status: "pending",
        scheduledLaunchAt: { [Op.lte]: new Date() }
      }
    ]
  };
}

function getSelectedActingAccountSession(user) {
  if (!user?.soundcloudActingAccountId || !user?.soundcloudActingAccountTokenEncrypted) {
    const error = new Error("Select an acting account in Settings before performing automated actions");
    error.status = 400;
    throw error;
  }
  return {
    pageId: user.soundcloudActingAccountId,
    pageToken: decrypt(user.soundcloudActingAccountTokenEncrypted)
  };
}

async function resolveTrackIdForCampaign(campaign, accessToken) {
  const raw = String(campaign.soundcloudPostId || "").trim();
  if (/^\d+$/.test(raw)) return raw;
  if (scNative.isLikelySoundCloudTrackUrl(campaign.soundcloudPostUrl)) {
    return scNative.resolveTrackUrl(accessToken, campaign.soundcloudPostUrl);
  }
  return null;
}

async function getAvailableTasks(req, res) {
  const tasks = await db.Task.findAll({
    where: {
      [Op.or]: [
        {
          status: { [Op.in]: ["open", "assigned"] },
          [Op.or]: [{ assignedUserId: null }, { assignedUserId: req.user.id }]
        },
        {
          status: "completed",
          assignedUserId: req.user.id
        }
      ]
    },
    include: [
      {
        model: db.Campaign,
        as: "campaign",
        required: true,
        where: {
          userId: { [Op.ne]: req.user.id },
          ...runnableCampaignWhere()
        },
        attributes: [
          "id",
          "name",
          "soundcloudPostUrl",
          "soundcloudPostId",
          "engagementType",
          "creditsPerEngagement",
          "userId",
          "scheduledLaunchAt",
          "status",
          "createdAt",
          "maxEngagements"
        ]
      }
    ],
    subQuery: false,
    limit: 200,
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"]
    ]
  });

  const sanitized = tasks;

  const campaignIds = [...new Set(sanitized.map((t) => t.campaignId))];
  const myEngagements =
    campaignIds.length === 0
      ? []
      : await db.Engagement.findAll({
          where: {
            userId: req.user.id,
            campaignId: { [Op.in]: campaignIds },
            actionKind: { [Op.ne]: null }
          },
          attributes: ["id", "campaignId", "taskId", "actionKind"]
        });

  return res.json({ tasks: sanitized, myEngagements });
}

async function submitTaskCompletion(req, res) {
  const { taskId, engagementType, proofText: proofRaw, actionKind } = req.body;
  const proofText = typeof proofRaw === "string" ? proofRaw : "";

  if (!["like", "comment", "share"].includes(actionKind)) {
    return res.status(400).json({ message: "Invalid action kind" });
  }
  if (!ENGAGEMENT_TYPES.includes(engagementType)) {
    return res.status(400).json({ message: "Invalid engagement type" });
  }
  if (!bundleAllowsAction(engagementType, actionKind)) {
    return res.status(400).json({ message: "This action is not part of this campaign bundle" });
  }

  try {
    const done = await sequelize.transaction(async (transaction) => {
      const task = await db.Task.findByPk(taskId, {
        transaction,
        lock: true,
        include: [{ model: db.Campaign, as: "campaign" }]
      });
      if (!task || task.status === "completed" || task.status === "cancelled") {
        const error = new Error("Task is not available");
        error.status = 404;
        throw error;
      }
      if (task.campaign.userId === req.user.id) {
        const error = new Error("Cannot complete your own campaign task");
        error.status = 400;
        throw error;
      }
      if (task.assignedUserId && task.assignedUserId !== req.user.id) {
        const error = new Error("Task is assigned to another user");
        error.status = 400;
        throw error;
      }

      const c = task.campaign;
      const campaignRunnable =
        c.status !== "paused" &&
        (c.status === "active" ||
          (c.status === "pending" && c.scheduledLaunchAt && new Date(c.scheduledLaunchAt) <= new Date()));
      if (!campaignRunnable) {
        const error = new Error(
          c.status === "paused" ? "Campaign is paused" : "Campaign is not active yet"
        );
        error.status = 400;
        throw error;
      }

      const dup = await db.Engagement.findOne({
        where: {
          userId: req.user.id,
          campaignId: task.campaignId,
          actionKind
        },
        transaction
      });
      if (dup) {
        const error = new Error("You already completed this action on this post");
        error.status = 400;
        throw error;
      }

      const worker = await db.User.findByPk(req.user.id, { transaction, lock: true });
      if (!worker) {
        const error = new Error("User not found");
        error.status = 404;
        throw error;
      }

      const { pageId, pageToken } = getSelectedActingAccountSession(worker);

      const scMe = await scNative.fetchAuthenticatedUser(pageToken).catch(() => null);
      const useSoundCloudNative = Boolean(scMe && scNative.isLikelySoundCloudTrackUrl(c.soundcloudPostUrl));

      let verifiedViaProvider = false;
      let actionResponseId = null;

      if (useSoundCloudNative) {
        const trackId = await resolveTrackIdForCampaign(c, pageToken);
        if (!trackId) {
          const error = new Error("Could not resolve SoundCloud track id for this campaign");
          error.status = 400;
          throw error;
        }
        if (actionKind === "like") {
          await scNative.likeTrack(pageToken, trackId);
          verifiedViaProvider = true;
        } else if (actionKind === "comment") {
          if (isSuspiciousSubmission(proofText)) {
            const error = new Error("Comment text is required and must be at least 10 characters");
            error.status = 400;
            throw error;
          }
          const data = await scNative.commentOnTrack(pageToken, trackId, proofText);
          actionResponseId = data?.id != null ? String(data.id) : null;
          verifiedViaProvider = true;
        } else if (actionKind === "share") {
          const data = await scNative.repostTrack(pageToken, trackId);
          actionResponseId =
            data?.id != null
              ? String(data.id)
              : data?.track_id != null
                ? String(data.track_id)
                : String(trackId);
          verifiedViaProvider = true;
        }
      } else if (isLikelyFacebookPostUrl(c.soundcloudPostUrl)) {
        if (actionKind === "like") {
          await likeObjectAsPage(c.soundcloudPostId, pageToken, c.soundcloudPostUrl);
          verifiedViaProvider = true;
        } else if (actionKind === "comment") {
          if (isSuspiciousSubmission(proofText)) {
            const error = new Error("Comment text is required and must be at least 10 characters");
            error.status = 400;
            throw error;
          }
          const data = await commentOnObjectAsPage(c.soundcloudPostId, proofText, pageToken, c.soundcloudPostUrl);
          actionResponseId = data?.id ? String(data.id) : null;
          verifiedViaProvider = true;
        } else if (actionKind === "share") {
          const data = await shareLinkAsPage(pageId, c.soundcloudPostUrl, proofText, pageToken);
          actionResponseId = data?.id ? String(data.id) : null;
          verifiedViaProvider = true;
        }
      } else {
        const error = new Error(
          "This campaign URL is not supported for automated actions. Use a SoundCloud track URL or a Facebook Page post URL."
        );
        error.status = 400;
        throw error;
      }

      task.assignedUserId = req.user.id;
      task.status = "assigned";
      task.assignedAt = task.assignedAt || new Date();
      await task.save({ transaction });

      const verification = await verifyEngagement({
        campaign: task.campaign,
        engagementType,
        proofText,
        verifiedViaProvider
      });
      if (!verification.isValid) {
        const error = new Error(`Engagement verification failed: ${verification.reason}`);
        error.status = 400;
        throw error;
      }

      await db.Engagement.create(
        {
          userId: req.user.id,
          campaignId: task.campaignId,
          taskId: task.id,
          engagementType,
          actionKind,
          metaEngagementId: actionResponseId || verification.metaEngagementId,
          verificationStatus: "verified",
          verificationDetails: verification.reason
        },
        { transaction }
      );

      task.status = "completed";
      task.completedAt = new Date();
      await task.save({ transaction });

      await earnCredits({
        userId: req.user.id,
        amount: task.rewardCredits,
        reason: `Earned from ${actionKind} on campaign #${task.campaignId} (task #${task.id})`,
        referenceType: "task",
        referenceId: task.id,
        transaction
      });

      const completedCount = await db.Task.count({
        where: { campaignId: task.campaignId, status: "completed" },
        transaction
      });

      if (completedCount >= task.campaign.maxEngagements) {
        task.campaign.status = "completed";
        await task.campaign.save({ transaction });
      }

      return task;
    });

    return res.json({ message: "Task completed and credits added", task: done });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || "Could not complete task" });
  }
}

async function revertEngagement(req, res) {
  const { campaignId, actionKind } = req.body;

  if (!["like", "comment", "share"].includes(actionKind)) {
    return res.status(400).json({ message: "Invalid action kind" });
  }

  try {
    await sequelize.transaction(async (transaction) => {
      const engagement = await db.Engagement.findOne({
        where: { userId: req.user.id, campaignId, actionKind },
        transaction,
        lock: true,
        include: [
          { model: db.Task, as: "task", required: true },
          { model: db.Campaign, as: "campaign", required: true }
        ]
      });

      if (!engagement) {
        const error = new Error("No engagement to undo");
        error.status = 404;
        throw error;
      }

      const campaign = engagement.campaign;
      const task = engagement.task;
      const ownerId = campaign.userId;

      if (ownerId === req.user.id) {
        const error = new Error("Cannot revert on your own campaign");
        error.status = 400;
        throw error;
      }

      const worker = await db.User.findByPk(req.user.id, { transaction, lock: true });
      const { pageToken } = getSelectedActingAccountSession(worker);

      const scMe = await scNative.fetchAuthenticatedUser(pageToken).catch(() => null);
      const useSoundCloudNative = Boolean(scMe && scNative.isLikelySoundCloudTrackUrl(campaign.soundcloudPostUrl));

      if (useSoundCloudNative) {
        const trackId = await resolveTrackIdForCampaign(campaign, pageToken);
        if (!trackId) {
          const error = new Error("Could not resolve SoundCloud track id for this campaign");
          error.status = 400;
          throw error;
        }
        if (actionKind === "like") {
          await scNative.unlikeTrack(pageToken, trackId);
        } else if (actionKind === "share") {
          await scNative.deleteTrackRepost(pageToken, trackId);
        } else {
          if (!engagement.metaEngagementId) {
            const error = new Error("Provider object ID missing for this action");
            error.status = 400;
            throw error;
          }
          await scNative.deleteTrackComment(pageToken, trackId, engagement.metaEngagementId);
        }
      } else if (isLikelyFacebookPostUrl(campaign.soundcloudPostUrl)) {
        if (actionKind === "like") {
          await unlikeObjectAsPage(campaign.soundcloudPostId, pageToken, campaign.soundcloudPostUrl);
        } else {
          if (!engagement.metaEngagementId) {
            const error = new Error("Provider object ID missing for this action");
            error.status = 400;
            throw error;
          }
          await deleteObjectAsPage(engagement.metaEngagementId, pageToken);
        }
      } else {
        const error = new Error("Undo is not supported for this campaign URL type.");
        error.status = 400;
        throw error;
      }

      const amount = task.rewardCredits;

      await reverseEarnCredits({
        userId: req.user.id,
        amount,
        reason: `Reverted ${actionKind} on campaign #${campaignId} (task #${task.id})`,
        referenceType: "task",
        referenceId: task.id,
        transaction
      });

      await refundCredits({
        userId: ownerId,
        amount,
        reason: `Refund: ${actionKind} reverted on campaign #${campaignId}`,
        referenceType: "campaign",
        referenceId: campaign.id,
        transaction
      });

      await engagement.destroy({ transaction });

      task.status = "open";
      task.assignedUserId = null;
      task.assignedAt = null;
      task.completedAt = null;
      await task.save({ transaction });

      if (campaign.status === "completed") {
        const stillCompleted = await db.Task.count({
          where: { campaignId: campaign.id, status: "completed" },
          transaction
        });
        if (stillCompleted < campaign.maxEngagements) {
          campaign.status = "active";
          await campaign.save({ transaction });
        }
      }
    });

    return res.json({ message: "Engagement reverted; credits returned to the poster" });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || "Could not revert engagement" });
  }
}

module.exports = { getAvailableTasks, submitTaskCompletion, revertEngagement };
