const { Op } = require("sequelize");
const db = require("../models");
const sequelize = require("../config/database");
const tg = require("../services/telegramService");
const { spendCredits } = require("../services/creditService");

function stableKeyFromUrl(url) {
  const crypto = require("crypto");
  const h = crypto.createHash("sha256").update(String(url || "").trim()).digest("hex").slice(0, 48);
  return `tg_${h}`;
}

async function resolveRepostCredits(subscribers) {
  const count = Math.max(0, Number(subscribers) || 0);
  const rules = await db.RepostPricingRule.findAll({
    where: { isActive: true },
    order: [
      ["minSubscribers", "DESC"],
      ["id", "DESC"]
    ]
  });
  const matched = rules.find(
    (r) => count >= Number(r.minSubscribers || 0) && (r.maxSubscribers == null || count <= Number(r.maxSubscribers))
  );
  return matched ? Number(matched.credits || 0) : null;
}

async function listRepostChannels(req, res) {
  const users = await db.User.findAll({
    where: {
      isActive: true,
      id: { [Op.ne]: req.user.id },
      telegramActingChannelId: { [Op.ne]: null }
    },
    attributes: ["id", "telegramActingChannelId", "telegramActingChannelTitle"],
    order: [["id", "DESC"]],
    limit: 300
  });

  const channels = [];
  for (const u of users) {
    const channelId = String(u.telegramActingChannelId || "");
    if (!channelId) continue;
    let title = u.telegramActingChannelTitle || null;
    let subscribers = 0;
    let imageUrl = null;
    try {
      const [chat, count, photo] = await Promise.all([
        tg.getChat(channelId).catch(() => null),
        tg.getChatMemberCount(channelId).catch(() => 0),
        tg.getChatPhotoUrl(channelId).catch(() => null)
      ]);
      if (chat?.title) title = String(chat.title);
      subscribers = Number(count || 0);
      imageUrl = photo || null;
    } catch {
      // best-effort: use stored title only
    }
    const credits = await resolveRepostCredits(subscribers);
    channels.push({
      userId: u.id,
      channelId,
      channelName: title || "Untitled channel",
      subscribers,
      imageUrl,
      credits
    });
  }

  return res.json({ channels });
}

async function requestRepost(req, res) {
  const targetUserId = Number(req.body.targetUserId);
  const messageUrl = String(req.body.messageUrl || "").trim();
  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    return res.status(400).json({ message: "Invalid targetUserId" });
  }
  if (!messageUrl || !tg.isLikelyTelegramMessageUrl(messageUrl)) {
    return res.status(400).json({ message: "messageUrl must be a valid t.me post URL" });
  }

  const owner = await db.User.findByPk(req.user.id);
  if (!owner) return res.status(404).json({ message: "User not found" });
  const parsed = tg.parseTmeMessageUrl(messageUrl);
  if (!parsed) return res.status(400).json({ message: "Could not parse t.me message URL" });
  const resolved = await tg.resolveChannelChatIdFromTme(parsed, null).catch(() => null);
  if (!resolved || resolved.error || !resolved.chatId) {
    return res.status(400).json({ message: resolved?.error || "Could not resolve source channel for this post" });
  }

  const target = await db.User.findByPk(targetUserId, {
    attributes: ["id", "isActive", "telegramActingChannelId", "telegramActingChannelTitle"]
  });
  if (!target || !target.isActive || !target.telegramActingChannelId) {
    return res.status(404).json({ message: "Target channel user is not available" });
  }
  if (target.id === req.user.id) {
    return res.status(400).json({ message: "Cannot request repost from your own channel" });
  }

  const [subscribers, chatTitle] = await Promise.all([
    tg.getChatMemberCount(String(target.telegramActingChannelId)).catch(() => 0),
    tg.getChat(String(target.telegramActingChannelId)).then((x) => x?.title || null).catch(() => null)
  ]);
  const credits = await resolveRepostCredits(Number(subscribers || 0));
  if (!credits || credits < 1) {
    return res.status(400).json({ message: "No active repost pricing rule matches this channel size" });
  }
  if (Number(owner.credits || 0) < credits) {
    return res.status(400).json({
      message: `Insufficient credits. Repost request costs ${credits} credits but you have ${owner.credits}.`,
      required: credits,
      balance: Number(owner.credits || 0)
    });
  }

  const key = tg.stableKeyFromTmeMessage(parsed) || stableKeyFromUrl(messageUrl);
  const created = await sequelize.transaction(async (transaction) => {
    const campaign = await db.Campaign.create(
      {
        userId: req.user.id,
        name: `Repost request to ${chatTitle || target.telegramActingChannelTitle || `channel #${target.id}`}`.slice(0, 160),
        messageKey: key,
        messageUrl,
        engagementType: "share",
        creditsPerEngagement: credits,
        maxEngagements: 1,
        status: "active"
      },
      { transaction }
    );
    const task = await db.Task.create(
      {
        campaignId: campaign.id,
        assignedUserId: target.id,
        engagementType: "share",
        rewardCredits: credits,
        status: "assigned",
        assignedAt: new Date()
      },
      { transaction }
    );
    await spendCredits({
      userId: req.user.id,
      amount: credits,
      reason: `Budget locked for repost request campaign #${campaign.id}`,
      referenceType: "campaign",
      referenceId: campaign.id,
      transaction
    });
    return { campaign, task };
  });

  return res.status(201).json({
    message: "Repost request sent",
    campaign: created.campaign,
    task: created.task,
    chargedCredits: credits
  });
}

async function listRepostRequests(req, res) {
  const type = String(req.query.type || "received").trim().toLowerCase();
  if (!["received", "sent"].includes(type)) {
    return res.status(400).json({ message: "type must be received or sent" });
  }

  if (type === "received") {
    const tasks = await db.Task.findAll({
      where: { engagementType: "share", assignedUserId: req.user.id },
      include: [
        {
          model: db.Campaign,
          as: "campaign",
          required: true,
          attributes: ["id", "name", "messageUrl", "creditsPerEngagement", "status", "createdAt", "userId"],
          include: [{ model: db.User, as: "owner", attributes: ["id", "name", "email"] }]
        }
      ],
      order: [["id", "DESC"]],
      limit: 200
    });
    const requests = tasks.map((t) => ({
      id: t.id,
      campaignId: t.campaignId,
      status: t.status,
      rewardCredits: Number(t.rewardCredits || 0),
      createdAt: t.createdAt,
      campaign: t.campaign
    }));
    return res.json({ requests, type });
  }

  const campaigns = await db.Campaign.findAll({
    where: { userId: req.user.id, engagementType: "share" },
    include: [
      {
        model: db.Task,
        as: "tasks",
        required: false,
        include: [{ model: db.User, as: "assignee", attributes: ["id", "name", "email", "telegramActingChannelTitle"] }]
      }
    ],
    order: [["id", "DESC"]],
    limit: 200
  });
  const requests = campaigns.map((c) => {
    const task = Array.isArray(c.tasks) && c.tasks.length > 0 ? c.tasks[0] : null;
    return {
      id: c.id,
      campaignId: c.id,
      status: c.status,
      rewardCredits: Number(c.creditsPerEngagement || 0),
      createdAt: c.createdAt,
      campaign: {
        id: c.id,
        name: c.name,
        messageUrl: c.messageUrl,
        creditsPerEngagement: c.creditsPerEngagement,
        status: c.status
      },
      assignee: task?.assignee || null,
      taskStatus: task?.status || null
    };
  });
  return res.json({ requests, type });
}

module.exports = {
  listRepostChannels,
  requestRepost,
  listRepostRequests
};
