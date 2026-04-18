const {
  isConfigured,
  isLikelyTelegramMessageUrl,
  getChat,
  isUserChannelAdminOrCreator,
  fetchTmePagePreview
} = require("../services/telegramService");

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

module.exports = {
  connectChannelToUser,
  getMyPosts,
  getPostPreview,
  getManagedAccounts,
  selectManagedAccount,
  clearSelectedAccount
};
