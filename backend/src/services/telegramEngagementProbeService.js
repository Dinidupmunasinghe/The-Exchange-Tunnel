const tg = require("./telegramService");
const { runBridge } = require("./telegramMtprotoService");
const { decrypt } = require("../utils/crypto");

const MAX_PROBES_PER_FEED = 48;

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

function channelIdFromMessageKey(messageKey) {
  const m = /^sub_(-?\d+)$/.exec(String(messageKey || ""));
  return m ? String(m[1]) : null;
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

function engagementKey(campaignId, actionKind) {
  return `${Number(campaignId)}:${String(actionKind)}`;
}

/**
 * Detect channel membership via bot API, then fall back to the worker's MTProto
 * session (same account used for earn actions — catches subscriptions from before
 * the campaign existed).
 */
async function probeSubscribeOnTelegram(telegramUserId, messageUrl, messageKey, creds, sessionString) {
  if (!telegramUserId) return false;

  let channelChatId = channelIdFromMessageKey(messageKey);
  let username = parseTmeChannelUsername(messageUrl);

  if (!channelChatId && username) {
    const chat = await tg.getChat(`@${username}`).catch(() => null);
    if (chat?.id != null) channelChatId = String(chat.id);
  }
  if (!username && messageUrl) {
    username = parseTmeChannelUsername(messageUrl);
  }

  if (tg.isConfigured() && channelChatId) {
    const detail = await tg.getUserChatMemberStatus(channelChatId, String(telegramUserId));
    if (detail.ok) return true;
  }

  if (creds && sessionString) {
    const channelRef = username ? `@${username}` : channelChatId;
    if (!channelRef) return false;
    try {
      const out = await runBridge("check_channel_member", {
        apiId: creds.apiId,
        apiHash: creds.apiHash,
        proxy: creds.proxy || null,
        sessionString,
        channel: channelRef
      });
      return Boolean(out?.isMember);
    } catch {
      return false;
    }
  }

  return false;
}

async function probeLikeOnTelegram(creds, sessionString, messageUrl, reaction = "👍") {
  if (!creds || !sessionString) return { chosen: false, known: false };
  const parsedMessage = tg.parseTmeMessageUrl(String(messageUrl || ""));
  if (!parsedMessage?.messageId) return { chosen: false, known: false };

  const chatCandidates = [];
  if (parsedMessage.kind === "public" && parsedMessage.username) {
    chatCandidates.push(`@${String(parsedMessage.username).replace(/^@/, "")}`);
  }
  try {
    const resolved = await tg.resolveChannelChatIdFromTme(parsedMessage, null);
    if (resolved?.chatId) chatCandidates.push(String(resolved.chatId));
  } catch {
    // ignore
  }

  for (const chatRef of chatCandidates) {
    try {
      const out = await runBridge("verify_reaction", {
        apiId: creds.apiId,
        apiHash: creds.apiHash,
        proxy: creds.proxy || null,
        sessionString,
        chat: chatRef,
        msgId: Number(parsedMessage.messageId),
        reaction
      });
      return { chosen: Boolean(out?.chosen), known: Boolean(out?.known) };
    } catch {
      // try next chat ref
    }
  }
  return { chosen: false, known: false };
}

/**
 * Live Telegram checks for earn-feed cards: detect actions the worker already
 * performed outside this campaign (no credits until they complete a task).
 */
async function probePreExistingEngagements({ worker, tasks, knownKeys }) {
  const additions = [];
  if (!worker?.telegramUserId) return additions;

  const tUid = String(worker.telegramUserId);
  const creds = parseStoredMtprotoCredentials(worker);
  const sessionString = parseStoredSessionString(worker);
  const seenSubscribeKeys = new Set();
  const seenLikePostKeys = new Set();
  let probes = 0;

  for (const task of tasks) {
    if (probes >= MAX_PROBES_PER_FEED) break;
    const campaign = task?.campaign;
    if (!campaign) continue;
    const campaignId = Number(campaign.id);
    const messageUrl = String(campaign.messageUrl || campaign.soundcloudPostUrl || "");
    const messageKey = String(campaign.messageKey || "");
    const engagementType = String(campaign.engagementType || "");

    if (engagementType === "subscribe") {
      const key = engagementKey(campaignId, "subscribe");
      if (knownKeys.has(key)) continue;
      const channelKey = messageKey || `sub_${campaignId}`;
      if (seenSubscribeKeys.has(channelKey)) continue;
      seenSubscribeKeys.add(channelKey);
      probes += 1;
      const isMember = await probeSubscribeOnTelegram(tUid, messageUrl, messageKey, creds, sessionString);
      if (!isMember) continue;
      knownKeys.add(key);
      additions.push({
        id: 0,
        campaignId,
        taskId: 0,
        actionKind: "subscribe",
        verificationDetails: "Telegram: already subscribed before this campaign",
        metaEngagementId: null,
        source: "telegram",
        preExisting: true,
        earned: false
      });
      continue;
    }

    if (engagementType !== "like" && engagementType !== "like_comment") continue;
    const likeKey = engagementKey(campaignId, "like");
    if (knownKeys.has(likeKey)) continue;
    const postKey = messageKey;
    if (!postKey || seenLikePostKeys.has(postKey)) continue;
    if (!creds || !sessionString) continue;

    seenLikePostKeys.add(postKey);
    probes += 1;
    const reactionState = await probeLikeOnTelegram(creds, sessionString, messageUrl, "👍");
    if (!reactionState.known || !reactionState.chosen) continue;

    knownKeys.add(likeKey);
    additions.push({
      id: 0,
      campaignId,
      taskId: 0,
      actionKind: "like",
      verificationDetails: "Telegram: reaction already on post before this campaign",
      metaEngagementId: null,
      source: "telegram",
      preExisting: true,
      earned: false
    });
  }

  return additions;
}

function markEarnedFlags(myEngagements, earnedKeys) {
  return myEngagements.map((row) => {
    const kind = row.actionKind === "subscribe" ? "subscribe" : String(row.actionKind || "");
    const earned = earnedKeys.has(engagementKey(row.campaignId, kind));
    return {
      ...row,
      earned: Boolean(row.earned) || earned,
      preExisting: Boolean(row.preExisting) && !earned
    };
  });
}

module.exports = {
  probePreExistingEngagements,
  markEarnedFlags,
  engagementKey,
  probeSubscribeOnTelegram,
  probeLikeOnTelegram
};
