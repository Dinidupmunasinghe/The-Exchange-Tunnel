const { Op } = require("sequelize");
const db = require("../models");
const auditCursor = require("./auditCursor");
const sequelize = require("../config/database");
const { runBridge } = require("./telegramMtprotoService");
const { decrypt } = require("../utils/crypto");
const { revertEngagement } = require("./engagementRevertService");
const tg = require("./telegramService");

function parseLikeMeta(metaEngagementId) {
  const raw = String(metaEngagementId || "");
  const m = /^tg-like-\d+-(-?\d+)-(\d+)(?:--(.+))?$/.exec(raw);
  if (!m) return null;
  const reaction = (() => {
    if (!m[3]) return "👍";
    try {
      return decodeURIComponent(m[3]);
    } catch {
      return "👍";
    }
  })();
  return { channelId: String(m[1]), messageId: Number(m[2]), reaction };
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

async function auditLikeEngagements() {
  const cursor = await auditCursor.get("like");
  const rows = await db.Engagement.findAll({
    where: {
      ...auditCursor.where(cursor),
      actionKind: "like",
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
          engagementType: { [Op.in]: ["like", "like_comment"] },
          status: { [Op.ne]: "paused" }
        }
      },
      {
        model: db.User,
        as: "user",
        required: true,
        attributes: [
          "id",
          "credits",
          "dailyEarnedAt",
          "dailyEarnedCredits",
          "userOAuthTokenEncrypted",
          "userActingTokenEncrypted"
        ]
      }
    ],
    order: [["id", "DESC"]],
    limit: auditCursor.BATCH_SIZE
  });
  await auditCursor.advance("like", rows);

  let reversed = 0;
  for (const e of rows) {
    const parsed = parseLikeMeta(e.metaEngagementId);
    if (!parsed) continue;

    const creds = parseStoredMtprotoCredentials(e.user);
    const sessionString = parseStoredSessionString(e.user);
    if (!creds || !sessionString) continue;

    let stillChosen = false;
    let verificationKnown = false;
    try {
      const msgUrl = e.campaign?.messageUrl || e.campaign?.soundcloudPostUrl || "";
      const parsedMessage = tg.parseTmeMessageUrl(String(msgUrl || ""));
      const chatCandidates = [];
      if (parsedMessage?.kind === "public" && parsedMessage?.username) {
        chatCandidates.push(`@${String(parsedMessage.username).replace(/^@/, "")}`);
      }
      chatCandidates.push(String(parsed.channelId));
      let lastErr = null;
      for (const chatRef of chatCandidates) {
        try {
          const out = await runBridge("verify_reaction", {
            apiId: creds.apiId,
            apiHash: creds.apiHash,
            proxy: creds.proxy || null,
            sessionString,
            chat: chatRef,
            msgId: parsed.messageId,
            reaction: parsed.reaction || "👍"
          });
          stillChosen = Boolean(out?.chosen);
          verificationKnown = Boolean(out?.known);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (lastErr) throw lastErr;
    } catch {
      // Skip this row when Telegram/bridge errors occur.
      continue;
    }
    if (!verificationKnown) {
      // Telegram response shape couldn't reliably tell if current user removed reaction.
      continue;
    }
    if (stillChosen) continue;

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
        if (fresh.actionKind !== "like") return;
        if (!fresh.task || fresh.task.status !== "completed") return;
        if (!fresh.campaign || fresh.campaign.status === "paused") return;

        await revertEngagement({
          engagement: fresh,
          reason: `Auto-reversal: removed like on campaign #${fresh.campaignId} (task #${fresh.taskId})`,
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

module.exports = { auditLikeEngagements };
