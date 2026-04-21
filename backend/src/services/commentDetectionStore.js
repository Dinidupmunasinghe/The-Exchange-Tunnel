/**
 * In-memory pending comment detection sessions.
 * Single-instance friendly. For horizontal scale, move to Redis.
 */

const TTL_MS = 60 * 1000;

/**
 * @typedef {{
 *  token: string,
 *  userId: number,
 *  telegramUserId: string,
 *  taskId: number,
 *  campaignId: number,
 *  discussionChatId: string,
 *  expires: number,
 *  resolvedAt?: number,
 *  consumed?: boolean
 * }} PendingCommentDetect
 */

/** @type {Map<string, PendingCommentDetect>} */
const pendingByToken = new Map();

function prune() {
  const now = Date.now();
  for (const [k, v] of pendingByToken.entries()) {
    if (v.expires < now) pendingByToken.delete(k);
  }
}

/**
 * @param {PendingCommentDetect} row
 */
function create(row) {
  prune();
  pendingByToken.set(row.token, row);
}

/**
 * @param {string} token
 */
function peek(token) {
  prune();
  return pendingByToken.get(token) || null;
}

/**
 * @param {string|number} discussionChatId
 * @param {string|number} telegramUserId
 * @returns {boolean}
 */
function resolveByTelegramMessage(discussionChatId, telegramUserId) {
  prune();
  const chat = String(discussionChatId);
  const uid = String(telegramUserId);
  const now = Date.now();
  let matched = false;
  for (const row of pendingByToken.values()) {
    if (row.resolvedAt || row.consumed) continue;
    if (row.discussionChatId !== chat) continue;
    if (row.telegramUserId !== uid) continue;
    row.resolvedAt = now;
    matched = true;
  }
  return matched;
}

/**
 * @param {string} token
 * @param {number} userId
 * @param {number} taskId
 */
function consumeResolved(token, userId, taskId) {
  prune();
  const row = pendingByToken.get(token);
  if (!row) return { ok: false, reason: "missing" };
  if (row.userId !== userId || row.taskId !== taskId) return { ok: false, reason: "mismatch" };
  if (!row.resolvedAt) return { ok: false, reason: "not_resolved" };
  if (row.consumed) return { ok: false, reason: "already_consumed" };
  row.consumed = true;
  return { ok: true, row };
}

module.exports = {
  TTL_MS,
  create,
  peek,
  resolveByTelegramMessage,
  consumeResolved
};
