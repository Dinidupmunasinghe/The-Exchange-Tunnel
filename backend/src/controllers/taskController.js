const { Op } = require("sequelize");
const db = require("../models");
const sequelize = require("../config/database");
const tg = require("../services/telegramService");
const { verifyEngagement } = require("../services/engagementVerification");
const { earnCredits, refundCredits, reverseEarnCredits } = require("../services/creditService");
const { ENGAGEMENT_TYPES, ACTION_KINDS, bundleAllowsAction } = require("../constants/engagement");

function isSuspiciousSubmission(proofText) {
  if (!proofText) return true;
  const repeatedChars = /(.)\1{8,}/.test(proofText);
  const tooShort = proofText.trim().length < 10;
  return repeatedChars || tooShort;
}

function runnableCampaignWhere() {
  return {
    [Op.or]: [
      { status: "active" },
      { status: "pending", scheduledLaunchAt: { [Op.lte]: new Date() } }
    ]
  };
}

function requireWorkerTelegramId(user) {
  if (!user?.telegramUserId) {
    const error = new Error("Log in with Telegram to complete tasks");
    error.status = 400;
    throw error;
  }
  return String(user.telegramUserId);
}

function parseTmeChannelUsername(url) {
  try {
    const u = new URL(String(url || "").trim());
    const host = (u.hostname || "").toLowerCase().replace(/^www\./, "");
    if (host !== "t.me") return null;
    const parts = (u.pathname || "/").split("/").filter(Boolean);
    if (!parts[0] || parts[0] === "c") return null;
    // Channel root link: https://t.me/<username>
    if (parts.length === 1) return parts[0].replace(/^@/, "");
    return null;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitTaskCompletion(req, res) {
  const { taskId, engagementType, proofText: proofRaw, actionKind } = req.body;
  const proofText = typeof proofRaw === "string" ? proofRaw : "";

  if (!ACTION_KINDS.includes(actionKind)) {
    return res.status(400).json({ message: "Invalid action kind" });
  }
  if (!ENGAGEMENT_TYPES.includes(engagementType)) {
    return res.status(400).json({ message: "Invalid engagement type" });
  }
  if (!bundleAllowsAction(engagementType, actionKind)) {
    return res.status(400).json({ message: "This action is not part of this campaign bundle" });
  }
  if (!tg.isConfigured()) {
    return res.status(503).json({ message: "Server: TELEGRAM_BOT_TOKEN is not configured" });
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
        (c.status === "active" || (c.status === "pending" && c.scheduledLaunchAt && new Date(c.scheduledLaunchAt) <= new Date()));
      if (!campaignRunnable) {
        const error = new Error(
          c.status === "paused" ? "Campaign is paused" : "Campaign is not active yet"
        );
        error.status = 400;
        throw error;
      }
      const storedActionKind = actionKind === "subscribe" ? null : actionKind;
      const dupWhere =
        engagementType === "subscribe"
          ? { userId: req.user.id, campaignId: task.campaignId, engagementType: "subscribe" }
          : { userId: req.user.id, campaignId: task.campaignId, actionKind: storedActionKind };
      const dup = await db.Engagement.findOne({
        where: dupWhere,
        transaction
      });
      if (dup) {
        const error = new Error("You already completed this action for this post");
        error.status = 400;
        throw error;
      }
      const worker = await db.User.findByPk(req.user.id, { transaction, lock: true });
      if (!worker) {
        const error = new Error("User not found");
        error.status = 404;
        throw error;
      }
      const tUid = requireWorkerTelegramId(worker);
      const msgUrl = c.messageUrl || c.soundcloudPostUrl;
      if (!msgUrl || !tg.isLikelyTelegramMessageUrl(String(msgUrl))) {
        const error = new Error("This campaign is not a Telegram t.me/… link");
        error.status = 400;
        throw error;
      }
      let resolved;
      if (engagementType === "subscribe") {
        const username = parseTmeChannelUsername(String(msgUrl));
        if (!username) {
          const error = new Error("Invalid t.me channel URL on campaign");
          error.status = 400;
          throw error;
        }
        const chat = await tg.getChat(`@${username}`).catch(() => null);
        if (!chat || chat.id == null) {
          const error = new Error("Could not resolve campaign channel");
          error.status = 400;
          throw error;
        }
        resolved = { chatId: String(chat.id), title: chat.title || null };
      } else {
        const parsed = tg.parseTmeMessageUrl(String(msgUrl));
        if (!parsed) {
          const error = new Error("Invalid t.me post URL on campaign");
          error.status = 400;
          throw error;
        }
        resolved = await tg.resolveChannelChatIdFromTme(parsed, null);
      }
      if (resolved == null) {
        const error = new Error("Could not resolve this Telegram post");
        error.status = 400;
        throw error;
      }
      if (resolved.error) {
        const error = new Error(resolved.error);
        error.status = 400;
        throw error;
      }
      const channelId = resolved.chatId;
      let memberCheck = await tg.getUserChatMemberStatus(String(channelId), tUid);
      // Telegram can lag briefly right after subscribe; retry a few times for subscribe campaigns.
      if (!memberCheck.ok && engagementType === "subscribe") {
        for (let i = 0; i < 3; i += 1) {
          await sleep(1500);
          memberCheck = await tg.getUserChatMemberStatus(String(channelId), tUid);
          if (memberCheck.ok) break;
        }
      }
      if (!memberCheck.ok) {
        const raw = String(memberCheck.error || "").toLowerCase();
        let hint =
          "Open the t.me/… link, subscribe in Telegram, then return here. The bot must be in the channel.";
        if (raw.includes("bot is not a member")) {
          hint = "The bot is not in that channel. Add the bot as an admin to the target channel, then try again.";
        } else if (raw.includes("user not found")) {
          hint = "This Telegram account is not visible in that channel yet. Ensure you subscribed with the same account and retry after 10 seconds.";
        } else if (raw.includes("chat not found")) {
          hint = "Campaign channel could not be found. Ensure the channel is public and still exists.";
        } else if (memberCheck.status === "left" || memberCheck.status === "kicked") {
          hint = "Telegram reports this account is not subscribed to the channel.";
        }
        const error = new Error(
          `Could not confirm your subscription to the target channel. ${hint}`
        );
        error.status = 400;
        throw error;
      }
      if (actionKind === "comment" && isSuspiciousSubmission(proofText)) {
        const error = new Error("Comment: enter at least 10 characters in your proof (what you posted)");
        error.status = 400;
        throw error;
      }
      if (actionKind === "share" && isSuspiciousSubmission(proofText)) {
        const error = new Error("Repost/forward: describe what you did (at least 10 characters) in the proof");
        error.status = 400;
        throw error;
      }
      if (actionKind === "like") {
        // "Like" = react/heart or similar — membership already verified; proof optional
      }

      const verifiedViaProvider = true;
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

      task.assignedUserId = req.user.id;
      task.status = "assigned";
      task.assignedAt = task.assignedAt || new Date();
      await task.save({ transaction });

      const metaId =
        actionKind === "subscribe" ? `tg-sub-${tUid}-${channelId}` : `tg-mem-${tUid}-${channelId}`;

      await db.Engagement.create(
        {
          userId: req.user.id,
          campaignId: task.campaignId,
          taskId: task.id,
          engagementType,
          actionKind: storedActionKind,
          metaEngagementId: metaId,
          verificationStatus: "verified",
          verificationDetails:
            actionKind === "subscribe"
              ? "Telegram: channel membership verified for subscribe campaign"
              : "Telegram: channel membership + proof rules"
        },
        { transaction }
      );

      task.status = "completed";
      task.completedAt = new Date();
      await task.save({ transaction });

      await earnCredits({
        userId: req.user.id,
        amount: task.rewardCredits,
        reason:
          actionKind === "subscribe"
            ? `Earned from channel subscribe on campaign #${task.campaignId} (task #${task.id})`
            : `Earned from ${actionKind} on campaign #${task.campaignId} (task #${task.id})`,
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

async function getAvailableTasks(req, res) {
  const tasks = await db.Task.findAll({
    where: {
      [Op.or]: [
        {
          status: { [Op.in]: ["open", "assigned"] },
          [Op.or]: [{ assignedUserId: null }, { assignedUserId: req.user.id }]
        },
        { status: "completed", assignedUserId: req.user.id }
      ]
    },
    include: [
      {
        model: db.Campaign,
        as: "campaign",
        required: true,
        where: { userId: { [Op.ne]: req.user.id }, ...runnableCampaignWhere() },
        attributes: [
          "id",
          "name",
          "messageUrl",
          "messageKey",
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
  const serialized = tasks.map((t) => {
    const o = t.toJSON();
    if (o.campaign) {
      o.campaign.soundcloudPostUrl = o.campaign.messageUrl;
      o.campaign.soundcloudPostId = o.campaign.messageKey;
    }
    return o;
  });
  const campaignIds = [...new Set(tasks.map((t) => t.campaignId))];
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
  return res.json({ tasks: serialized, myEngagements });
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
      if (campaign.userId === req.user.id) {
        const error = new Error("Cannot revert on your own campaign");
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
        userId: campaign.userId,
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
    return res.json({
      message:
        "Engagement reverted in the app; remove your like/comment/forward in Telegram if you can. Credits were returned to the poster."
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || "Could not revert engagement" });
  }
}

module.exports = { getAvailableTasks, submitTaskCompletion, revertEngagement };
