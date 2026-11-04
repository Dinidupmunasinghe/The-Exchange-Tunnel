const { Op } = require("sequelize");
const db = require("../models");
const sequelize = require("../config/database");
const env = require("../config/env");
const tg = require("./telegramService");
const auditCursor = require("./auditCursor");
const { runBridge, isBridgeBusy } = require("./telegramMtprotoService");
const { decrypt } = require("../utils/crypto");
const { revertEngagement } = require("./engagementRevertService");

/**
 * Engagement audit — catches workers who undo a paid action on Telegram
 * (unsubscribe, remove a reaction, delete a comment or a repost) and takes the credits back.
 *
 * How it stays fast and cheap:
 *  - Every verified engagement carries `nextAuditAt`. Young actions are re-checked often
 *    (most undos happen in the first hours), older ones less often, and after the guarantee
 *    period (default 30 days) the action is final and no longer checked.
 *  - Telegram pushes "user left the channel" (chat_member) and "reactions changed"
 *    (message_reaction_count) to our webhook; those mark the matching engagements due NOW
 *    and wake the audit, so most undos are caught within a minute or two.
 *  - Subscriptions are checked with the Bot API (no extra memory). Likes, comments and reposts
 *    need the worker's own Telegram session: all of a worker's due checks go in ONE Python call,
 *    a few workers per tick, and the audit yields whenever a user action needs the bridge.
 *
 * Safety: only a definitive answer from Telegram ("left", "reaction not chosen", "message gone")
 * reverses anything. Errors, rate limits and deleted channel posts are "unknown" and retried.
 */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const cfg = env.engagementAudit;
const DUE_BATCH = 80;
const MAX_CHECKS_PER_WORKER = 40;
const MTPROTO_KINDS = new Set(["like", "comment", "share"]);

const status = {
  enabled: cfg.enabled,
  lastRunAt: null,
  lastDurationMs: 0,
  lastDue: 0,
  lastReverted: 0,
  totalReverted: 0,
  lastError: null
};

/* ── scheduling ─────────────────────────────────────────────────────── */

function guaranteeMs() {
  return cfg.guaranteeDays * DAY;
}

/** When a freshly verified engagement gets its first re-check. */
function firstAuditAt(now = Date.now()) {
  return new Date(now + 2 * MIN);
}

/** Younger actions are checked more often: that's when most people undo them. */
function nextAuditAtFor(createdAt, now = Date.now()) {
  const born = new Date(createdAt).getTime();
  const end = born + guaranteeMs();
  const age = now - born;
  if (!Number.isFinite(born) || now >= end) return null;
  const step = age < HOUR ? 3 * MIN : age < DAY ? 10 * MIN : age < 7 * DAY ? HOUR : 6 * HOUR;
  const jitter = Math.floor(Math.random() * Math.min(step / 5, 5 * MIN));
  return new Date(Math.min(now + step + jitter, end));
}

async function setNext(ids, when) {
  if (!ids.length) return;
  await db.Engagement.update({ nextAuditAt: when }, { where: { id: { [Op.in]: ids } } }).catch(() => undefined);
}

async function reschedule(rows, now = Date.now()) {
  for (const e of rows) {
    await setNext([e.id], nextAuditAtFor(e.createdAt, now));
  }
}

/* ── parsing what was recorded at completion time ───────────────────── */

function kindOf(e) {
  if (e.engagementType === "subscribe" || e.actionKind === "subscribe") return "subscribe";
  return String(e.actionKind || e.engagementType || "");
}

function subscribeChannelId(e) {
  const key = /^sub_(-?\d+)$/.exec(String(e.campaign?.messageKey || ""));
  if (key) return key[1];
  const meta = /^tg-sub-\d+-(-?\d+)$/.exec(String(e.metaEngagementId || ""));
  return meta ? meta[1] : null;
}

function parseLikeMeta(meta) {
  const m = /^tg-like-\d+-(-?\d+)-(\d+)(?:--(.+))?$/.exec(String(meta || ""));
  if (!m) return null;
  let reaction = "👍";
  if (m[3]) {
    try {
      reaction = decodeURIComponent(m[3]);
    } catch {
      reaction = "👍";
    }
  }
  return { channelId: m[1], messageId: Number(m[2]), reaction };
}

function parseCommentMeta(meta) {
  const raw = String(meta || "");
  const safe = (v) => {
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const v3 = /^tg-com-\d+--(.+)--(\d+)--(.*)$/.exec(raw);
  if (v3) return { chatId: safe(v3[1]), messageId: Number(v3[2]), accessHash: safe(v3[3] || "") };
  const v2 = /^tg-com-\d+--(.+)--(\d+)$/.exec(raw);
  if (v2) return { chatId: safe(v2[1]), messageId: Number(v2[2]), accessHash: "" };
  const v1 = /^tg-com-\d+-(-?\d+)-(\d+)-(\d+)$/.exec(raw);
  if (v1) return { chatId: v1[1], messageId: Number(v1[3]), accessHash: "" };
  return null;
}

function parseShareMeta(meta) {
  const m = /^tg-share-\d+--(.+)--(\d+)--(.+)--(\d+)$/.exec(String(meta || ""));
  if (!m) return null;
  try {
    return { destinationChat: decodeURIComponent(m[3]), forwardedMessageId: Number(m[4]) };
  } catch {
    return null;
  }
}

/** The bridge check for one engagement, or null when we can't build one. */
function buildCheck(e) {
  const kind = kindOf(e);
  if (kind === "like") {
    const p = parseLikeMeta(e.metaEngagementId);
    if (!p) return null;
    const chats = [];
    const parsed = tg.parseTmeMessageUrl(String(e.campaign?.messageUrl || e.campaign?.soundcloudPostUrl || ""));
    if (parsed?.kind === "public" && parsed.username) chats.push(`@${String(parsed.username).replace(/^@/, "")}`);
    chats.push(String(p.channelId));
    return { id: String(e.id), kind: "reaction", chats, msgId: p.messageId, reaction: p.reaction };
  }
  if (kind === "comment") {
    const p = parseCommentMeta(e.metaEngagementId);
    if (!p) return null;
    const chats = [];
    if (p.accessHash) chats.push({ chatId: String(p.chatId), accessHash: String(p.accessHash) });
    chats.push(String(p.chatId));
    return { id: String(e.id), kind: "message", chats, msgId: p.messageId };
  }
  if (kind === "share") {
    const p = parseShareMeta(e.metaEngagementId);
    if (!p) return null;
    // The repost lives in the worker's own channel: if it became inaccessible, it's gone.
    return {
      id: String(e.id),
      kind: "message",
      chats: [p.destinationChat],
      msgId: p.forwardedMessageId,
      missingIfInaccessible: true
    };
  }
  return null;
}

function workerSession(user) {
  if (!user?.userOAuthTokenEncrypted || !user?.userActingTokenEncrypted) return null;
  try {
    const creds = JSON.parse(decrypt(user.userOAuthTokenEncrypted) || "null");
    const sessionString = decrypt(user.userActingTokenEncrypted);
    if (!creds?.apiId || !creds?.apiHash || !sessionString) return null;
    return { apiId: creds.apiId, apiHash: creds.apiHash, proxy: creds.proxy || null, sessionString };
  } catch {
    return null;
  }
}

/* ── reversal ───────────────────────────────────────────────────────── */

const UNDO_TEXT = {
  subscribe: "left a channel you were paid to subscribe to",
  like: "removed your reaction from a post you were paid to like",
  comment: "deleted a comment you were paid to post",
  share: "deleted a repost you were paid to make",
  session: "removed phone verification, so we could no longer confirm a like, comment or repost you were paid for"
};

const REASON_TEXT = {
  subscribe: "unsubscribed from channel",
  like: "removed like",
  comment: "deleted comment",
  share: "deleted repost",
  session: "phone verification removed, action could not be re-checked"
};

async function notifyWorker(telegramUserId, why, amount, campaign) {
  if (!telegramUserId || !(amount > 0)) return;
  const where = campaign?.messageUrl ? `\n\n${campaign.messageUrl}` : "";
  const text =
    `⚠️ ${amount} credit${amount === 1 ? "" : "s"} taken back\n\n` +
    `You ${UNDO_TEXT[why] || "undid an action you were paid for"}, so the reward was removed from your ` +
    `Exchange Tunnel balance and the slot was given to someone else.${where}\n\n` +
    `Keep subscriptions, likes, comments and reposts for at least ${cfg.guaranteeDays} days to keep your credits.`;
  await tg.sendBotMessage(String(telegramUserId), text).catch(() => undefined);
}

/** Re-checks state under a row lock, then reverts. Returns true when credits were taken back. */
async function revertAudited(e, why) {
  let result = null;
  let campaign = null;
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
      if (!fresh || fresh.verificationStatus !== "verified") return;
      if (!fresh.task || fresh.task.status !== "completed") return;
      campaign = fresh.campaign;
      result = await revertEngagement({
        engagement: fresh,
        reason: `Auto-reversal: ${REASON_TEXT[why] || "action undone"} on campaign #${fresh.campaignId} (task #${fresh.taskId})`,
        transaction
      });
    });
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
    return false;
  }
  if (!result) return false;
  const amount = Number(e.task?.rewardCredits || 0);
  await notifyWorker(e.user?.telegramUserId, why, amount, campaign);
  return true;
}

/* ── session loss (phone verification removed or logged out in Telegram) ── */

async function markSessionLost(user, { clearTokens = false } = {}) {
  const patch = {};
  if (!user.mtprotoSessionLostAt) patch.mtprotoSessionLostAt = new Date();
  if (clearTokens) {
    patch.userActingTokenEncrypted = null;
    patch.userOAuthTokenEncrypted = null;
  }
  if (Object.keys(patch).length) {
    await db.User.update(patch, { where: { id: user.id } }).catch(() => undefined);
    Object.assign(user, patch);
  }
  return new Date(user.mtprotoSessionLostAt);
}

/**
 * Without the worker's session, likes/comments/reposts can't be re-checked. The worker gets a
 * grace period to verify again; after that, actions still inside the guarantee period are
 * reverted (otherwise "remove verification, then unlike" would be a free loophole).
 */
async function handleUncheckable(user, rows, lostAt) {
  const graceEnd = lostAt.getTime() + cfg.sessionGraceHours * HOUR;
  let reverted = 0;
  if (Date.now() < graceEnd) {
    await setNext(
      rows.map((r) => r.id),
      new Date(graceEnd + MIN)
    );
    return 0;
  }
  for (const e of rows) {
    if (await revertAudited(e, "session")) reverted += 1;
  }
  return reverted;
}

/* ── one audit pass ─────────────────────────────────────────────────── */

const USER_ATTRS = [
  "id",
  "telegramUserId",
  "userOAuthTokenEncrypted",
  "userActingTokenEncrypted",
  "mtprotoSessionLostAt"
];

function dueQuery(where, limit) {
  return db.Engagement.findAll({
    where: { verificationStatus: "verified", nextAuditAt: { [Op.ne]: null, [Op.lte]: new Date() }, ...where },
    include: [
      { model: db.Task, as: "task", required: true },
      { model: db.Campaign, as: "campaign", required: true },
      { model: db.User, as: "user", required: true, attributes: USER_ATTRS }
    ],
    order: [["nextAuditAt", "ASC"]],
    limit
  });
}

async function checkSubscriptions(rows) {
  let reverted = 0;
  const done = [];
  for (const e of rows) {
    const channelId = subscribeChannelId(e);
    const uid = e.user?.telegramUserId;
    if (!channelId || !uid) {
      done.push(e);
      continue;
    }
    const state = await tg.getMembershipState(channelId, uid);
    if (state === "left" && (await revertAudited(e, "subscribe"))) {
      reverted += 1;
      continue;
    }
    done.push(e);
  }
  await reschedule(done);
  return reverted;
}

async function checkWorker(user, firstRows) {
  // Batch everything of this worker that is due (or nearly due) into the same call.
  const more = await dueQuery({ userId: user.id, id: { [Op.notIn]: firstRows.map((r) => r.id) } }, MAX_CHECKS_PER_WORKER)
    .then((rows) => rows.filter((r) => MTPROTO_KINDS.has(kindOf(r))))
    .catch(() => []);
  const rows = [...firstRows, ...more].slice(0, MAX_CHECKS_PER_WORKER);

  const session = workerSession(user);
  if (!session) {
    const lostAt = await markSessionLost(user);
    return handleUncheckable(user, rows, lostAt);
  }

  const checks = [];
  const unbuildable = [];
  for (const e of rows) {
    const c = buildCheck(e);
    if (c) checks.push(c);
    else unbuildable.push(e);
  }
  // Old rows recorded without enough detail can't be re-checked; stop queueing them.
  await setNext(
    unbuildable.map((r) => r.id),
    null
  );
  if (!checks.length) return 0;

  let out;
  try {
    out = await runBridge("audit_batch", { ...session, checks });
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
    await setNext(
      rows.map((r) => r.id),
      new Date(Date.now() + 10 * MIN)
    );
    return 0;
  }

  if (out && out.authorized === false) {
    // Logged out from Telegram's "Active sessions": the stored session is useless now.
    const lostAt = await markSessionLost(user, { clearTokens: true });
    return handleUncheckable(user, rows, lostAt);
  }
  if (user.mtprotoSessionLostAt) {
    await db.User.update({ mtprotoSessionLostAt: null }, { where: { id: user.id } }).catch(() => undefined);
  }

  const results = (out && out.results) || {};
  let reverted = 0;
  const keep = [];
  for (const e of rows) {
    if (!checks.some((c) => c.id === String(e.id))) continue;
    if (results[String(e.id)] === "missing" && (await revertAudited(e, kindOf(e)))) {
      reverted += 1;
      continue;
    }
    keep.push(e);
  }
  if (out && out.floodWait) {
    await setNext(
      keep.map((r) => r.id),
      new Date(Date.now() + 30 * MIN)
    );
  } else {
    await reschedule(keep);
  }
  return reverted;
}

let running = false;

async function runAuditTick() {
  if (!cfg.enabled || running) return { skipped: true };
  running = true;
  const started = Date.now();
  let reverted = 0;
  let due = [];
  try {
    due = await dueQuery({}, DUE_BATCH);
    status.lastDue = due.length;

    const subs = [];
    const byWorker = new Map();
    const finished = [];
    for (const e of due) {
      const kind = kindOf(e);
      if (nextAuditAtFor(e.createdAt) === null || e.task.status !== "completed") {
        finished.push(e.id);
      } else if (kind === "subscribe") {
        subs.push(e);
      } else if (MTPROTO_KINDS.has(kind)) {
        const list = byWorker.get(e.userId) || [];
        list.push(e);
        byWorker.set(e.userId, list);
      } else {
        finished.push(e.id);
      }
    }
    await setNext(finished, null);

    if (tg.isConfigured()) reverted += await checkSubscriptions(subs);
    else await setNext(subs.map((s) => s.id), new Date(Date.now() + 10 * MIN));

    let bridgeCalls = 0;
    for (const [, rows] of byWorker) {
      const user = rows[0].user;
      const needsBridge = Boolean(workerSession(user));
      if (needsBridge && (bridgeCalls >= cfg.maxBridgeCallsPerTick || isBridgeBusy())) {
        // Out of budget this tick (or a user is waiting for the bridge): try again shortly.
        await setNext(
          rows.map((r) => r.id),
          new Date(Date.now() + MIN + Math.floor(Math.random() * MIN))
        );
        continue;
      }
      if (needsBridge) bridgeCalls += 1;
      reverted += await checkWorker(user, rows);
    }
    status.lastError = null;
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    running = false;
    status.lastRunAt = new Date().toISOString();
    status.lastDurationMs = Date.now() - started;
    status.lastReverted = reverted;
    status.totalReverted += reverted;
  }
  return { due: due.length, reverted };
}

/* ── push triggers from the Telegram webhook ────────────────────────── */

let kickTimer = null;
/** Run an audit pass soon (debounced), e.g. right after a webhook event. */
function kickSoon(delayMs = 4000) {
  if (!cfg.enabled || kickTimer) return;
  kickTimer = setTimeout(() => {
    kickTimer = null;
    runAuditTick().catch(() => undefined);
  }, delayMs);
}

/** chat_member update: a user left (or was removed from) a channel the bot administers. */
async function onMemberLeft(chatId, telegramUserId) {
  const user = await db.User.findOne({ where: { telegramUserId: String(telegramUserId) }, attributes: ["id"] });
  if (!user) return;
  await db.UserSubscriptionMemory.destroy({ where: { userId: user.id, channelKey: `sub_${chatId}` } }).catch(
    () => undefined
  );
  const [count] = await db.Engagement.update(
    { nextAuditAt: new Date() },
    {
      where: {
        userId: user.id,
        verificationStatus: "verified",
        nextAuditAt: { [Op.ne]: null },
        engagementType: "subscribe"
      }
    }
  );
  if (count) kickSoon();
}

// Last reaction total seen per post; only a DROP means someone removed a reaction.
const reactionTotals = new Map();

/** message_reaction_count update: reactions on a channel post changed. */
async function onReactionCount(chatId, messageId, reactions) {
  const total = (Array.isArray(reactions) ? reactions : []).reduce((n, r) => n + Number(r?.total_count || 0), 0);
  const key = `${chatId}:${messageId}`;
  const before = reactionTotals.get(key);
  if (reactionTotals.size > 20000) reactionTotals.clear();
  reactionTotals.set(key, total);
  const where = {
    verificationStatus: "verified",
    actionKind: "like",
    nextAuditAt: { [Op.ne]: null },
    metaEngagementId: { [Op.like]: `tg-like-%-${String(chatId)}-${Number(messageId)}--%` }
  };
  if (before == null) {
    // First event since restart: we only know something is off if the post now has fewer
    // reactions than the likes we paid for on it.
    const paid = await db.Engagement.count({ where });
    if (total >= paid) return;
  } else if (total >= before) {
    return;
  }
  const [count] = await db.Engagement.update({ nextAuditAt: new Date() }, { where });
  if (count) kickSoon();
}

/** Called after a worker verifies their phone again: re-check their actions right away. */
async function onSessionRestored(userId) {
  await db.Engagement.update(
    { nextAuditAt: new Date() },
    { where: { userId, verificationStatus: "verified", nextAuditAt: { [Op.ne]: null } } }
  ).catch(() => undefined);
  kickSoon(15_000);
}

/**
 * Admin "re-check now": queue every action of the given kinds that is still inside the
 * guarantee period, then run one pass (later ticks work through the rest of the queue).
 */
async function recheckNow(kind = "all") {
  const where = {
    verificationStatus: "verified",
    createdAt: { [Op.gt]: new Date(Date.now() - guaranteeMs()) }
  };
  if (kind === "subscribe") where.engagementType = "subscribe";
  else if (MTPROTO_KINDS.has(kind)) where.actionKind = kind;
  const [queued] = await db.Engagement.update({ nextAuditAt: new Date() }, { where });
  const pass = await runAuditTick();
  return { queued, ...pass };
}

/* ── "Subscribed" badges (cross-campaign memory) ────────────────────── */

async function auditSubscriptionMemory() {
  if (!cfg.enabled || !tg.isConfigured()) return { scanned: 0, cleared: 0 };
  const cursor = await auditCursor.get("subscriptionMemory");
  const rows = await db.UserSubscriptionMemory.findAll({
    where: auditCursor.where(cursor),
    include: [{ model: db.User, as: "user", required: true, attributes: ["id", "telegramUserId"] }],
    order: [["id", "DESC"]],
    limit: auditCursor.BATCH_SIZE
  });
  await auditCursor.advance("subscriptionMemory", rows);
  let cleared = 0;
  for (const row of rows) {
    const m = /^sub_(-?\d+)$/.exec(String(row.channelKey || ""));
    if (!m || !row.user?.telegramUserId) continue;
    if ((await tg.getMembershipState(m[1], row.user.telegramUserId)) !== "left") continue;
    await db.UserSubscriptionMemory.destroy({ where: { id: row.id } }).catch(() => undefined);
    cleared += 1;
  }
  return { scanned: rows.length, cleared };
}

/* ── startup ────────────────────────────────────────────────────────── */

/** Queue every verified action still inside the guarantee period that has no schedule yet. */
async function backfillSchedule() {
  const [count] = await db.Engagement.update(
    { nextAuditAt: new Date() },
    {
      where: {
        verificationStatus: "verified",
        nextAuditAt: null,
        createdAt: { [Op.gt]: new Date(Date.now() - guaranteeMs()) }
      }
    }
  );
  return count;
}

function startEngagementAudits() {
  if (!cfg.enabled) return;
  backfillSchedule().catch(() => undefined);
  if (env.isProduction) {
    tg.ensureWebhookUpdates()
      .then((r) => {
        // eslint-disable-next-line no-console
        if (r.changed) console.log("Telegram webhook now also receives chat_member + reaction updates");
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.warn("Could not update Telegram webhook updates:", e.message);
      });
  }
  setTimeout(() => runAuditTick().catch(() => undefined), 30_000);
  setInterval(() => runAuditTick().catch(() => undefined), cfg.tickMs);
  setInterval(() => auditSubscriptionMemory().catch(() => undefined), 10 * MIN);
}

function getAuditStatus() {
  return { ...status, guaranteeDays: cfg.guaranteeDays };
}

module.exports = {
  startEngagementAudits,
  runAuditTick,
  firstAuditAt,
  nextAuditAtFor,
  onMemberLeft,
  onReactionCount,
  onSessionRestored,
  auditSubscriptionMemory,
  recheckNow,
  backfillSchedule,
  getAuditStatus,
  // exported for tests
  _internal: { parseLikeMeta, parseCommentMeta, parseShareMeta, buildCheck, kindOf, subscribeChannelId }
};
