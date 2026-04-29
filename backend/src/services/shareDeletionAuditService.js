const { Op } = require("sequelize");
const db = require("../models");
const sequelize = require("../config/database");
const { runBridge } = require("./telegramMtprotoService");
const { decrypt } = require("../utils/crypto");
const { reverseEarnCredits, refundCredits } = require("./creditService");

function parseShareMeta(metaEngagementId) {
  const raw = String(metaEngagementId || "");
  const m = /^tg-share-\d+--(.+)--(\d+)--(.+)--(\d+)$/.exec(raw);
  if (!m) return null;
  return {
    sourceChat: decodeURIComponent(m[1]),
    sourceMessageId: Number(m[2]),
    destinationChat: decodeURIComponent(m[3]),
    forwardedMessageId: Number(m[4])
  };
}

function parseStoredMtprotoCredentials(user) {
  if (!user?.userOAuthTokenEncrypted) return null;
  try {
    const raw = decrypt(user.userOAuthTokenEncrypted);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.apiId || !parsed.apiHash) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseStoredSessionString(user) {
  if (!user?.userActingTokenEncrypted) return null;
  try {
    return decrypt(user.userActingTokenEncrypted);
  } catch {
    return null;
  }
}

async function auditShareDeletions() {
  const rows = await db.Engagement.findAll({
    where: {
      actionKind: "share",
      verificationStatus: "verified",
      metaEngagementId: { [Op.like]: "tg-share-%" }
    },
    include: [
      { model: db.Task, as: "task", required: true, where: { status: "completed" } },
      {
        model: db.Campaign,
        as: "campaign",
        required: true,
        where: { engagementType: "share", status: { [Op.ne]: "paused" } }
      },
      {
        model: db.User,
        as: "user",
        required: true,
        attributes: ["id", "credits", "dailyEarnedAt", "dailyEarnedCredits", "userOAuthTokenEncrypted", "userActingTokenEncrypted"]
      }
    ],
    order: [["id", "DESC"]],
    limit: 500
  });

  let reversed = 0;
  for (const e of rows) {
    const parsed = parseShareMeta(e.metaEngagementId);
    if (!parsed) continue;
    const creds = parseStoredMtprotoCredentials(e.user);
    const sessionString = parseStoredSessionString(e.user);
    if (!creds || !sessionString) continue;

    let exists = true;
    try {
      const out = await runBridge("message_exists", {
        apiId: creds.apiId,
        apiHash: creds.apiHash,
        proxy: creds.proxy || null,
        sessionString,
        chat: parsed.destinationChat,
        msgId: parsed.forwardedMessageId
      });
      exists = Boolean(out?.exists);
    } catch {
      continue;
    }
    if (exists) continue;

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
        if (fresh.actionKind !== "share") return;
        if (!fresh.task || fresh.task.status !== "completed") return;
        if (!fresh.campaign || fresh.campaign.status === "paused") return;

        const amount = fresh.task.rewardCredits;
        const reversal = await reverseEarnCredits({
          userId: fresh.userId,
          amount,
          reason: `Auto-reversal: deleted repost on campaign #${fresh.campaignId} (task #${fresh.taskId})`,
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
            reason: `Auto-refund: worker deleted repost on campaign #${fresh.campaignId}`,
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
        if (fresh.campaign?.messageKey) {
          await db.UserPostAction.destroy({
            where: {
              userId: fresh.userId,
              postKey: String(fresh.campaign.messageKey),
              actionKind: "share"
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
      // continue remaining rows
    }
  }

  return { scanned: rows.length, reversed };
}

module.exports = { auditShareDeletions };
