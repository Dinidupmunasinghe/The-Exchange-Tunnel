const { Op } = require("sequelize");
const db = require("../models");
const sequelize = require("../config/database");
const { runBridge } = require("./telegramMtprotoService");
const { decrypt } = require("../utils/crypto");
const { reverseEarnCredits, refundCredits } = require("./creditService");
const tg = require("./telegramService");

function parseCommentMeta(metaEngagementId) {
  const raw = String(metaEngagementId || "");
  const v2 = /^tg-com-\d+--(.+)--(\d+)$/.exec(raw);
  if (v2) {
    return { commentChatId: decodeURIComponent(v2[1]), commentMessageId: Number(v2[2]) };
  }
  const v1 = /^tg-com-\d+-(-?\d+)-(\d+)-(\d+)$/.exec(raw);
  if (v1) {
    return { commentChatId: String(v1[1]), commentMessageId: Number(v1[3]) };
  }
  return null;
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

async function auditCommentDeletions() {
  const rows = await db.Engagement.findAll({
    where: {
      actionKind: "comment",
      verificationStatus: "verified",
      metaEngagementId: { [Op.like]: "tg-com-%" }
    },
    include: [
      { model: db.Task, as: "task", required: true, where: { status: "completed" } },
      {
        model: db.Campaign,
        as: "campaign",
        required: true,
        where: { engagementType: { [Op.in]: ["comment", "like_comment"] }, status: { [Op.ne]: "paused" } }
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
    const parsed = parseCommentMeta(e.metaEngagementId);
    if (!parsed) continue;
    const creds = parseStoredMtprotoCredentials(e.user);
    const sessionString = parseStoredSessionString(e.user);
    if (!creds || !sessionString) continue;

    let exists = true;
    try {
      const chatCandidates = [String(parsed.commentChatId)];
      let lastErr = null;
      for (const chatRef of chatCandidates) {
        try {
          const out = await runBridge("message_exists", {
            apiId: creds.apiId,
            apiHash: creds.apiHash,
            proxy: creds.proxy || null,
            sessionString,
            chat: chatRef,
            msgId: parsed.commentMessageId
          });
          exists = Boolean(out?.exists);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (lastErr) throw lastErr;
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
        if (fresh.actionKind !== "comment") return;
        if (!fresh.task || fresh.task.status !== "completed") return;
        if (!fresh.campaign || fresh.campaign.status === "paused") return;

        const amount = fresh.task.rewardCredits;
        await reverseEarnCredits({
          userId: fresh.userId,
          amount,
          reason: `Auto-reversal: deleted comment on campaign #${fresh.campaignId} (task #${fresh.taskId})`,
          referenceType: "task",
          referenceId: fresh.taskId,
          transaction
        });
        await refundCredits({
          userId: fresh.campaign.userId,
          amount,
          reason: `Auto-refund: worker deleted comment on campaign #${fresh.campaignId}`,
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

module.exports = { auditCommentDeletions };
