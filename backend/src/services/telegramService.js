const crypto = require("crypto");
const axios = require("axios");
const env = require("../config/env");
const { signedTelegramPhotoPath } = require("../utils/mediaSigning");

const TG_API = "https://api.telegram.org";

function isConfigured() {
  return Boolean(env.telegram.botToken && String(env.telegram.botToken).length > 10);
}

/**
 * @param {string} method
 * @param {Record<string, string|number|undefined>} form
 */
async function botRequest(method, form) {
  if (!isConfigured()) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured on the server");
  }
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) {
    if (v == null) continue;
    usp.set(k, String(v));
  }
  const { data } = await axios.post(`${TG_API}/bot${env.telegram.botToken}/${method}`, usp, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    validateStatus: () => true
  });
  if (data == null) {
    throw new Error("Telegram API: empty response");
  }
  if (data.ok !== true) {
    const m = data.description || "Telegram API request failed";
    throw new Error(typeof m === "string" ? m : "Telegram API request failed");
  }
  return data;
}

/**
 * @see https://core.telegram.org/widgets/login#checking-authorization
 * @param {Record<string, string>} authData
 */
function verifyWidgetLogin(authData) {
  if (!isConfigured()) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  if (!authData || typeof authData !== "object") {
    return false;
  }
  const receivedHash = authData.hash;
  if (!receivedHash) return false;

  const dataCheck = Object.keys(authData)
    .filter((k) => k !== "hash" && authData[k] != null)
    .sort()
    .map((k) => `${k}=${authData[k]}`)
    .join("\n");

  const secret = crypto.createHash("sha256").update(env.telegram.botToken).digest();
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(dataCheck);
  const check = hmac.digest("hex");
  if (check.length !== receivedHash.length) return false;
  const a = Buffer.from(receivedHash, "hex");
  const b = Buffer.from(check, "hex");
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  const now = Math.floor(Date.now() / 1000);
  const age = 86400; // 24h
  const at = parseInt(String(authData.auth_date || 0), 10);
  if (Number.isFinite(at) && (now - at > age || at > now + 60)) {
    return false;
  }
  return true;
}

function isLikelyTelegramMessageUrl(u) {
  if (!u) return false;
  const s = String(u).trim();
  if (!/^https?:\/\//i.test(s)) return false;
  return /^https?:\/\/(www\.)?t\.me\//i.test(s);
}

/**
 * t.me/ChannelName/5 or t.me/c/100123/99
 * @param {string} url
 */
function parseTmeMessageUrl(url) {
  const raw = String(url || "").trim();
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/i.test(u.protocol)) return null;
  const host = (u.hostname || "").toLowerCase().replace(/^www\./, "");
  if (host !== "t.me") return null;
  const path = (u.pathname || "/").split("/").filter(Boolean);
  if (path[0] === "c" && /^\d+$/.test(String(path[1] || "")) && /^\d+$/.test(String(path[2] || ""))) {
    return { kind: "private", supergroupInternal: path[1], messageId: path[2], raw: raw };
  }
  if (path[0] && path[1] && /^\d+$/.test(String(path[1]))) {
    return { kind: "public", username: path[0], messageId: path[1], raw: raw };
  }
  return null;
}

function stableKeyFromTmeMessage(parsed) {
  if (!parsed) return null;
  if (parsed.kind === "public") {
    return `t_${String(parsed.username).toLowerCase()}_${parsed.messageId}`;
  }
  return `tc_${parsed.supergroupInternal}_${parsed.messageId}`;
}

/** t.me/c/{n}/… path segment → Bot API supergroup id (often `-100` + n). */
function cSegmentToLikelyChatId(segment) {
  if (!segment || !/^\d+$/.test(String(segment))) return null;
  return `-100${String(segment)}`;
}

/** Resolve channel chat id for membership checks. Public: @username. For private t.me/c/... links, compare to owner's connected channel when set. */
async function resolveChannelChatIdFromTme(parsed, ownerActingChannelId) {
  if (!parsed) return { chatId: null, error: "Invalid Telegram message link" };
  if (parsed.kind === "public") {
    const chat = await getChat(`@${parsed.username.replace(/^@/, "")}`);
    if (!chat || chat.id == null) {
      return { chatId: null, error: "Could not resolve channel" };
    }
    return { chatId: String(chat.id), title: chat.title || null };
  }
  const guess = cSegmentToLikelyChatId(parsed.supergroupInternal);
  if (!guess) return { chatId: null, error: "Invalid private channel link" };
  if (ownerActingChannelId && String(ownerActingChannelId) !== String(guess)) {
    return {
      chatId: guess,
      error:
        "This private channel link does not match your connected channel in Settings. " +
        "Use a post link from the channel you linked, or add that channel again."
    };
  }
  return { chatId: String(guess), title: null };
}

/**
 * @param {string|number} chatId
 */
async function getChat(chatId) {
  const data = await botRequest("getChat", { chat_id: String(chatId) });
  return data.result;
}

async function getChatMemberCount(chatId) {
  const data = await botRequest("getChatMemberCount", { chat_id: String(chatId) });
  return Number(data.result || 0);
}

/**
 * Telegram file paths stay valid for at least an hour. Cache them (bounded) so the media
 * proxy does not hit getChat/getFile for every image request.
 * key "chat:<id>" | "user:<id>" -> { filePath: string|null, at: number }
 */
const photoPathCache = new Map();
const PHOTO_CACHE_TTL_MS = 30 * 60 * 1000;
const PHOTO_CACHE_MAX = 500;

function cacheGet(key) {
  const hit = photoPathCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > PHOTO_CACHE_TTL_MS) {
    photoPathCache.delete(key);
    return undefined;
  }
  return hit.filePath;
}

function cacheSet(key, filePath) {
  if (photoPathCache.size >= PHOTO_CACHE_MAX) {
    const oldest = photoPathCache.keys().next().value;
    if (oldest !== undefined) photoPathCache.delete(oldest);
  }
  photoPathCache.set(key, { filePath, at: Date.now() });
}

async function filePathForFileId(fileId) {
  if (!fileId) return null;
  const fileInfo = await botRequest("getFile", { file_id: String(fileId) });
  return fileInfo?.result?.file_path || null;
}

/** Server-side only: resolves the Telegram file path of a chat's photo (never send to clients). */
async function resolveChatPhotoFilePath(chatId) {
  if (!isConfigured() || chatId == null) return null;
  const key = `chat:${chatId}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  try {
    const chat = await getChat(chatId);
    const fileId = chat?.photo?.big_file_id || chat?.photo?.small_file_id || null;
    const filePath = await filePathForFileId(fileId);
    cacheSet(key, filePath);
    return filePath;
  } catch {
    return null;
  }
}

/** Server-side only: resolves the Telegram file path of a user's newest profile photo. */
async function resolveUserPhotoFilePath(userTelegramId) {
  if (!isConfigured() || userTelegramId == null) return null;
  const key = `user:${userTelegramId}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  try {
    const photos = await botRequest("getUserProfilePhotos", {
      user_id: String(userTelegramId),
      limit: 1
    });
    const firstSet = photos?.result?.photos?.[0];
    const lastSize = Array.isArray(firstSet) && firstSet.length > 0 ? firstSet[firstSet.length - 1] : null;
    const filePath = await filePathForFileId(lastSize?.file_id);
    cacheSet(key, filePath);
    return filePath;
  } catch {
    return null;
  }
}

/** Streams a Telegram file. The bot-token URL never leaves the server. */
async function fetchTelegramFileStream(filePath) {
  if (!isConfigured() || !filePath) return null;
  const res = await axios.get(`${TG_API}/file/bot${env.telegram.botToken}/${filePath}`, {
    responseType: "stream",
    timeout: 15000,
    maxContentLength: 10 * 1024 * 1024,
    validateStatus: () => true
  });
  if (res.status !== 200) {
    res.data?.destroy?.();
    return null;
  }
  return { stream: res.data, contentType: String(res.headers["content-type"] || "image/jpeg") };
}

/**
 * @param {string|number} chatId
 * @param {string} text
 * @param {object} [replyMarkup] Telegram reply_markup object (e.g. inline_keyboard)
 */
async function sendBotMessage(chatId, text, replyMarkup) {
  return botRequest("sendMessage", {
    chat_id: String(chatId),
    text,
    ...(replyMarkup ? { reply_markup: JSON.stringify(replyMarkup) } : {})
  });
}

async function answerCallbackQuery(callbackQueryId, text) {
  return botRequest("answerCallbackQuery", {
    callback_query_id: String(callbackQueryId),
    ...(text ? { text } : {})
  });
}

async function editBotMessageText(chatId, messageId, text) {
  return botRequest("editMessageText", {
    chat_id: String(chatId),
    message_id: String(messageId),
    text
  });
}

/** Public URL (our signed media proxy) for a chat photo, or null when the chat has no photo. */
async function getChatPhotoUrl(chatId) {
  const filePath = await resolveChatPhotoFilePath(chatId);
  return filePath ? signedTelegramPhotoPath("chat", chatId) : null;
}

/**
 * @param {string|number} channelChatId
 * @param {string|number} userTelegramId
 */
async function isUserMemberOrAdminOfChat(channelChatId, userTelegramId) {
  if (!isConfigured() || !channelChatId || userTelegramId == null) return false;
  const detail = await getUserChatMemberStatus(channelChatId, userTelegramId);
  return detail.ok;
}

/**
 * Returns detailed membership check result for better UX/debugging.
 * @param {string|number} channelChatId
 * @param {string|number} userTelegramId
 */
async function getUserChatMemberStatus(channelChatId, userTelegramId) {
  if (!isConfigured() || !channelChatId || userTelegramId == null) {
    return { ok: false, status: null, error: "Bot is not configured" };
  }
  try {
    const data = await botRequest("getChatMember", {
      chat_id: String(channelChatId),
      user_id: String(userTelegramId)
    });
    const st = data.result && data.result.status;
    if (st === "left" || st === "kicked" || st === "error" || !st) {
      return { ok: false, status: st || null, error: `Status is ${st || "unknown"}` };
    }
    const ok = st === "member" || st === "administrator" || st === "creator" || st === "restricted";
    return { ok, status: st, error: ok ? null : `Status is ${st}` };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { ok: false, status: null, error: raw || "Telegram getChatMember failed" };
  }
}

/**
 * Definitive membership state for audits: "member" | "left" | "unknown".
 * Only an explicit Telegram answer counts as "left"; network errors, rate limits or the bot
 * losing admin rights are "unknown" so an honest worker is never penalised for our errors.
 */
async function getMembershipState(channelChatId, userTelegramId) {
  if (!isConfigured() || !channelChatId || userTelegramId == null) return "unknown";
  try {
    const data = await botRequest("getChatMember", {
      chat_id: String(channelChatId),
      user_id: String(userTelegramId)
    });
    const m = data.result || {};
    const st = m.status;
    if (st === "left" || st === "kicked") return "left";
    if (st === "restricted") return m.is_member === false ? "left" : "member";
    if (st === "member" || st === "administrator" || st === "creator") return "member";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Updates the webhook must receive (login, unsubscribe and reaction events). */
const WEBHOOK_UPDATES = ["message", "callback_query", "chat_member", "message_reaction_count"];

/**
 * Makes sure the existing webhook also delivers "user left the channel" (chat_member) and
 * "reactions changed" (message_reaction_count) events, which Telegram only sends on request.
 * Keeps the current URL and re-sends the secret (setWebhook would otherwise drop it).
 */
async function ensureWebhookUpdates() {
  if (!isConfigured() || !env.telegram.webhookSecret) return { changed: false, reason: "not configured" };
  const info = await botRequest("getWebhookInfo", {});
  const url = info.result && info.result.url;
  if (!url) return { changed: false, reason: "no webhook" };
  const have = new Set((info.result && info.result.allowed_updates) || []);
  if (WEBHOOK_UPDATES.every((u) => have.has(u))) return { changed: false };
  await botRequest("setWebhook", {
    url,
    secret_token: env.telegram.webhookSecret,
    allowed_updates: JSON.stringify(WEBHOOK_UPDATES),
    max_connections: 40
  });
  return { changed: true };
}

async function isUserChannelAdminOrCreator(channelChatId, userTelegramId) {
  if (!isConfigured() || !channelChatId || userTelegramId == null) return false;
  try {
    const data = await botRequest("getChatMember", {
      chat_id: String(channelChatId),
      user_id: String(userTelegramId)
    });
    const st = data.result && data.result.status;
    if (st === "creator" || st === "administrator") {
      if (st === "administrator" && data.result) {
        const c = data.result;
        if (c.can_post_messages === false) {
          // still admin; allow
        }
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Returns Telegram user object from getChatMember when available.
 * Useful for resolving username without requiring re-login.
 */
async function getChatMemberUser(channelChatId, userTelegramId) {
  if (!isConfigured() || !channelChatId || userTelegramId == null) return null;
  try {
    const data = await botRequest("getChatMember", {
      chat_id: String(channelChatId),
      user_id: String(userTelegramId)
    });
    return data?.result?.user || null;
  } catch {
    return null;
  }
}

/** Public URL (our signed media proxy) for a user's photo, or null when they have none. */
async function getUserProfilePhotoUrl(userTelegramId) {
  const filePath = await resolveUserPhotoFilePath(userTelegramId);
  return filePath ? signedTelegramPhotoPath("user", userTelegramId) : null;
}

/**
 * @param {string|number} chatId
 * @param {string} username
 */
function chatMatchesIdOrUsername(info, userSelectedChannel) {
  if (info == null) return false;
  const s = String(userSelectedChannel);
  if (s.startsWith("-")) {
    return String(info.id) === s;
  }
  if (s.startsWith("@")) {
    const h = s.slice(1).toLowerCase();
    const un = (info.username || "").toLowerCase();
    if (un && un === h) return true;
  } else {
    if ((info.username || "").toLowerCase() === s.toLowerCase()) return true;
  }
  return false;
}

/** Fetch t.me and parse <meta property="og:..."> (best-effort). */
async function fetchTmePagePreview(tmeUrl) {
  if (!isLikelyTelegramMessageUrl(tmeUrl)) {
    return { imageUrl: null, title: null, description: null, isVideo: false };
  }
  const url = tmeUrl.trim();
  if (!isConfigured() || isLikelyTelegramMessageUrl(url) === false) {
    return { imageUrl: null, title: null, description: null, isVideo: false };
  }
  try {
    const { data } = await axios.get(url, {
      timeout: 10_000,
      headers: { "User-Agent": "ExchangeTunnel/1.0" },
      validateStatus: (s) => s >= 200 && s < 500
    });
    if (typeof data !== "string" || !data) {
      return { imageUrl: null, title: "Telegram", description: "Open link in Telegram", isVideo: false };
    }
    const og = (n) => {
      const m = new RegExp(`<meta\\s+property="og:${n}"\\s+content="([^"]+)"`, "i").exec(data);
      return m && m[1] ? m[1].replace(/&amp;/g, "&") : null;
    };
    const title = og("title");
    const description = og("description");
    const image = og("image");
    return {
      imageUrl: image,
      title: title || "Telegram",
      description: description || "Telegram public post or channel",
      isVideo: false
    };
  } catch {
    return { imageUrl: null, title: "Telegram", description: "Message link (preview not available)", isVideo: false };
  }
}

module.exports = {
  isConfigured,
  verifyWidgetLogin,
  isLikelyTelegramMessageUrl,
  parseTmeMessageUrl,
  stableKeyFromTmeMessage,
  cSegmentToLikelyChatId,
  resolveChannelChatIdFromTme,
  getChat,
  getChatMemberCount,
  getChatPhotoUrl,
  isUserMemberOrAdminOfChat,
  getUserChatMemberStatus,
  getMembershipState,
  ensureWebhookUpdates,
  isUserChannelAdminOrCreator,
  getChatMemberUser,
  getUserProfilePhotoUrl,
  resolveChatPhotoFilePath,
  resolveUserPhotoFilePath,
  fetchTelegramFileStream,
  sendBotMessage,
  answerCallbackQuery,
  editBotMessageText,
  chatMatchesIdOrUsername,
  fetchTmePagePreview
};
