/**
 * In-memory pending logins for the "open bot in Telegram" flow.
 * Single-instance friendly (e.g. one Render web process). For horizontal scale, use Redis.
 *
 * Flow:
 *   1. browser: create(token) -> gets token + short confirm code
 *   2. user taps t.me/<bot>?start=login_<token> -> webhook: awaitConfirmation(token, from)
 *      and the bot asks "Confirm sign-in? code XXXX" with inline buttons
 *   3. user taps Confirm -> webhook: confirm(token, fromId) -> row.resolved = from
 *   4. browser poll: takeResolved(token)
 * Step 3 stops a forwarded/phished link from silently signing someone in.
 */
const crypto = require("crypto");

const TTL_MS = 15 * 60 * 1000;
const MAX_PENDING = 5000;

/** @typedef {{ id: number, first_name?: string, last_name?: string, username?: string, photo_url?: string }} TelegramFrom */

/** @type {Map<string, { expires: number, code: string, awaiting?: TelegramFrom, resolved?: TelegramFrom, linkUserId?: number, cancelled?: boolean }>} */
const pending = new Map();

function prune() {
  const now = Date.now();
  for (const [k, v] of pending.entries()) {
    if (v.expires < now) pending.delete(k);
  }
}
setInterval(prune, 60 * 1000).unref();

function confirmCodeFor(token) {
  return crypto.createHash("sha256").update(`confirm:${token}`).digest("hex").slice(0, 4).toUpperCase();
}

/**
 * @param {string} token
 * @param {{ linkUserId?: number }} [opts]
 * @returns {string} short confirmation code to show in the browser
 */
function create(token, opts = {}) {
  if (pending.size >= MAX_PENDING) prune();
  if (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next().value;
    if (oldest !== undefined) pending.delete(oldest);
  }
  const code = confirmCodeFor(token);
  pending.set(token, {
    expires: Date.now() + TTL_MS,
    code,
    ...(opts.linkUserId != null ? { linkUserId: opts.linkUserId } : {})
  });
  return code;
}

/** @param {string} token */
function peek(token) {
  const row = pending.get(token);
  if (!row || row.expires < Date.now()) {
    if (row) pending.delete(token);
    return null;
  }
  return row;
}

/**
 * Called when the user opens the bot with /start login_<token>.
 * @param {string} token
 * @param {TelegramFrom} from
 * @returns {null | { code: string, linkMode: boolean }}
 */
function awaitConfirmation(token, from) {
  const row = peek(token);
  if (!row || row.resolved || row.cancelled) return null;
  // First Telegram account to open the link owns the confirmation step.
  if (row.awaiting && String(row.awaiting.id) !== String(from.id)) return null;
  row.awaiting = from;
  return { code: row.code, linkMode: row.linkUserId != null };
}

/**
 * Called when the user taps "Confirm" in the bot chat.
 * @param {string} token
 * @param {string|number} fromId
 */
function confirm(token, fromId) {
  const row = peek(token);
  if (!row || row.resolved || row.cancelled || !row.awaiting) return false;
  if (String(row.awaiting.id) !== String(fromId)) return false;
  row.resolved = row.awaiting;
  return true;
}

/** @param {string} token @param {string|number} fromId */
function cancel(token, fromId) {
  const row = peek(token);
  if (!row || row.resolved || !row.awaiting) return false;
  if (String(row.awaiting.id) !== String(fromId)) return false;
  row.cancelled = true;
  return true;
}

/** @param {string} token */
function takeResolved(token) {
  const row = peek(token);
  if (!row || !row.resolved) return null;
  pending.delete(token);
  return row.resolved;
}

module.exports = {
  create,
  peek,
  awaitConfirmation,
  confirm,
  cancel,
  takeResolved,
  TTL_MS
};
