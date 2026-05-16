const tg = require("./telegramService");
const { runBridge } = require("./telegramMtprotoService");
const { decrypt } = require("../utils/crypto");

const MAX_SUBSCRIBE_PROBES = 16;
const MAX_POST_PROBES = 16;
const PROBE_CONCURRENCY = 4;
const PROBE_CACHE_TTL_MS = 15 * 60 * 1000;
const NORMAL_PROBE_BUDGET_MS = 12_000;
const DEEP_PROBE_BUDGET_MS = 45_000;
const LIKE_PROBE_EMOJIS = ["👍", "❤️", "🔥", "👏", "🤩", "🎉"];
const MTPROTO_PROBE_TIMEOUT_MS = 12_000;

/** @type {Map<string, { value: unknown, expires: number }>} */
const probeCache = new Map();

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

function cacheKey(userId, kind, id) {
  return `${userId}:${kind}:${id}`;
}

function readCache(userId, kind, id) {
  const row = probeCache.get(cacheKey(userId, kind, id));
  if (!row) return null;
  if (row.expires < Date.now()) {
    probeCache.delete(cacheKey(userId, kind, id));
    return null;
  }
  return row.value;
}

function writeCache(userId, kind, id, value) {
  if (value === false || value == null) return;
  probeCache.set(cacheKey(userId, kind, id), {
    value,
    expires: Date.now() + PROBE_CACHE_TTL_MS
  });
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error("probe timeout");
        err.code = "PROBE_TIMEOUT";
        reject(err);
      }, ms);
    })
  ]);
}

function chatCandidatesForPost(messageUrl, channelId) {
  const parsed = tg.parseTmeMessageUrl(String(messageUrl || ""));
  const refs = [];
  if (parsed?.kind === "public" && parsed.username) {
    refs.push(`@${String(parsed.username).replace(/^@/, "")}`);
  }
  if (channelId) refs.push(String(channelId));
  return { parsed, refs };
}

async function probeSubscribeOnTelegram(telegramUserId, messageUrl, messageKey, creds, sessionString) {
  if (!telegramUserId) return false;

  let channelChatId = channelIdFromMessageKey(messageKey);
  let username = parseTmeChannelUsername(messageUrl);

  if (!channelChatId && username) {
    const chat = await tg.getChat(`@${username}`).catch(() => null);
    if (chat?.id != null) channelChatId = String(chat.id);
  }

  const channelRef = username ? `@${username}` : channelChatId;

  if (creds && sessionString && channelRef) {
    try {
      const out = await withTimeout(
        runBridge("check_channel_member", {
          apiId: creds.apiId,
          apiHash: creds.apiHash,
          proxy: creds.proxy || null,
          sessionString,
          channel: channelRef
        }),
        MTPROTO_PROBE_TIMEOUT_MS
      );
      if (out?.isMember) return true;
    } catch {
      // fall through to bot check
    }
  }

  if (tg.isConfigured() && channelChatId) {
    const detail = await tg.getUserChatMemberStatus(channelChatId, String(telegramUserId));
    if (detail.ok) return true;
  }

  return false;
}

async function probeLikeOnTelegram(creds, sessionString, messageUrl, channelId, reaction = "👍") {
  if (!creds || !sessionString) return { chosen: false, known: false };
  const any = await probeAnyLikeOnTelegram(creds, sessionString, messageUrl, channelId);
  if (any.found) {
    const emoji = any.emoji || "👍";
    return {
      chosen: emoji === reaction,
      known: true
    };
  }
  const { parsed, refs } = chatCandidatesForPost(messageUrl, channelId);
  if (!parsed?.messageId) return { chosen: false, known: false };

  for (const chatRef of refs) {
    try {
      const out = await withTimeout(
        runBridge("verify_reaction", {
          apiId: creds.apiId,
          apiHash: creds.apiHash,
          proxy: creds.proxy || null,
          sessionString,
          chat: chatRef,
          msgId: Number(parsed.messageId),
          reaction
        }),
        MTPROTO_PROBE_TIMEOUT_MS
      );
      return { chosen: Boolean(out?.chosen), known: Boolean(out?.known) };
    } catch {
      // try next
    }
  }
  return { chosen: false, known: false };
}

async function probeAnyLikeOnTelegram(creds, sessionString, messageUrl, channelId) {
  if (!creds || !sessionString) return { found: false, emoji: null };
  const { parsed, refs } = chatCandidatesForPost(messageUrl, channelId);
  if (!parsed?.messageId) return { found: false, emoji: null };

  for (const chatRef of refs) {
    try {
      const out = await withTimeout(
        runBridge("find_my_reaction_on_post", {
          apiId: creds.apiId,
          apiHash: creds.apiHash,
          proxy: creds.proxy || null,
          sessionString,
          chat: chatRef,
          msgId: Number(parsed.messageId)
        }),
        MTPROTO_PROBE_TIMEOUT_MS
      );
      if (out?.found) {
        return { found: true, emoji: out.emoji ? String(out.emoji) : "👍" };
      }
    } catch {
      // try next chat ref
    }
  }

  for (const chatRef of refs) {
    for (const emoji of LIKE_PROBE_EMOJIS) {
      try {
        const out = await withTimeout(
          runBridge("verify_reaction", {
            apiId: creds.apiId,
            apiHash: creds.apiHash,
            proxy: creds.proxy || null,
            sessionString,
            chat: chatRef,
            msgId: Number(parsed.messageId),
            reaction: emoji
          }),
          MTPROTO_PROBE_TIMEOUT_MS
        );
        if (out?.known && out?.chosen) {
          return { found: true, emoji };
        }
      } catch {
        // try next
      }
    }
  }
  return { found: false, emoji: null };
}

async function probeCommentOnTelegram(creds, sessionString, messageUrl, channelId) {
  if (!creds || !sessionString) return { found: false };
  const { parsed, refs } = chatCandidatesForPost(messageUrl, channelId);
  if (!parsed?.messageId) return { found: false };

  for (const chatRef of refs) {
    try {
      const out = await withTimeout(
        runBridge("find_my_comment_on_post", {
          apiId: creds.apiId,
          apiHash: creds.apiHash,
          proxy: creds.proxy || null,
          sessionString,
          chat: chatRef,
          msgId: Number(parsed.messageId)
        }),
        MTPROTO_PROBE_TIMEOUT_MS
      );
      if (out?.found) {
        return {
          found: true,
          text: String(out.text || "").slice(0, 500),
          messageId: out.messageId,
          chatId: out.chatId,
          chatAccessHash: out.chatAccessHash
        };
      }
    } catch {
      // try next
    }
  }
  return { found: false };
}

async function mapPool(items, concurrency, mapper) {
  if (items.length === 0) return [];
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await mapper(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

function collectSubscribeTargets(tasks, knownKeys) {
  const byChannelKey = new Map();
  for (const task of tasks) {
    const campaign = task?.campaign;
    if (!campaign || campaign.engagementType !== "subscribe") continue;
    const campaignId = Number(campaign.id);
    if (knownKeys.has(engagementKey(campaignId, "subscribe"))) continue;
    const channelKey = String(campaign.messageKey || `sub_${campaignId}`);
    if (byChannelKey.has(channelKey)) continue;
    byChannelKey.set(channelKey, {
      channelKey,
      messageUrl: String(campaign.messageUrl || campaign.soundcloudPostUrl || ""),
      messageKey: String(campaign.messageKey || ""),
      campaignId
    });
    if (byChannelKey.size >= MAX_SUBSCRIBE_PROBES) break;
  }
  return [...byChannelKey.values()];
}

function collectPostTargets(tasks, knownKeys, actionKind) {
  const byPostKey = new Map();
  for (const task of tasks) {
    const campaign = task?.campaign;
    if (!campaign) continue;
    const et = String(campaign.engagementType || "");
    if (actionKind === "like" && et !== "like" && et !== "like_comment") continue;
    if (actionKind === "comment" && et !== "comment" && et !== "like_comment") continue;

    const campaignId = Number(campaign.id);
    if (knownKeys.has(engagementKey(campaignId, actionKind))) continue;
    const postKey = String(campaign.messageKey || "");
    if (!postKey || byPostKey.has(postKey)) continue;

    byPostKey.set(postKey, {
      postKey,
      messageUrl: String(campaign.messageUrl || campaign.soundcloudPostUrl || ""),
      campaignId
    });
    if (byPostKey.size >= MAX_POST_PROBES) break;
  }
  return [...byPostKey.values()];
}

/**
 * @param {{ worker: object, tasks: object[], knownKeys: Set<string>, mode?: 'normal'|'deep' }} opts
 */
async function probePreExistingEngagements({ worker, tasks, knownKeys, mode = "normal" }) {
  if (!worker?.telegramUserId) return [];

  const userId = Number(worker.id);
  const tUid = String(worker.telegramUserId);
  const creds = parseStoredMtprotoCredentials(worker);
  const sessionString = parseStoredSessionString(worker);
  const deep = mode === "deep";
  const budgetMs = deep ? DEEP_PROBE_BUDGET_MS : NORMAL_PROBE_BUDGET_MS;

  const subscribeTargets = collectSubscribeTargets(tasks, knownKeys);
  const likeTargets = deep && creds && sessionString ? collectPostTargets(tasks, knownKeys, "like") : [];
  const commentTargets =
    deep && creds && sessionString ? collectPostTargets(tasks, knownKeys, "comment") : [];

  const jobs = [
    ...subscribeTargets.map((t) => ({ type: "subscribe", target: t })),
    ...likeTargets.map((t) => ({ type: "like", target: t })),
    ...commentTargets.map((t) => ({ type: "comment", target: t }))
  ];
  if (jobs.length === 0) return [];

  const results = new Map();

  const runAll = async () => {
    await mapPool(jobs, PROBE_CONCURRENCY, async (job) => {
      if (job.type === "subscribe") {
        const { target } = job;
        const cacheId = target.channelKey;
        const cached = readCache(userId, "sub", cacheId);
        if (cached != null) {
          results.set(`subscribe:${cacheId}`, cached);
          return;
        }
        const isMember = await probeSubscribeOnTelegram(
          tUid,
          target.messageUrl,
          target.messageKey,
          creds,
          sessionString
        );
        if (isMember) writeCache(userId, "sub", cacheId, isMember);
        results.set(`subscribe:${cacheId}`, isMember);
        return;
      }

      if (job.type === "like") {
        const { target } = job;
        const cacheId = `${target.postKey}:like`;
        const cached = readCache(userId, "post", cacheId);
        if (cached != null) {
          results.set(`like:${target.postKey}`, cached);
          return;
        }
        let channelId = null;
        try {
          const parsed = tg.parseTmeMessageUrl(target.messageUrl);
          if (parsed) {
            const resolved = await tg.resolveChannelChatIdFromTme(parsed, null);
            channelId = resolved?.chatId ? String(resolved.chatId) : null;
          }
        } catch {
          channelId = null;
        }
        const state = await probeAnyLikeOnTelegram(
          creds,
          sessionString,
          target.messageUrl,
          channelId
        );
        if (state.found) writeCache(userId, "post", cacheId, state);
        results.set(`like:${target.postKey}`, state);
        return;
      }

      if (job.type === "comment") {
        const { target } = job;
        const cacheId = `${target.postKey}:comment`;
        const cached = readCache(userId, "post", cacheId);
        if (cached != null) {
          results.set(`comment:${target.postKey}`, cached);
          return;
        }
        let channelId = null;
        try {
          const parsed = tg.parseTmeMessageUrl(target.messageUrl);
          if (parsed) {
            const resolved = await tg.resolveChannelChatIdFromTme(parsed, null);
            channelId = resolved?.chatId ? String(resolved.chatId) : null;
          }
        } catch {
          channelId = null;
        }
        const found = await probeCommentOnTelegram(creds, sessionString, target.messageUrl, channelId);
        writeCache(userId, "post", cacheId, found);
        results.set(`comment:${target.postKey}`, found);
      }
    });
  };

  try {
    await withTimeout(runAll(), budgetMs);
  } catch {
    // return partial results gathered so far
  }

  const additions = [];

  for (const target of subscribeTargets) {
    if (!results.get(`subscribe:${target.channelKey}`)) continue;
    const key = engagementKey(target.campaignId, "subscribe");
    if (knownKeys.has(key)) continue;
    knownKeys.add(key);
    additions.push({
      id: 0,
      campaignId: target.campaignId,
      taskId: 0,
      actionKind: "subscribe",
      verificationDetails: "Telegram: already subscribed before this campaign",
      metaEngagementId: null,
      source: "telegram",
      preExisting: true,
      earned: false,
      channelKey: target.channelKey
    });
  }

  for (const target of likeTargets) {
    const state = results.get(`like:${target.postKey}`);
    if (!state?.found) continue;
    const key = engagementKey(target.campaignId, "like");
    if (knownKeys.has(key)) continue;
    knownKeys.add(key);
    additions.push({
      id: 0,
      campaignId: target.campaignId,
      taskId: 0,
      actionKind: "like",
      verificationDetails: state.emoji
        ? `Telegram: ${state.emoji} reaction already on post before this campaign`
        : "Telegram: reaction already on post before this campaign",
      metaEngagementId: null,
      source: "telegram",
      preExisting: true,
      earned: false,
      postKey: target.postKey
    });
  }

  for (const target of commentTargets) {
    const found = results.get(`comment:${target.postKey}`);
    if (!found?.found) continue;
    const key = engagementKey(target.campaignId, "comment");
    if (knownKeys.has(key)) continue;
    knownKeys.add(key);
    const details = found.text
      ? `Telegram: mtproto comment sent :: ${found.text}`
      : "Telegram: comment already on post before this campaign";
    additions.push({
      id: 0,
      campaignId: target.campaignId,
      taskId: 0,
      actionKind: "comment",
      verificationDetails: details,
      metaEngagementId: null,
      source: "telegram",
      preExisting: true,
      earned: false,
      postKey: target.postKey
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
  probeLikeOnTelegram,
  probeAnyLikeOnTelegram
};
