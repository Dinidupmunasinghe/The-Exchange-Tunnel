const {
  isConfigured,
  isLikelyTelegramMessageUrl,
  getChat,
  isUserChannelAdminOrCreator,
  fetchTmePagePreview
} = require("../services/telegramService");
const { runBridge } = require("../services/telegramMtprotoService");
const { encrypt, decrypt } = require("../utils/crypto");
const env = require("../config/env");

function parseStoredMtprotoCredentials(user) {
  if (!user.userOAuthTokenEncrypted) return null;
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
  if (!user.userActingTokenEncrypted) return null;
  try {
    return decrypt(user.userActingTokenEncrypted);
  } catch {
    return null;
  }
}

function resolveMtprotoCredentials(body) {
  const reqApiId = body?.apiId;
  const reqApiHash = body?.apiHash;
  const apiId = reqApiId || env.telegram.mtproto.apiId;
  const apiHash = reqApiHash || env.telegram.mtproto.apiHash;
  if (!apiId || !apiHash) return null;
  return { apiId, apiHash };
}

function handleMtprotoError(res, error, fallbackMessage) {
  const code = error?.code;
  if (code === "FLOOD_WAIT") {
    return res.status(429).json({
      code,
      waitSeconds: Number(error.waitSeconds || 0),
      message: error.message || "Too many Telegram requests. Please retry later."
    });
  }
  if (code === "BRIDGE_TIMEOUT") {
    return res.status(504).json({ code, message: "Telegram bridge timed out. Please retry." });
  }
  if (code === "REACTION_NOT_VERIFIED") {
    return res.status(400).json({ code, message: error.message || fallbackMessage });
  }
  return res.status(400).json({ code: code || "MTPROTO_ERROR", message: error.message || fallbackMessage });
}

async function connectChannelToUser(req, res) {
  const raw = req.body && typeof req.body.channel === "string" ? req.body.channel.trim() : "";
  if (!isConfigured()) {
    return res.status(503).json({ message: "TELEGRAM_BOT_TOKEN is not configured" });
  }
  if (!req.user.telegramUserId) {
    return res.status(400).json({ message: "Log in with Telegram first" });
  }
  if (!raw) {
    return res.status(400).json({ message: "channel is required (e.g. @mychannel or t.me/…)" });
  }
  let chatRef = raw;
  if (raw.startsWith("http")) {
    try {
      const p = new URL(raw).pathname.split("/").filter(Boolean);
      if (p[0] && p[0] !== "c") {
        chatRef = `@${p[0]}`;
      }
    } catch {
      return res.status(400).json({ message: "Invalid channel URL" });
    }
  }

  let chat;
  try {
    chat = await getChat(chatRef);
  } catch (e) {
    return res.status(400).json({
      message:
        e.message || "Could not load this Telegram channel. Use @username (with the bot added to the channel)."
    });
  }
  if (!chat || !chat.id) {
    return res.status(400).json({ message: "Could not load this Telegram channel" });
  }
  const ok = await isUserChannelAdminOrCreator(String(chat.id), String(req.user.telegramUserId));
  if (!ok) {
    return res.status(403).json({
      message:
        "Your Telegram account must be an admin of this channel, and the bot must be added to the channel first. " +
        "Add the bot as an administrator (so it can check membership), then try again."
    });
  }
  const title = chat.title || (chat.username ? `@${chat.username}` : "Channel");
  await req.user.setActingTelegramChannel({ id: String(chat.id), title });
  await req.user.save();
  return res.json({
    message: "Telegram channel connected",
    pages: [
      {
        id: String(chat.id),
        name: title,
        category: chat.type || null,
        tasks: [],
        pictureUrl: null
      }
    ]
  });
}

function getMyPosts(req, res) {
  return res.json({
    page: {
      id: req.user.telegramActingChannelId,
      name: req.user.telegramActingChannelTitle
    },
    posts: []
  });
}

function getPostPreview(req, res) {
  const url = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!isLikelyTelegramMessageUrl(url)) {
    return res.status(400).json({ message: "Use a t.me/… public post or channel post link" });
  }
  return fetchTmePagePreview(url)
    .then((preview) => res.json(preview))
    .catch((e) => res.status(400).json({ message: e.message || "Preview failed" }));
}

function getManagedAccounts(req, res) {
  if (!req.user.telegramUserId) {
    return res.status(400).json({ message: "Telegram account not linked" });
  }
  const chId = req.user.telegramActingChannelId;
  const chName = req.user.telegramActingChannelTitle;
  if (!chId) {
    return res.json({ pages: [], selectedPageId: null });
  }
  return res.json({
    pages: [
      {
        id: String(chId),
        name: chName || "Channel",
        category: null,
        tasks: [],
        pictureUrl: null,
        selected: true
      }
    ],
    selectedPageId: String(chId)
  });
}

function selectManagedAccount(req, res) {
  if (!req.user.telegramActingChannelId) {
    return res.status(400).json({ message: "Connect a channel in Settings first" });
  }
  if (String(req.user.telegramActingChannelId) !== String(req.body.pageId)) {
    return res.status(404).json({ message: "Channel not found" });
  }
  return res.json({
    message: "Channel selected",
    page: {
      id: String(req.user.telegramActingChannelId),
      name: req.user.telegramActingChannelTitle || "Channel"
    }
  });
}

async function clearSelectedAccount(req, res) {
  await req.user.clearActingTelegramChannel();
  await req.user.save();
  return res.json({ message: "Selected channel removed" });
}

async function sendMtprotoCode(req, res) {
  const { phone, proxy } = req.body || {};
  const creds = resolveMtprotoCredentials(req.body || {});
  if (!creds || !phone) {
    return res.status(400).json({ message: "phone is required, and MTProto credentials must be configured" });
  }
  try {
    const result = await runBridge("send_code", { apiId: creds.apiId, apiHash: creds.apiHash, phone, proxy });
    return res.json(result);
  } catch (error) {
    return handleMtprotoError(res, error, "Failed to send Telegram code");
  }
}

async function mtprotoSignIn(req, res) {
  const { phone, phoneCode, phoneCodeHash, proxy } = req.body || {};
  const creds = resolveMtprotoCredentials(req.body || {});
  if (!creds || !phone || !phoneCode) {
    return res.status(400).json({ message: "phone and phoneCode are required, and MTProto credentials must be configured" });
  }
  try {
    const result = await runBridge("sign_in", {
      apiId: creds.apiId,
      apiHash: creds.apiHash,
      phone,
      phoneCode,
      phoneCodeHash,
      proxy
    });
    if (result.requires2fa) {
      req.user.userOAuthTokenEncrypted = encrypt(
        JSON.stringify({ apiId: creds.apiId, apiHash: creds.apiHash, proxy: proxy || null })
      );
      if (result.sessionString) {
        req.user.userActingTokenEncrypted = encrypt(result.sessionString);
      }
      await req.user.save();
      return res.status(200).json({ ...result, sessionSaved: true });
    }
    req.user.userOAuthTokenEncrypted = encrypt(
      JSON.stringify({ apiId: creds.apiId, apiHash: creds.apiHash, proxy: proxy || null })
    );
    req.user.userActingTokenEncrypted = encrypt(result.sessionString);
    await req.user.save();
    return res.json({
      ...result,
      sessionSaved: true
    });
  } catch (error) {
    return handleMtprotoError(res, error, "Failed to sign in to Telegram");
  }
}

async function mtprotoSignInPassword(req, res) {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ message: "password is required" });
  }

  const creds = parseStoredMtprotoCredentials(req.user);
  const sessionString = parseStoredSessionString(req.user);
  if (!creds) {
    return res.status(400).json({ message: "No MTProto credentials found. Start login again." });
  }

  try {
    const result = await runBridge("sign_in_password", {
      apiId: creds.apiId,
      apiHash: creds.apiHash,
      proxy: creds.proxy || null,
      sessionString,
      password
    });
    req.user.userActingTokenEncrypted = encrypt(result.sessionString);
    await req.user.save();
    return res.json({
      ...result,
      sessionSaved: true
    });
  } catch (error) {
    return handleMtprotoError(res, error, "2FA sign-in failed");
  }
}

async function mtprotoJoinChannel(req, res) {
  const { channel } = req.body || {};
  if (!channel) {
    return res.status(400).json({ message: "channel is required" });
  }
  const creds = parseStoredMtprotoCredentials(req.user);
  const sessionString = parseStoredSessionString(req.user);
  if (!creds || !sessionString) {
    return res.status(400).json({ message: "No authorized Telegram user session found." });
  }
  try {
    const result = await runBridge("join_channel", {
      apiId: creds.apiId,
      apiHash: creds.apiHash,
      proxy: creds.proxy || null,
      sessionString,
      channel
    });
    return res.json(result);
  } catch (error) {
    return handleMtprotoError(res, error, "Failed to join channel");
  }
}

async function mtprotoReact(req, res) {
  const { chat, msgId, reaction } = req.body || {};
  if (!chat || !msgId || !reaction) {
    return res.status(400).json({ message: "chat, msgId and reaction are required" });
  }
  const creds = parseStoredMtprotoCredentials(req.user);
  const sessionString = parseStoredSessionString(req.user);
  if (!creds || !sessionString) {
    return res.status(400).json({ message: "No authorized Telegram user session found." });
  }
  try {
    const result = await runBridge("react", {
      apiId: creds.apiId,
      apiHash: creds.apiHash,
      proxy: creds.proxy || null,
      sessionString,
      chat,
      msgId,
      reaction
    });
    return res.json(result);
  } catch (error) {
    return handleMtprotoError(res, error, "Failed to react to message");
  }
}

async function mtprotoReply(req, res) {
  const { chat, msgId, text } = req.body || {};
  if (!chat || !msgId || !text) {
    return res.status(400).json({ message: "chat, msgId and text are required" });
  }
  const creds = parseStoredMtprotoCredentials(req.user);
  const sessionString = parseStoredSessionString(req.user);
  if (!creds || !sessionString) {
    return res.status(400).json({ message: "No authorized Telegram user session found." });
  }
  try {
    const result = await runBridge("reply", {
      apiId: creds.apiId,
      apiHash: creds.apiHash,
      proxy: creds.proxy || null,
      sessionString,
      chat,
      msgId,
      text
    });
    return res.json(result);
  } catch (error) {
    return handleMtprotoError(res, error, "Failed to post reply");
  }
}

module.exports = {
  connectChannelToUser,
  getMyPosts,
  getPostPreview,
  getManagedAccounts,
  selectManagedAccount,
  clearSelectedAccount,
  sendMtprotoCode,
  mtprotoSignIn,
  mtprotoSignInPassword,
  mtprotoJoinChannel,
  mtprotoReact,
  mtprotoReply
};
