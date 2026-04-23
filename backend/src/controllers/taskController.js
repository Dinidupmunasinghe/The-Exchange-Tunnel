const { Op } = require("sequelize");
const db = require("../models");
const sequelize = require("../config/database");
const tg = require("../services/telegramService");
const { runBridge } = require("../services/telegramMtprotoService");
const { verifyEngagement } = require("../services/engagementVerification");
const { earnCredits, refundCredits, reverseEarnCredits } = require("../services/creditService");
const { ENGAGEMENT_TYPES, ACTION_KINDS, bundleAllowsAction } = require("../constants/engagement");
const commentDetectionStore = require("../services/commentDetectionStore");
const { decrypt } = require("../utils/crypto");
const crypto = require("crypto");

function runnableCampaignWhere() {
  return {
    [Op.or]: [
      { status: "active" },
      { status: "pending", scheduledLaunchAt: { [Op.lte]: new Date() } }
    ]
  };
}

function requireWorkerTelegramId(user) {
  if (!user?.telegramUserId) {
    const error = new Error("Log in with Telegram to complete tasks");
    error.status = 400;
    throw error;
  }
  return String(user.telegramUserId);
}

function parseTmeChannelUsername(url) {
  try {
    const u = new URL(String(url || "").trim());
    const host = (u.hostname || "").toLowerCase().replace(/^www\./, "");
    if (host !== "t.me") return null;
    const parts = (u.pathname || "/").split("/").filter(Boolean);
    if (!parts[0] || parts[0] === "c") return null;
    // Channel root link: https://t.me/<username>
    if (parts.length === 1) return parts[0].replace(/^@/, "");
    return null;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function parseLikeMeta(metaEngagementId) {
  const raw = String(metaEngagementId || "");
  const m = /^tg-like-\d+-(-?\d+)-(\d+)(?:--(.+))?$/.exec(raw);
  if (!m) return null;
  return { channelId: String(m[1]), messageId: Number(m[2]) };
}

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

async function submitTaskCompletion(req, res) {
  const { taskId, engagementType, proofText: proofRaw, actionKind, commentVerifyToken, reaction } = req.body;
  const proofText = typeof proofRaw === "string" ? proofRaw : "";

  if (!ACTION_KINDS.includes(actionKind)) {
    return res.status(400).json({ message: "Invalid action kind" });
  }
  if (!ENGAGEMENT_TYPES.includes(engagementType)) {
    return res.status(400).json({ message: "Invalid engagement type" });
  }
  if (!bundleAllowsAction(engagementType, actionKind)) {
    return res.status(400).json({ message: "This action is not part of this campaign bundle" });
  }
  if (!tg.isConfigured()) {
    return res.status(503).json({ message: "Server: TELEGRAM_BOT_TOKEN is not configured" });
  }

  try {
    const done = await sequelize.transaction(async (transaction) => {
      const task = await db.Task.findByPk(taskId, {
        transaction,
        lock: true,
        include: [{ model: db.Campaign, as: "campaign" }]
      });
      if (!task || task.status === "completed" || task.status === "cancelled") {
        const error = new Error("Task is not available");
        error.status = 404;
        throw error;
      }
      if (task.campaign.userId === req.user.id) {
        const error = new Error("Cannot complete your own campaign task");
        error.status = 400;
        throw error;
      }
      if (task.assignedUserId && task.assignedUserId !== req.user.id) {
        const error = new Error("Task is assigned to another user");
        error.status = 400;
        throw error;
      }
      const c = task.campaign;
      const campaignRunnable =
        c.status !== "paused" &&
        (c.status === "active" || (c.status === "pending" && c.scheduledLaunchAt && new Date(c.scheduledLaunchAt) <= new Date()));
      if (!campaignRunnable) {
        const error = new Error(
          c.status === "paused" ? "Campaign is paused" : "Campaign is not active yet"
        );
        error.status = 400;
        throw error;
      }
      const storedActionKind = actionKind === "subscribe" ? null : actionKind;
      if (engagementType === "subscribe") {
        const channelKey = String(task.campaign?.messageKey || `sub_${String(task.campaignId)}`);
        const prior = await db.UserSubscriptionMemory.findOne({
          where: { userId: req.user.id, channelKey },
          transaction
        });
        if (prior) {
          const error = new Error("You already completed this action for this post");
          error.status = 400;
          throw error;
        }
      } else if (storedActionKind) {
        const postKey = String(task.campaign.messageKey || "");
        if (postKey) {
          const prior = await db.UserPostAction.findOne({
            where: { userId: req.user.id, postKey, actionKind: storedActionKind },
            transaction
          });
          if (prior) {
            const error = new Error("You already completed this action for this post");
            error.status = 400;
            throw error;
          }
        }
      }
      const worker = await db.User.findByPk(req.user.id, { transaction, lock: true });
      if (!worker) {
        const error = new Error("User not found");
        error.status = 404;
        throw error;
      }
      const tUid = requireWorkerTelegramId(worker);
      const msgUrl = c.messageUrl || c.soundcloudPostUrl;
      if (!msgUrl || !tg.isLikelyTelegramMessageUrl(String(msgUrl))) {
        const error = new Error("This campaign is not a Telegram t.me/… link");
        error.status = 400;
        throw error;
      }
      let resolved;
      let parsedMessage = null;
      if (engagementType === "subscribe") {
        const username = parseTmeChannelUsername(String(msgUrl));
        if (!username) {
          const error = new Error("Invalid t.me channel URL on campaign");
          error.status = 400;
          throw error;
        }
        const chat = await tg.getChat(`@${username}`).catch(() => null);
        if (!chat || chat.id == null) {
          const error = new Error("Could not resolve campaign channel");
          error.status = 400;
          throw error;
        }
        resolved = { chatId: String(chat.id), title: chat.title || null };
      } else {
        parsedMessage = tg.parseTmeMessageUrl(String(msgUrl));
        if (!parsedMessage) {
          const error = new Error("Invalid t.me post URL on campaign");
          error.status = 400;
          throw error;
        }
        resolved = await tg.resolveChannelChatIdFromTme(parsedMessage, null);
      }
      if (resolved == null) {
        const error = new Error("Could not resolve this Telegram post");
        error.status = 400;
        throw error;
      }
      if (resolved.error) {
        const error = new Error(resolved.error);
        error.status = 400;
        throw error;
      }
      const channelId = resolved.chatId;
      if (engagementType === "subscribe") {
        const creds = parseStoredMtprotoCredentials(worker);
        const sessionString = parseStoredSessionString(worker);
        if (!creds || !sessionString) {
          const error = new Error(
            "Subscribe requires Telegram user session auth first. Open Settings and complete Telegram user auth."
          );
          error.status = 400;
          throw error;
        }
        const username = parseTmeChannelUsername(String(msgUrl));
        const joinRef = username ? `@${username}` : String(channelId);
        const wasMemberBefore = await tg.getUserChatMemberStatus(String(channelId), tUid);
        if (wasMemberBefore.ok) {
          const error = new Error(
            "This account is already subscribed to the channel. No new subscribe action to reward."
          );
          error.status = 400;
          throw error;
        }
        await runBridge("join_channel", {
          apiId: creds.apiId,
          apiHash: creds.apiHash,
          proxy: creds.proxy || null,
          sessionString,
          channel: joinRef
        });
        let memberCheck = await tg.getUserChatMemberStatus(String(channelId), tUid);
        // Telegram can lag briefly right after subscribe; retry a few times for subscribe campaigns.
        if (!memberCheck.ok) {
          for (let i = 0; i < 3; i += 1) {
            await sleep(1500);
            memberCheck = await tg.getUserChatMemberStatus(String(channelId), tUid);
            if (memberCheck.ok) break;
          }
        }
        if (!memberCheck.ok) {
          const raw = String(memberCheck.error || "").toLowerCase();
          let hint =
            "Open the t.me/… link, subscribe in Telegram, then return here. The bot must be in the channel.";
          if (raw.includes("bot is not a member")) {
            hint = "The bot is not in that channel. Add the bot as an admin to the target channel, then try again.";
          } else if (raw.includes("user not found")) {
            hint = "This Telegram account is not visible in that channel yet. Ensure you subscribed with the same account and retry after 10 seconds.";
          } else if (raw.includes("chat not found")) {
            hint = "Campaign channel could not be found. Ensure the channel is public and still exists.";
          } else if (memberCheck.status === "left" || memberCheck.status === "kicked") {
            hint = "Telegram reports this account is not subscribed to the channel.";
          }
          const error = new Error(
            `Could not confirm your subscription to the target channel. ${hint}`
          );
          error.status = 400;
          throw error;
        }
      }
      if (actionKind === "comment") {
        const commentText = String(proofText || "").trim();
        if (!commentText) {
          const error = new Error(
            "Comment text is required"
          );
          error.status = 400;
          throw error;
        }
        const creds = parseStoredMtprotoCredentials(worker);
        const sessionString = parseStoredSessionString(worker);
        if (!creds || !sessionString) {
          const error = new Error(
            "Comment requires Telegram user session auth first. Open Settings and complete Telegram user auth."
          );
          error.status = 400;
          throw error;
        }
        if (!parsedMessage || !parsedMessage.messageId) {
          const error = new Error("Could not resolve Telegram message id for comment action");
          error.status = 400;
          throw error;
        }
        const chatCandidates = [];
        if (parsedMessage.kind === "public" && parsedMessage.username) {
          chatCandidates.push(`@${String(parsedMessage.username).replace(/^@/, "")}`);
        }
        chatCandidates.push(String(channelId));
        let replied = false;
        let replyMessageId = null;
        let replyChatId = null;
        let replyChatAccessHash = null;
        let lastEntityError = null;
        for (const chatRef of chatCandidates) {
          try {
            const out = await runBridge("reply", {
              apiId: creds.apiId,
              apiHash: creds.apiHash,
              proxy: creds.proxy || null,
              sessionString,
              chat: chatRef,
              msgId: Number(parsedMessage.messageId),
              text: commentText
            });
            replyMessageId = Number(out?.messageId || 0) || null;
            replyChatId = out?.chatId ? String(out.chatId) : null;
            replyChatAccessHash = out?.chatAccessHash ? String(out.chatAccessHash) : null;
            replied = true;
            break;
          } catch (entityErr) {
            const text = String(entityErr?.message || "").toLowerCase();
            const isEntityError =
              text.includes("cannot find any entity corresponding to") ||
              text.includes("could not find the input entity");
            if (!isEntityError) throw entityErr;
            lastEntityError = entityErr;
          }
        }
        if (!replied && lastEntityError) throw lastEntityError;
        if (!replyMessageId) {
          const error = new Error("Failed to publish comment to Telegram");
          error.status = 400;
          throw error;
        }
        req._commentMessageId = replyMessageId;
        req._commentChatId = replyChatId || String(channelId);
        req._commentChatAccessHash = replyChatAccessHash || "";
        req._commentText = commentText;
      }
      if (actionKind === "like") {
        const creds = parseStoredMtprotoCredentials(worker);
        const sessionString = parseStoredSessionString(worker);
        if (!creds || !sessionString) {
          const error = new Error(
            "Like requires Telegram user session auth first. Open Settings and complete Telegram user auth."
          );
          error.status = 400;
          throw error;
        }
        if (!parsedMessage || !parsedMessage.messageId) {
          const error = new Error("Could not resolve Telegram message id for like action");
          error.status = 400;
          throw error;
        }
        const chosenReaction = typeof reaction === "string" && reaction.trim() ? reaction.trim() : "👍";
        try {
          const chatCandidates = [];
          if (parsedMessage.kind === "public" && parsedMessage.username) {
            chatCandidates.push(`@${String(parsedMessage.username).replace(/^@/, "")}`);
          }
          chatCandidates.push(String(channelId));
          let lastEntityError = null;
          let reacted = false;
          for (const chatRef of chatCandidates) {
            try {
              await runBridge("react", {
                apiId: creds.apiId,
                apiHash: creds.apiHash,
                proxy: creds.proxy || null,
                sessionString,
                chat: chatRef,
                msgId: Number(parsedMessage.messageId),
                reaction: chosenReaction
              });
              reacted = true;
              break;
            } catch (entityErr) {
              const text = String(entityErr?.message || "").toLowerCase();
              const isEntityError =
                text.includes("cannot find any entity corresponding to") ||
                text.includes("could not find the input entity");
              if (!isEntityError) throw entityErr;
              lastEntityError = entityErr;
            }
          }
          if (!reacted && lastEntityError) throw lastEntityError;
        } catch (bridgeError) {
          const e = bridgeError;
          const waitSeconds = Number(e?.waitSeconds || 0);
          const code = String(e?.code || "");
          const msg = e instanceof Error ? e.message : "Failed to publish like to Telegram";
          const error = new Error(
            code === "FLOOD_WAIT" && waitSeconds > 0
              ? `Telegram rate limit reached. Retry in about ${waitSeconds}s.`
              : msg
          );
          error.status = code === "FLOOD_WAIT" ? 429 : 400;
          throw error;
        }
      }
      const verifiedViaProvider = true;
      const verification = await verifyEngagement({
        campaign: task.campaign,
        engagementType,
        proofText,
        verifiedViaProvider
      });
      if (!verification.isValid) {
        const error = new Error(`Engagement verification failed: ${verification.reason}`);
        error.status = 400;
        throw error;
      }

      task.assignedUserId = req.user.id;
      task.status = "assigned";
      task.assignedAt = task.assignedAt || new Date();
      await task.save({ transaction });

      const metaId =
        actionKind === "subscribe"
          ? `tg-sub-${tUid}-${channelId}`
          : actionKind === "like" && parsedMessage?.messageId
            ? `tg-like-${tUid}-${channelId}-${Number(parsedMessage.messageId)}--${encodeURIComponent(
              typeof reaction === "string" && reaction.trim() ? reaction.trim() : "👍"
            )}`
            : actionKind === "comment" && req._commentMessageId
              ? `tg-com-${tUid}--${encodeURIComponent(String(req._commentChatId || channelId))}--${Number(
                req._commentMessageId
              )}--${encodeURIComponent(String(req._commentChatAccessHash || ""))}`
            : `tg-mem-${tUid}-${channelId}`;

      const createdEngagement = await db.Engagement.create(
        {
          userId: req.user.id,
          campaignId: task.campaignId,
          taskId: task.id,
          engagementType,
          actionKind: storedActionKind,
          metaEngagementId: metaId,
          verificationStatus: "verified",
          verificationDetails:
            actionKind === "subscribe"
              ? "Telegram: channel membership verified for subscribe campaign"
              : actionKind === "comment"
                ? `Telegram: mtproto comment sent :: ${String(req._commentText || "").slice(0, 160)}`
                : "Telegram: like action recorded after channel check"
        },
        { transaction }
      );
      if (storedActionKind && task.campaign?.messageKey) {
        await db.UserPostAction.upsert(
          {
            userId: req.user.id,
            postKey: String(task.campaign.messageKey),
            actionKind: storedActionKind,
            lastEngagementId: createdEngagement.id,
            details: createdEngagement.verificationDetails || null
          },
          { transaction }
        );
      }
      if (engagementType === "subscribe") {
        const channelKey = String(task.campaign?.messageKey || `sub_${String(channelId)}`);
        await db.UserSubscriptionMemory.upsert(
          {
            userId: req.user.id,
            channelKey,
            lastEngagementId: createdEngagement.id,
            details: createdEngagement.verificationDetails || null
          },
          { transaction }
        );
      }

      task.status = "completed";
      task.completedAt = new Date();
      await task.save({ transaction });

      await earnCredits({
        userId: req.user.id,
        amount: task.rewardCredits,
        reason:
          actionKind === "subscribe"
            ? `Earned from channel subscribe on campaign #${task.campaignId} (task #${task.id})`
            : `Earned from ${actionKind} on campaign #${task.campaignId} (task #${task.id})`,
        referenceType: "task",
        referenceId: task.id,
        transaction
      });
      const completedCount = await db.Task.count({
        where: { campaignId: task.campaignId, status: "completed" },
        transaction
      });
      if (completedCount >= task.campaign.maxEngagements) {
        task.campaign.status = "completed";
        await task.campaign.save({ transaction });
      }
      return task;
    });
    return res.json({ message: "Task completed and credits added", task: done });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || "Could not complete task" });
  }
}

async function getAvailableTasks(req, res) {
  const tasks = await db.Task.findAll({
    where: {
      [Op.or]: [
        {
          status: { [Op.in]: ["open", "assigned"] },
          [Op.or]: [{ assignedUserId: null }, { assignedUserId: req.user.id }]
        },
        { status: "completed", assignedUserId: req.user.id }
      ]
    },
    include: [
      {
        model: db.Campaign,
        as: "campaign",
        required: true,
        where: { userId: { [Op.ne]: req.user.id }, ...runnableCampaignWhere() },
        attributes: [
          "id",
          "name",
          "messageUrl",
          "messageKey",
          "engagementType",
          "creditsPerEngagement",
          "userId",
          "scheduledLaunchAt",
          "status",
          "createdAt",
          "maxEngagements"
        ],
        include: [
          {
            model: db.User,
            as: "owner",
            required: false,
            attributes: ["id", "name", "telegramUserId"]
          }
        ]
      }
    ],
    subQuery: false,
    limit: 200,
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"]
    ]
  });
  const serialized = tasks.map((t) => {
    const o = t.toJSON();
    if (o.campaign) {
      o.campaign.soundcloudPostUrl = o.campaign.messageUrl;
      o.campaign.soundcloudPostId = o.campaign.messageKey;
    }
    return o;
  });
  const campaignIds = [...new Set(tasks.map((t) => t.campaignId))];
  const subscribeCampaigns = tasks
    .map((t) => t.campaign)
    .filter((c) => c && c.engagementType === "subscribe" && c.messageKey)
    .map((c) => ({ id: c.id, channelKey: c.messageKey }));
  const uniqueSubscribeKeys = [...new Set(subscribeCampaigns.map((c) => String(c.channelKey)))];
  const rememberedSubs =
    uniqueSubscribeKeys.length === 0
      ? []
      : await db.UserSubscriptionMemory.findAll({
          where: { userId: req.user.id, channelKey: { [Op.in]: uniqueSubscribeKeys } },
          attributes: ["id", "channelKey", "details"]
        });
  const campaignList = tasks
    .map((t) => t.campaign)
    .filter(Boolean)
    .map((c) => ({ id: c.id, messageKey: c.messageKey }))
    .filter((x) => Boolean(x.messageKey));
  const uniquePostKeys = [...new Set(campaignList.map((c) => String(c.messageKey)))];
  const remembered =
    uniquePostKeys.length === 0
      ? []
      : await db.UserPostAction.findAll({
          where: { userId: req.user.id, postKey: { [Op.in]: uniquePostKeys } },
          attributes: ["id", "postKey", "actionKind", "details"]
        });
  const campaignIdsByPostKey = new Map();
  for (const c of campaignList) {
    const key = String(c.messageKey);
    if (!campaignIdsByPostKey.has(key)) campaignIdsByPostKey.set(key, []);
    campaignIdsByPostKey.get(key).push(Number(c.id));
  }
  const myEngagements = [];
  for (const row of remembered) {
    const ids = campaignIdsByPostKey.get(String(row.postKey)) || [];
    for (const cid of ids) {
      myEngagements.push({
        id: Number(row.id),
        campaignId: cid,
        taskId: 0,
        actionKind: String(row.actionKind),
        verificationDetails: row.details || null,
        metaEngagementId: null
      });
    }
  }
  const subscribeCampaignIdsByKey = new Map();
  for (const c of subscribeCampaigns) {
    const key = String(c.channelKey);
    if (!subscribeCampaignIdsByKey.has(key)) subscribeCampaignIdsByKey.set(key, []);
    subscribeCampaignIdsByKey.get(key).push(Number(c.id));
  }
  for (const row of rememberedSubs) {
    const ids = subscribeCampaignIdsByKey.get(String(row.channelKey)) || [];
    for (const cid of ids) {
      myEngagements.push({
        id: Number(row.id),
        campaignId: cid,
        taskId: 0,
        actionKind: "subscribe",
        verificationDetails: row.details || null,
        metaEngagementId: null
      });
    }
  }
  return res.json({ tasks: serialized, myEngagements });
}

async function startCommentDetection(req, res) {
  const taskId = Number(req.body.taskId);
  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({ message: "Invalid task id" });
  }
  try {
    const task = await db.Task.findByPk(taskId, {
      include: [{ model: db.Campaign, as: "campaign" }]
    });
    if (!task || !task.campaign) return res.status(404).json({ message: "Task not found" });
    if (task.status !== "open" && !(task.status === "assigned" && task.assignedUserId === req.user.id)) {
      return res.status(400).json({ message: "Task is not open for comment detection" });
    }
    if (task.campaign.engagementType !== "comment" && task.campaign.engagementType !== "like_comment") {
      return res.status(400).json({ message: "Comment detection only applies to comment campaigns" });
    }
    if (task.campaign.userId === req.user.id) {
      return res.status(400).json({ message: "Cannot complete your own campaign task" });
    }
    const worker = await db.User.findByPk(req.user.id);
    const telegramUserId = requireWorkerTelegramId(worker);
    const msgUrl = task.campaign.messageUrl || task.campaign.soundcloudPostUrl;
    const parsed = tg.parseTmeMessageUrl(String(msgUrl || ""));
    if (!parsed) return res.status(400).json({ message: "Invalid t.me post URL on campaign" });
    const resolved = await tg.resolveChannelChatIdFromTme(parsed, null);
    if (!resolved || resolved.error || !resolved.chatId) {
      return res.status(400).json({ message: resolved?.error || "Could not resolve campaign channel" });
    }
    const chatInfo = await tg.getChat(String(resolved.chatId)).catch(() => null);
    const discussionChatId = chatInfo?.linked_chat_id ? String(chatInfo.linked_chat_id) : null;
    if (!discussionChatId) {
      return res.status(400).json({
        message:
          "Comments are not enabled for this channel post. Link a discussion group to the channel and add the bot there."
      });
    }

    const token = crypto.randomBytes(16).toString("hex");
    commentDetectionStore.create({
      token,
      userId: req.user.id,
      telegramUserId: String(telegramUserId),
      taskId: task.id,
      campaignId: task.campaignId,
      discussionChatId,
      expires: Date.now() + commentDetectionStore.TTL_MS
    });
    return res.json({ token, expiresInMs: commentDetectionStore.TTL_MS });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Could not start comment detection" });
  }
}

async function pollCommentDetection(req, res) {
  const token = String(req.query.token || "");
  if (!token) return res.status(400).json({ message: "token is required" });
  const row = commentDetectionStore.peek(token);
  if (!row) return res.json({ status: "expired" });
  if (row.userId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
  if (row.resolvedAt) return res.json({ status: "detected" });
  return res.json({ status: "pending" });
}

async function revertEngagement(req, res) {
  const { campaignId, actionKind } = req.body;
  if (!["subscribe", "comment", "like"].includes(actionKind)) {
    return res.status(400).json({ message: "Invalid action kind" });
  }
  try {
    await sequelize.transaction(async (transaction) => {
      const engagementWhere =
        actionKind === "subscribe"
          ? { userId: req.user.id, campaignId, engagementType: "subscribe" }
          : { userId: req.user.id, campaignId, actionKind };
      const engagement = await db.Engagement.findOne({
        where: engagementWhere,
        transaction,
        lock: true,
        include: [
          { model: db.Task, as: "task", required: true },
          { model: db.Campaign, as: "campaign", required: true }
        ]
      });
      if (!engagement) {
        const error = new Error("No engagement to undo");
        error.status = 404;
        throw error;
      }
      const campaign = engagement.campaign;
      const task = engagement.task;
      if (campaign.userId === req.user.id) {
        const error = new Error("Cannot revert on your own campaign");
        error.status = 400;
        throw error;
      }
      if (actionKind === "subscribe") {
        const worker = await db.User.findByPk(req.user.id, { transaction, lock: true });
        const creds = parseStoredMtprotoCredentials(worker);
        const sessionString = parseStoredSessionString(worker);
        if (!creds || !sessionString) {
          const error = new Error("Telegram user session is required to unsubscribe");
          error.status = 400;
          throw error;
        }
        const username = parseTmeChannelUsername(campaign.messageUrl);
        const leaveRef = username ? `@${username}` : "";
        if (!leaveRef) {
          const error = new Error("Could not resolve Telegram channel for unsubscribe");
          error.status = 400;
          throw error;
        }
        await runBridge("leave_channel", {
          apiId: creds.apiId,
          apiHash: creds.apiHash,
          proxy: creds.proxy || null,
          sessionString,
          channel: leaveRef
        });
      }
      if (actionKind === "like") {
        const worker = await db.User.findByPk(req.user.id, { transaction, lock: true });
        const creds = parseStoredMtprotoCredentials(worker);
        const sessionString = parseStoredSessionString(worker);
        if (!creds || !sessionString) {
          const error = new Error("Telegram user session is required to remove like");
          error.status = 400;
          throw error;
        }
        const parsed = parseLikeMeta(engagement.metaEngagementId);
        if (!parsed) {
          const error = new Error("Could not resolve Telegram message for unlike");
          error.status = 400;
          throw error;
        }
        const msgUrl = campaign.messageUrl || campaign.soundcloudPostUrl || "";
        const parsedMessage = tg.parseTmeMessageUrl(String(msgUrl || ""));
        const chatCandidates = [];
        if (parsedMessage?.kind === "public" && parsedMessage?.username) {
          chatCandidates.push(`@${String(parsedMessage.username).replace(/^@/, "")}`);
        }
        chatCandidates.push(String(parsed.channelId));
        let cleared = false;
        let lastErr = null;
        for (const chatRef of chatCandidates) {
          try {
            await runBridge("clear_reaction", {
              apiId: creds.apiId,
              apiHash: creds.apiHash,
              proxy: creds.proxy || null,
              sessionString,
              chat: chatRef,
              msgId: Number(parsed.messageId)
            });
            cleared = true;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!cleared) {
          const error = new Error(
            (lastErr && lastErr.message) || "Could not remove Telegram reaction. Try again."
          );
          error.status = 400;
          throw error;
        }
      }
      if (actionKind === "comment") {
        const worker = await db.User.findByPk(req.user.id, { transaction, lock: true });
        const creds = parseStoredMtprotoCredentials(worker);
        const sessionString = parseStoredSessionString(worker);
        if (!creds || !sessionString) {
          const error = new Error("Telegram user session is required to delete comment");
          error.status = 400;
          throw error;
        }
        const parsed = parseCommentMeta(engagement.metaEngagementId);
        if (!parsed) {
          const error = new Error("Could not resolve Telegram comment message for delete");
          error.status = 400;
          throw error;
        }
        const chatCandidates = [String(parsed.commentChatId)];
        const chatPayloads = [
          parsed.commentChatAccessHash
            ? { chatId: String(parsed.commentChatId), accessHash: String(parsed.commentChatAccessHash) }
            : null,
          ...chatCandidates
        ].filter(Boolean);
        let deleted = false;
        let lastErr = null;
        for (const chatRef of chatPayloads) {
          try {
            await runBridge("delete_message", {
              apiId: creds.apiId,
              apiHash: creds.apiHash,
              proxy: creds.proxy || null,
              sessionString,
              chat: chatRef,
              msgId: Number(parsed.commentMessageId)
            });
            deleted = true;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!deleted) {
          const error = new Error(
            (lastErr && lastErr.message) || "Could not delete Telegram comment. Try again."
          );
          error.status = 400;
          throw error;
        }
      }
      const amount = task.rewardCredits;
      const reversal = await reverseEarnCredits({
        userId: req.user.id,
        amount,
        reason: `Reverted ${actionKind} on campaign #${campaignId} (task #${task.id})`,
        referenceType: "task",
        referenceId: task.id,
        beneficiaryUserId: campaign.userId,
        transaction
      });
      const collected = Number(reversal?.collected || 0);
      if (collected > 0) {
        await refundCredits({
          userId: campaign.userId,
          amount: collected,
          reason: `Refund: ${actionKind} reverted on campaign #${campaignId}`,
          referenceType: "campaign",
          referenceId: campaign.id,
          transaction
        });
      }
      await engagement.destroy({ transaction });
      if (campaign.messageKey && actionKind !== "subscribe") {
        await db.UserPostAction.destroy({
          where: {
            userId: req.user.id,
            postKey: String(campaign.messageKey),
            actionKind
          },
          transaction
        });
      }
      if (campaign.messageKey && actionKind === "subscribe") {
        await db.UserSubscriptionMemory.destroy({
          where: { userId: req.user.id, channelKey: String(campaign.messageKey) },
          transaction
        });
      }
      task.status = "open";
      task.assignedUserId = null;
      task.assignedAt = null;
      task.completedAt = null;
      await task.save({ transaction });
      if (campaign.status === "completed") {
        const stillCompleted = await db.Task.count({
          where: { campaignId: campaign.id, status: "completed" },
          transaction
        });
        if (stillCompleted < campaign.maxEngagements) {
          campaign.status = "active";
          await campaign.save({ transaction });
        }
      }
    });
    return res.json({
      message:
        "Engagement reverted in the app; remove your Telegram comment if needed. Credits were returned to the poster."
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || "Could not revert engagement" });
  }
}

module.exports = {
  getAvailableTasks,
  submitTaskCompletion,
  revertEngagement,
  startCommentDetection,
  pollCommentDetection
};
