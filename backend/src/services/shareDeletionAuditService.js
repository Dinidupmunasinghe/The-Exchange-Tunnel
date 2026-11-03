const { Op } = require("sequelize");
const db = require("../models");
const auditCursor = require("./auditCursor");
const sequelize = require("../config/database");
const { runBridge } = require("./telegramMtprotoService");
const { decrypt } = require("../utils/crypto");
const { revertEngagement } = require("./engagementRevertService");

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
  const cursor = await auditCursor.get("shareDeletion");
  const rows = await db.Engagement.findAll({
    where: {
      ...auditCursor.where(cursor),
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
    limit: auditCursor.BATCH_SIZE
  });
  await auditCursor.advance("shareDeletion", rows);

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

        await revertEngagement({
          engagement: fresh,
          reason: `Auto-reversal: deleted repost on campaign #${fresh.campaignId} (task #${fresh.taskId})`,
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

module.exports = { auditShareDeletions };
