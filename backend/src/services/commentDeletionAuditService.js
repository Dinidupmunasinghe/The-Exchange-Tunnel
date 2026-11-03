const { Op } = require("sequelize");
const db = require("../models");
const auditCursor = require("./auditCursor");
const sequelize = require("../config/database");
const { runBridge } = require("./telegramMtprotoService");
const { decrypt } = require("../utils/crypto");
const { revertEngagement } = require("./engagementRevertService");
const tg = require("./telegramService");

function parseCommentMeta(metaEngagementId) {
  const raw = String(metaEngagementId || "");
  const v3 = /^tg-com-\d+--(.+)--(\d+)--(.+)$/.exec(raw);
  if (v3) {
    return {
      commentChatId: decodeURIComponent(v3[1]),
      commentMessageId: Number(v3[2]),
      commentChatAccessHash: decodeURIComponent(v3[3] || "")
    };
  }
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
  const cursor = await auditCursor.get("commentDeletion");
  const rows = await db.Engagement.findAll({
    where: {
      ...auditCursor.where(cursor),
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
    limit: auditCursor.BATCH_SIZE
  });
  await auditCursor.advance("commentDeletion", rows);

  let reversed = 0;
  for (const e of rows) {
    const parsed = parseCommentMeta(e.metaEngagementId);
    if (!parsed) continue;
    const creds = parseStoredMtprotoCredentials(e.user);
    const sessionString = parseStoredSessionString(e.user);
    if (!creds || !sessionString) continue;

    let exists = true;
    try {
      const chatCandidates = [
        parsed.commentChatAccessHash
          ? { chatId: String(parsed.commentChatId), accessHash: String(parsed.commentChatAccessHash) }
          : null,
        String(parsed.commentChatId)
      ].filter(Boolean);
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

        await revertEngagement({
          engagement: fresh,
          reason: `Auto-reversal: deleted comment on campaign #${fresh.campaignId} (task #${fresh.taskId})`,
          transaction
        });
      });
      reversed += 1;
    } catch {
      // continue remaining rows
    }
  }

  return { scanned: rows.length, reversed };
}

module.exports = { auditCommentDeletions };
