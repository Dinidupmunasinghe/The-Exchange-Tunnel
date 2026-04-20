const crypto = require("crypto");
const db = require("../models");
const sequelize = require("../config/database");
const tg = require("../services/telegramService");
const { spendCredits, refundCredits } = require("../services/creditService");
const { ENGAGEMENT_TYPES } = require("../constants/engagement");

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

function stableKeyFromUrl(url) {
  const h = crypto.createHash("sha256").update(String(url || "").trim()).digest("hex").slice(0, 48);
  return `tg_${h}`;
}

async function createCampaign(req, res) {
  const body = req.body;
  const name = body.name;
  const messageUrl = body.messageUrl || body.soundcloudPostUrl || body.facebookPostUrl;
  const channelUrl = body.channelUrl;
  const { engagementType, creditsPerEngagement, maxEngagements, scheduledLaunchAt: scheduleRaw } = body;

  if (!tg.isConfigured()) {
    return res.status(503).json({ message: "Server: TELEGRAM_BOT_TOKEN is not configured" });
  }

  if (!ENGAGEMENT_TYPES.includes(engagementType)) {
    return res.status(400).json({ message: "Invalid engagement type" });
  }

  const owner = await db.User.findByPk(req.user.id);
  if (!owner) {
    return res.status(401).json({ message: "User not found" });
  }
  if (!owner.telegramUserId) {
    return res.status(400).json({ message: "Log in with Telegram and connect your channel in Settings" });
  }
  if (!owner.telegramActingChannelId) {
    return res
      .status(400)
      .json({ message: "Connect your Telegram channel in Settings before creating a campaign" });
  }

  let finalMessageUrl = messageUrl;
  let key;

  if (engagementType === "subscribe") {
    const selectedChannelId = String(owner.telegramActingChannelId);
    const channelInfo = await tg.getChat(selectedChannelId).catch(() => null);
    if (!channelInfo || !channelInfo.id) {
      return res.status(400).json({ message: "Could not load your connected channel from Telegram" });
    }
    if (!channelInfo.username) {
      return res.status(400).json({
        message:
          "Subscribe campaigns require a public channel username. Set one in Telegram (e.g. @mychannel), then try again."
      });
    }
    if (channelUrl && typeof channelUrl === "string" && tg.isLikelyTelegramMessageUrl(channelUrl)) {
      const parsedChannel = tg.parseTmeMessageUrl(channelUrl);
      if (parsedChannel && parsedChannel.kind === "public" && parsedChannel.messageId) {
        return res.status(400).json({ message: "Subscribe campaigns need a channel link, not a post link" });
      }
    }
    finalMessageUrl = `https://t.me/${channelInfo.username}`;
    key = `sub_${selectedChannelId}`;
  } else {
    if (!messageUrl || typeof messageUrl !== "string" || !tg.isLikelyTelegramMessageUrl(messageUrl)) {
      return res
        .status(400)
        .json({ message: "messageUrl is required and must be a t.me/… post link in your channel" });
    }
    const parsed = tg.parseTmeMessageUrl(messageUrl);
    if (!parsed) {
      return res
        .status(400)
        .json({ message: "Could not parse t.me post link. Use: https://t.me/channel/123 or t.me/c/.../…" });
    }
    const resolved = await tg
      .resolveChannelChatIdFromTme(parsed, String(owner.telegramActingChannelId))
      .catch(() => null);
    if (resolved == null) {
      return res.status(400).json({ message: "Could not resolve channel for this post link" });
    }
    if (resolved.error) {
      return res.status(400).json({ message: resolved.error });
    }
    if (!resolved.chatId) {
      return res.status(400).json({ message: "Invalid Telegram link" });
    }
    if (String(resolved.chatId) !== String(owner.telegramActingChannelId)) {
      return res
        .status(400)
        .json({ message: "The post must belong to the same channel you connected in Settings" });
    }
    key = tg.stableKeyFromTmeMessage(parsed) || stableKeyFromUrl(messageUrl);
  }

  const isOwnerAdmin = await tg
    .isUserChannelAdminOrCreator(String(owner.telegramActingChannelId), String(owner.telegramUserId))
    .catch(() => false);
  if (!isOwnerAdmin) {
    return res.status(403).json({ message: "You must be an admin of the connected channel" });
  }

  const totalBudget = creditsPerEngagement * maxEngagements;
  const campaignName = normalizeCampaignName(name);
  const scheduledLaunchAt = parseOptionalSchedule(scheduleRaw);
  const now = new Date();
  const launchesLater = scheduledLaunchAt && scheduledLaunchAt > now;
  const status = launchesLater ? "pending" : "active";

  if (owner.credits < totalBudget) {
    return res.status(400).json({
      message: `Insufficient credits — this campaign needs ${totalBudget} upfront (${creditsPerEngagement} × ${maxEngagements} slots) but you have ${owner.credits}.`,
      required: totalBudget,
      balance: owner.credits
    });
  }

  const createdCampaign = await sequelize.transaction(async (transaction) => {
    const campaign = await db.Campaign.create(
      {
        userId: req.user.id,
        name: campaignName,
        messageKey: key,
        messageUrl: finalMessageUrl,
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
      messageUrl: campaign.messageUrl,
      soundcloudPostUrl: campaign.messageUrl,
      messageKey: campaign.messageKey,
      soundcloudPostId: campaign.messageKey,
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
      const campaign = await db.Campaign.findOne({ where: { id, userId: req.user.id }, transaction });
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
