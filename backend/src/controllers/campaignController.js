const crypto = require("crypto");
const db = require("../models");
const sequelize = require("../config/database");
const { resolveExternalPostIdFromUrl, resolveToNumericPostId } = require("../services/soundcloudService");
const scNative = require("../services/soundcloudNativeService");
const { decrypt } = require("../utils/crypto");
const { ENGAGEMENT_TYPES } = require("../constants/engagement");
const { spendCredits, refundCredits } = require("../services/creditService");

function normalizeCampaignName(raw) {
  const s = String(raw || "").trim();
  return s.length > 0 ? s.slice(0, 160) : "Untitled campaign";
}

function parseOptionalSchedule(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isLikelyFacebookPostUrl(url) {
  return /^https?:\/\/(www\.)?(facebook\.com|m\.facebook\.com|fb\.com|fb\.watch)/i.test(String(url || ""));
}

function stableNonFacebookPostKey(url) {
  const h = crypto.createHash("sha256").update(String(url || "").trim()).digest("hex").slice(0, 48);
  return `sc_${h}`;
}

async function createCampaign(req, res) {
  const body = req.body;
  const name = body.name;
  const selectedPostIdRaw = body.soundcloudPostId ?? body.facebookPostId;
  const soundcloudPostUrl = body.soundcloudPostUrl ?? body.facebookPostUrl;
  const { engagementType, creditsPerEngagement, maxEngagements, scheduledLaunchAt: scheduleRaw } = body;

  if (!soundcloudPostUrl || typeof soundcloudPostUrl !== "string") {
    return res.status(400).json({ message: "soundcloudPostUrl is required" });
  }

  if (!ENGAGEMENT_TYPES.includes(engagementType)) {
    return res.status(400).json({ message: "Invalid engagement type" });
  }

  const scheduledLaunchAt = parseOptionalSchedule(scheduleRaw);
  const now = new Date();
  const launchesLater = scheduledLaunchAt && scheduledLaunchAt > now;
  const status = launchesLater ? "pending" : "active";

  const totalBudget = creditsPerEngagement * maxEngagements;
  const campaignName = normalizeCampaignName(name);

  const owner = await db.User.findByPk(req.user.id);
  if (!owner) {
    return res.status(401).json({ message: "User not found" });
  }

  const selectedPostId =
    typeof selectedPostIdRaw === "string" && /^\d+(_\d+)?$/.test(selectedPostIdRaw.trim())
      ? selectedPostIdRaw.trim()
      : null;

  let rawPostId = selectedPostId;
  if (!rawPostId && isLikelyFacebookPostUrl(soundcloudPostUrl)) {
    rawPostId = await resolveExternalPostIdFromUrl(soundcloudPostUrl);
  }
  if (!rawPostId && scNative.isLikelySoundCloudTrackUrl(soundcloudPostUrl)) {
    if (!owner.soundcloudActingAccountTokenEncrypted) {
      return res.status(400).json({
        message: "Select your SoundCloud acting account in Settings before creating a track campaign."
      });
    }
    const actTok = decrypt(owner.soundcloudActingAccountTokenEncrypted);
    const resolved = await scNative.resolveTrackUrl(actTok, soundcloudPostUrl);
    if (resolved) {
      rawPostId = resolved;
    }
  }
  if (!rawPostId) {
    rawPostId = stableNonFacebookPostKey(soundcloudPostUrl);
  }
  if (owner.credits < totalBudget) {
    return res.status(400).json({
      message: `Insufficient credits — this campaign needs ${totalBudget} upfront (${creditsPerEngagement} × ${maxEngagements} slots) but you have ${owner.credits}. Earn credits or lower the budget slider.`,
      required: totalBudget,
      balance: owner.credits
    });
  }

  if (!owner.soundcloudActingAccountId || !owner.soundcloudActingAccountTokenEncrypted) {
    return res.status(400).json({
      message: "Connect and select your acting account in Settings before creating a campaign."
    });
  }

  let soundcloudPostId = rawPostId;
  if (isLikelyFacebookPostUrl(soundcloudPostUrl) && !selectedPostId && /^pfbid/i.test(String(rawPostId))) {
    const ownerPageToken = decrypt(owner.soundcloudActingAccountTokenEncrypted);
    const numeric = await resolveToNumericPostId(rawPostId, ownerPageToken, soundcloudPostUrl);
    if (!numeric || numeric === rawPostId) {
      return res.status(400).json({
        message:
          "Could not verify this post URL against your selected acting account. " +
          "For Facebook posts, ensure the post belongs to the account selected in Settings, then copy its direct link again."
      });
    }
    soundcloudPostId = numeric;
  }

  const createdCampaign = await sequelize.transaction(async (transaction) => {
    const campaign = await db.Campaign.create(
      {
        userId: req.user.id,
        name: campaignName,
        soundcloudPostId,
        soundcloudPostUrl,
        engagementType,
        creditsPerEngagement,
        maxEngagements,
        scheduledLaunchAt: launchesLater ? scheduledLaunchAt : null,
        status
      },
      { transaction }
    );

    await spendCredits({
      userId: req.user.id,
      amount: totalBudget,
      reason: `Budget locked for campaign #${campaign.id}`,
      referenceType: "campaign",
      referenceId: campaign.id,
      transaction
    });

    const taskPayload = Array.from({ length: maxEngagements }).map(() => ({
      campaignId: campaign.id,
      engagementType,
      rewardCredits: creditsPerEngagement,
      status: "open"
    }));

    await db.Task.bulkCreate(taskPayload, { transaction });
    return campaign;
  });

  return res.status(201).json({
    message: launchesLater ? "Campaign scheduled" : "Campaign created",
    campaign: createdCampaign
  });
}

async function listMyCampaigns(req, res) {
  const campaigns = await db.Campaign.findAll({
    where: { userId: req.user.id },
    include: [{ model: db.Task, as: "tasks", attributes: ["id", "status"] }],
    order: [["createdAt", "DESC"]]
  });

  const serialized = campaigns.map((campaign) => {
    const completedCount = campaign.tasks.filter((t) => t.status === "completed").length;
    return {
      id: campaign.id,
      name: campaign.name,
      soundcloudPostUrl: campaign.soundcloudPostUrl,
      engagementType: campaign.engagementType,
      creditsPerEngagement: campaign.creditsPerEngagement,
      maxEngagements: campaign.maxEngagements,
      completedEngagements: completedCount,
      spentCredits: completedCount * campaign.creditsPerEngagement,
      status: campaign.status,
      scheduledLaunchAt: campaign.scheduledLaunchAt,
      createdAt: campaign.createdAt
    };
  });

  return res.json({ campaigns: serialized });
}

async function patchCampaign(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  const { action } = req.body;
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ message: "Invalid campaign id" });
  }

  const campaign = await db.Campaign.findOne({ where: { id, userId: req.user.id } });
  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found" });
  }

  if (action === "pause") {
    if (campaign.status === "completed") {
      return res.status(400).json({ message: "Cannot pause a completed campaign" });
    }
    if (campaign.status === "paused") {
      return res.status(400).json({ message: "Campaign is already paused" });
    }
    if (!["active", "pending"].includes(campaign.status)) {
      return res.status(400).json({ message: "Cannot pause this campaign" });
    }
    campaign.status = "paused";
    await campaign.save();
    return res.json({ message: "Campaign paused", campaign });
  }

  if (action === "resume") {
    if (campaign.status !== "paused") {
      return res.status(400).json({ message: "Campaign is not paused" });
    }
    const completed = await db.Task.count({
      where: { campaignId: campaign.id, status: "completed" }
    });
    if (completed >= campaign.maxEngagements) {
      campaign.status = "completed";
      await campaign.save();
      return res.json({ message: "Campaign completed", campaign });
    }
    const now = new Date();
    if (campaign.scheduledLaunchAt && new Date(campaign.scheduledLaunchAt) > now) {
      campaign.status = "pending";
    } else {
      campaign.status = "active";
    }
    await campaign.save();
    return res.json({ message: "Campaign resumed", campaign });
  }

  return res.status(400).json({ message: "Invalid action" });
}

async function deleteCampaign(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ message: "Invalid campaign id" });
  }

  try {
    await sequelize.transaction(async (transaction) => {
      const campaign = await db.Campaign.findOne({
        where: { id, userId: req.user.id },
        transaction
      });
      if (!campaign) {
        const err = new Error("Campaign not found");
        err.status = 404;
        throw err;
      }

      const completed = await db.Task.count({
        where: { campaignId: campaign.id, status: "completed" },
        transaction
      });
      const refund = (campaign.maxEngagements - completed) * campaign.creditsPerEngagement;

      await db.Engagement.destroy({ where: { campaignId: campaign.id }, transaction });
      await db.Task.destroy({ where: { campaignId: campaign.id }, transaction });
      await campaign.destroy({ transaction });

      if (refund > 0) {
        await refundCredits({
          userId: req.user.id,
          amount: refund,
          reason: `Refund unused budget for deleted campaign #${id}`,
          referenceType: "campaign",
          referenceId: id,
          transaction
        });
      }
    });
  } catch (e) {
    if (e.status === 404) {
      return res.status(404).json({ message: e.message });
    }
    // eslint-disable-next-line no-console
    console.error(e);
    return res.status(500).json({ message: "Could not delete campaign" });
  }

  return res.json({ message: "Campaign deleted" });
}

module.exports = { createCampaign, listMyCampaigns, patchCampaign, deleteCampaign };
