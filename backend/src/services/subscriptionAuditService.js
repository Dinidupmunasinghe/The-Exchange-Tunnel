const { Op } = require("sequelize");
const db = require("../models");
const auditCursor = require("./auditCursor");
const sequelize = require("../config/database");
const tg = require("./telegramService");
const { revertEngagement } = require("./engagementRevertService");

function parseTmeChannelUsername(url) {
  try {
    const u = new URL(String(url || "").trim());
    const host = (u.hostname || "").toLowerCase().replace(/^www\./, "");
    if (host !== "t.me") return null;
    const parts = (u.pathname || "/").split("/").filter(Boolean);
    if (!parts[0] || parts[0] === "c") return null;
    if (parts.length === 1) return parts[0].replace(/^@/, "");
    return null;
  } catch {
    return null;
  }
}

function parseChannelIdFromSubscriptionKey(channelKey) {
  const raw = String(channelKey || "");
  const m = /^sub_(-?\d+)$/.exec(raw);
  return m ? String(m[1]) : null;
}

/**
 * Periodically checks verified subscribe engagements.
 * If a worker unsubscribed, reverse earned credits and refund campaign owner, then reopen task.
 * Campaigns paused by owners are excluded from auditing.
 */
async function auditSubscribeEngagements() {
  if (!tg.isConfigured()) return { scanned: 0, reversed: 0 };

  const cursor = await auditCursor.get("subscribe");
  const rows = await db.Engagement.findAll({
    where: {
      ...auditCursor.where(cursor),
      engagementType: "subscribe",
      verificationStatus: "verified"
    },
    include: [
      {
        model: db.Task,
        as: "task",
        required: true,
        where: { status: "completed" }
      },
      {
        model: db.Campaign,
        as: "campaign",
        required: true,
        where: {
          engagementType: "subscribe",
          status: { [Op.ne]: "paused" }
        }
      },
      {
        model: db.User,
        as: "user",
        required: true,
        attributes: ["id", "telegramUserId", "credits", "dailyEarnedAt", "dailyEarnedCredits"]
      }
    ],
    order: [["id", "DESC"]],
    limit: auditCursor.BATCH_SIZE
  });
  await auditCursor.advance("subscribe", rows);

  let reversed = 0;
  for (const e of rows) {
    const workerTelegramId = e.user?.telegramUserId ? String(e.user.telegramUserId) : null;
    if (!workerTelegramId) continue;

    const username = parseTmeChannelUsername(e.campaign?.messageUrl);
    if (!username) continue;
    const chat = await tg.getChat(`@${username}`).catch(() => null);
    if (!chat || chat.id == null) continue;

    const detail = await tg.getUserChatMemberStatus(String(chat.id), workerTelegramId);
    if (detail.ok) continue;

    try {
      await sequelize.transaction(async (transaction) => {
        const fresh = await db.Engagement.findByPk(e.id, {
          transaction,
          lock: true,
          include: [
            { model: db.Task, as: "task", required: true },
            { model: db.Campaign, as: "campaign", required: true }
          ]
        });
        if (!fresh) return;
        if (fresh.engagementType !== "subscribe") return;
        if (!fresh.task || fresh.task.status !== "completed") return;
        if (!fresh.campaign || fresh.campaign.status === "paused") return;

        await revertEngagement({
          engagement: fresh,
          reason: `Auto-reversal: unsubscribed from channel on campaign #${fresh.campaignId} (task #${fresh.taskId})`,
          transaction
        });
      });
      reversed += 1;
    } catch {
      // continue scanning remaining rows
    }
  }

  return { scanned: rows.length, reversed };
}

/**
 * Keeps cross-campaign subscription memory accurate.
 * If user unsubscribed, remove stale memory so UI no longer shows "Subscribed".
 */
async function auditSubscriptionMemory() {
  if (!tg.isConfigured()) return { scanned: 0, cleared: 0 };

  const cursor = await auditCursor.get("subscriptionMemory");
  const rows = await db.UserSubscriptionMemory.findAll({
    where: auditCursor.where(cursor),
    include: [{ model: db.User, as: "user", required: true, attributes: ["id", "telegramUserId"] }],
    order: [["id", "DESC"]],
    limit: auditCursor.BATCH_SIZE
  });
  await auditCursor.advance("subscriptionMemory", rows);

  let cleared = 0;
  for (const row of rows) {
    const workerTelegramId = row.user?.telegramUserId ? String(row.user.telegramUserId) : null;
    if (!workerTelegramId) continue;
    const channelId = parseChannelIdFromSubscriptionKey(row.channelKey);
    if (!channelId) continue;

    const detail = await tg.getUserChatMemberStatus(channelId, workerTelegramId);
    if (detail.ok) continue;

    try {
      await db.UserSubscriptionMemory.destroy({ where: { id: row.id } });
      cleared += 1;
    } catch {
      // continue scanning remaining rows
    }
  }

  return { scanned: rows.length, cleared };
}

module.exports = { auditSubscribeEngagements, auditSubscriptionMemory };

