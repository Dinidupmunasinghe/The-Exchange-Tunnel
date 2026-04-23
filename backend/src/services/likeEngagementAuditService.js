const { Op } = require("sequelize");
const db = require("../models");
const sequelize = require("../config/database");
const { runBridge } = require("./telegramMtprotoService");
const { decrypt } = require("../utils/crypto");
const { reverseEarnCredits, refundCredits } = require("./creditService");
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
  const rows = await db.Engagement.findAll({
    where: {
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
    limit: 500
  });

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

        const amount = fresh.task.rewardCredits;
        const reversal = await reverseEarnCredits({
          userId: fresh.userId,
          amount,
          reason: `Auto-reversal: removed like on campaign #${fresh.campaignId} (task #${fresh.taskId})`,
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
            reason: `Auto-refund: worker removed like on campaign #${fresh.campaignId}`,
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
              actionKind: "like"
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

module.exports = { auditLikeEngagements };
