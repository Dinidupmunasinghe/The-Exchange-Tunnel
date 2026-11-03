const { Op } = require("sequelize");
const db = require("../models");
const auditCursor = require("./auditCursor");
const sequelize = require("../config/database");
const tg = require("./telegramService");
const { revertEngagement } = require("./engagementRevertService");

/**
 * Channel of a comment campaign, derived from the campaign's post link.
 * (Comment engagements are stored as "tg-com-…", so the old "tg-mem-…" parse never matched
 * and this audit silently did nothing.)
 */
async function resolveCampaignChannelId(campaign, cache) {
  const url = String(campaign?.messageUrl || "");
  if (cache.has(url)) return cache.get(url);
  let chatId = null;
  const parsed = tg.parseTmeMessageUrl(url);
  if (parsed) {
    const resolved = await tg.resolveChannelChatIdFromTme(parsed, null).catch(() => null);
    if (resolved && !resolved.error && resolved.chatId) chatId = String(resolved.chatId);
  }
  cache.set(url, chatId);
  return chatId;
}

/**
 * Best-effort periodic audit for comment engagements.
 * Mirrors subscribe audit behavior: if worker is no longer a member of the channel,
 * reverse worker credits, refund campaign owner, and reopen the task.
 */
async function auditCommentMembershipEngagements() {
  if (!tg.isConfigured()) return { scanned: 0, reversed: 0 };

  const cursor = await auditCursor.get("commentMembership");
  const rows = await db.Engagement.findAll({
    where: {
      ...auditCursor.where(cursor),
      actionKind: "comment",
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
          engagementType: { [Op.in]: ["comment", "like_comment"] },
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
  await auditCursor.advance("commentMembership", rows);

  let reversed = 0;
  const channelCache = new Map();
  for (const e of rows) {
    const workerTelegramId = e.user?.telegramUserId ? String(e.user.telegramUserId) : null;
    if (!workerTelegramId) continue;

    const channelId = await resolveCampaignChannelId(e.campaign, channelCache);
    if (!channelId) continue;

    const detail = await tg.getUserChatMemberStatus(String(channelId), workerTelegramId);
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
        if (fresh.actionKind !== "comment") return;
        if (!fresh.task || fresh.task.status !== "completed") return;
        if (!fresh.campaign || fresh.campaign.status === "paused") return;

        await revertEngagement({
          engagement: fresh,
          reason: `Auto-reversal: left channel after comment on campaign #${fresh.campaignId} (task #${fresh.taskId})`,
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

module.exports = { auditCommentMembershipEngagements };
