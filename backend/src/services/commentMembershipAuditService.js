const { Op } = require("sequelize");
const db = require("../models");
const sequelize = require("../config/database");
const tg = require("./telegramService");
const { reverseEarnCredits, refundCredits } = require("./creditService");

function parseChannelIdFromMeta(metaEngagementId) {
  const raw = String(metaEngagementId || "");
  const m = /^tg-mem-\d+-(-?\d+)$/.exec(raw);
  return m ? m[1] : null;
}

/**
 * Best-effort periodic audit for comment engagements.
 * Mirrors subscribe audit behavior: if worker is no longer a member of the channel,
 * reverse worker credits, refund campaign owner, and reopen the task.
 */
async function auditCommentMembershipEngagements() {
  if (!tg.isConfigured()) return { scanned: 0, reversed: 0 };

  const rows = await db.Engagement.findAll({
    where: {
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
    limit: 500
  });

  let reversed = 0;
  for (const e of rows) {
    const workerTelegramId = e.user?.telegramUserId ? String(e.user.telegramUserId) : null;
    if (!workerTelegramId) continue;

    const channelId = parseChannelIdFromMeta(e.metaEngagementId);
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

        const amount = fresh.task.rewardCredits;
        await reverseEarnCredits({
          userId: fresh.userId,
          amount,
          reason: `Auto-reversal: left channel after comment on campaign #${fresh.campaignId} (task #${fresh.taskId})`,
          referenceType: "task",
          referenceId: fresh.taskId,
          transaction
        });
        await refundCredits({
          userId: fresh.campaign.userId,
          amount,
          reason: `Auto-refund: worker left channel after comment on campaign #${fresh.campaignId}`,
          referenceType: "campaign",
          referenceId: fresh.campaignId,
          transaction
        });

        fresh.task.status = "open";
        fresh.task.assignedUserId = null;
        fresh.task.assignedAt = null;
        fresh.task.completedAt = null;
        await fresh.task.save({ transaction });

        await fresh.destroy({ transaction });
        if (fresh.campaign?.messageKey) {
          await db.UserPostAction.destroy({
            where: {
              userId: fresh.userId,
              postKey: String(fresh.campaign.messageKey),
              actionKind: "comment"
            },
            transaction
          });
        }

        if (fresh.campaign.status === "completed") {
          fresh.campaign.status = "active";
          await fresh.campaign.save({ transaction });
        }
      });
      reversed += 1;
    } catch {
      // continue scanning remaining rows
    }
  }

  return { scanned: rows.length, reversed };
}

module.exports = { auditCommentMembershipEngagements };
