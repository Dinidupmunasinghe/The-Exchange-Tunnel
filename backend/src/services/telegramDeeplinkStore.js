/**
 * In-memory pending logins for "open bot in Telegram" flow.
 * Single-instance friendly (e.g. one Render web process). For horizontal scale, use Redis.
 */

const TTL_MS = 15 * 60 * 1000;

/** @typedef {{ id: number, first_name?: string, last_name?: string, username?: string, photo_url?: string }} TelegramFrom */

/** @type {Map<string, { expires: number, resolved?: TelegramFrom, linkUserId?: number }>} */
const pending = new Map();

function prune() {
  const now = Date.now();
  for (const [k, v] of pending.entries()) {
    if (v.expires < now) pending.delete(k);
  }
}

/**
 * @param {string} token
 * @param {TelegramFrom} from
 */
function resolve(token, from) {
  prune();
  const row = pending.get(token);
  if (!row || row.expires < Date.now() || row.resolved) return false;
  row.resolved = from;
  return true;
}

/**
 * @param {string} token
 */
function takeResolved(token) {
  prune();
  const row = pending.get(token);
  if (!row || !row.resolved) return null;
  pending.delete(token);
  return row.resolved;
}

/**
 * @param {string} token
 */
/**
 * @param {string} token
 * @param {{ linkUserId?: number }} [opts]
 */
function create(token, opts = {}) {
  prune();
  pending.set(token, {
    expires: Date.now() + TTL_MS,
    ...(opts.linkUserId != null ? { linkUserId: opts.linkUserId } : {})
  });
}

/**
 * @param {string} token
 */
function peek(token) {
  prune();
  const row = pending.get(token);
  if (!row || row.expires < Date.now()) {
    if (row) pending.delete(token);
    return null;
  }
  return row;
}

module.exports = {
  create,
  peek,
  resolve,
  takeResolved,
  TTL_MS
};
