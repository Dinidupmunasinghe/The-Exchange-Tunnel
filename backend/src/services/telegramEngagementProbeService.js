const tg = require("./telegramService");
const { runBridge } = require("./telegramMtprotoService");
const { decrypt } = require("../utils/crypto");

const MAX_SUBSCRIBE_PROBES = 12;
const PROBE_CONCURRENCY = 4;
const PROBE_CACHE_TTL_MS = 10 * 60 * 1000;
const PROBE_GLOBAL_BUDGET_MS = 9000;
const MTPROTO_PROBE_TIMEOUT_MS = 6000;

/** @type {Map<string, { isMember: boolean, expires: number }>} */
const subscribeProbeCache = new Map();

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

function cacheKey(userId, channelKey) {
  return `${userId}:${channelKey}`;
}

function readCache(userId, channelKey) {
  const row = subscribeProbeCache.get(cacheKey(userId, channelKey));
  if (!row) return null;
  if (row.expires < Date.now()) {
    subscribeProbeCache.delete(cacheKey(userId, channelKey));
    return null;
  }
  return row.isMember;
}

function writeCache(userId, channelKey, isMember) {
  subscribeProbeCache.set(cacheKey(userId, channelKey), {
    isMember: Boolean(isMember),
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

async function probeSubscribeOnTelegram(telegramUserId, messageUrl, messageKey, creds, sessionString) {
  if (!telegramUserId) return false;

  let channelChatId = channelIdFromMessageKey(messageKey);
  let username = parseTmeChannelUsername(messageUrl);

  if (!channelChatId && username) {
    const chat = await tg.getChat(`@${username}`).catch(() => null);
    if (chat?.id != null) channelChatId = String(chat.id);
  }

  if (tg.isConfigured() && channelChatId) {
    const detail = await tg.getUserChatMemberStatus(channelChatId, String(telegramUserId));
    if (detail.ok) return true;
  }

  if (creds && sessionString) {
    const channelRef = username ? `@${username}` : channelChatId;
    if (!channelRef) return false;
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
      return Boolean(out?.isMember);
    } catch {
      return false;
    }
  }

  return false;
}

async function mapPool(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await mapper(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Collect unique subscribe channels that still need a live Telegram check.
 */
function collectSubscribeProbeTargets(tasks, knownKeys) {
  const byChannelKey = new Map();
  for (const task of tasks) {
    const campaign = task?.campaign;
    if (!campaign || campaign.engagementType !== "subscribe") continue;
    const campaignId = Number(campaign.id);
    const key = engagementKey(campaignId, "subscribe");
    if (knownKeys.has(key)) continue;
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

/**
 * Live Telegram subscribe checks (earn feed). Like/repost pre-checks are skipped here
 * because MTProto bridge calls are too slow for page load.
 */
async function probePreExistingEngagements({ worker, tasks, knownKeys }) {
  if (!worker?.telegramUserId) return [];

  const userId = Number(worker.id);
  const tUid = String(worker.telegramUserId);
  const creds = parseStoredMtprotoCredentials(worker);
  const sessionString = parseStoredSessionString(worker);
  const targets = collectSubscribeProbeTargets(tasks, knownKeys);
  if (targets.length === 0) return [];

  const runProbes = async () => {
    const memberByChannelKey = new Map();
    await mapPool(targets, PROBE_CONCURRENCY, async (target) => {
      const cached = readCache(userId, target.channelKey);
      if (cached != null) {
        memberByChannelKey.set(target.channelKey, cached);
        return;
      }
      const isMember = await probeSubscribeOnTelegram(
        tUid,
        target.messageUrl,
        target.messageKey,
        creds,
        sessionString
      );
      writeCache(userId, target.channelKey, isMember);
      memberByChannelKey.set(target.channelKey, isMember);
    });
    return memberByChannelKey;
  };

  let memberByChannelKey;
  try {
    memberByChannelKey = await withTimeout(runProbes(), PROBE_GLOBAL_BUDGET_MS);
  } catch {
    return [];
  }

  const additions = [];
  for (const target of targets) {
    if (!memberByChannelKey.get(target.channelKey)) continue;
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
  probeSubscribeOnTelegram
};
