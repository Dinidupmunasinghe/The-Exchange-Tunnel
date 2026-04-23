const { Op } = require("sequelize");
const db = require("../models");
const sequelize = require("../config/database");
const tg = require("./telegramService");
const { reverseEarnCredits, refundCredits } = require("./creditService");

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

/**
 * Periodically checks verified subscribe engagements.
 * If a worker unsubscribed, reverse earned credits and refund campaign owner, then reopen task.
 * Campaigns paused by owners are excluded from auditing.
 */
async function auditSubscribeEngagements() {
  if (!tg.isConfigured()) return { scanned: 0, reversed: 0 };

  const rows = await db.Engagement.findAll({
    where: {
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
    limit: 500
  });

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

        const amount = fresh.task.rewardCredits;
        const reversal = await reverseEarnCredits({
          userId: fresh.userId,
          amount,
          reason: `Auto-reversal: unsubscribed from channel on campaign #${fresh.campaignId} (task #${fresh.taskId})`,
          referenceType: "task",
          referenceId: fresh.taskId,
          beneficiaryUserId: fresh.campaign.userId,
          transaction
        });
        const collected = Number(reversal?.collected || 0);
        if (collected > 0) {
          await refundCredits({
            userId: fresh.campaign.userId,
            amount: collected,
            reason: `Auto-refund: worker unsubscribed from campaign #${fresh.campaignId}`,
            referenceType: "campaign",
            referenceId: fresh.campaignId,
            transaction
          });
        }

        fresh.task.status = "open";
        fresh.task.assignedUserId = null;
        fresh.task.assignedAt = null;
        fresh.task.completedAt = null;
        await fresh.task.save({ transaction });

        await fresh.destroy({ transaction });

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

module.exports = { auditSubscribeEngagements };

