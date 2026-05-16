const crypto = require("crypto");
const db = require("../models");
const env = require("../config/env");
const { getDashboardStats } = require("../services/creditService");
const tg = require("../services/telegramService");
const deeplinkStore = require("../services/telegramDeeplinkStore");
const { attachTelegramIdentityToUser } = require("../services/telegramLinkService");

async function getProfile(req, res) {
  const user = await db.User.findByPk(req.user.id, {
    attributes: [
      "id",
      "email",
      "name",
      "credits",
      "dailyEarnedCredits",
      "dailyEarnedAt",
      "telegramUserId",
      "telegramActingChannelId",
      "telegramActingChannelTitle",
      "userActingTokenEncrypted",
      "profilePhotoUrl",
      "createdAt"
    ]
  });
  if (!user) return res.status(404).json({ message: "User not found" });
  // One-time lazy backfill: resolve @username from connected channel membership.
  const currentName = String(user.name || "").trim();
  const needsUsernameBackfill = Boolean(
    user.telegramUserId &&
      user.telegramActingChannelId &&
      (!currentName || !currentName.startsWith("@"))
  );
  if (needsUsernameBackfill) {
    const member = await tg.getChatMemberUser(user.telegramActingChannelId, user.telegramUserId);
    const username = member?.username ? `@${String(member.username).replace(/^@/, "")}` : null;
    if (username) {
      user.name = username;
      await user.save();
    }
  }
  const data = user.toJSON();
  const hasMtprotoSession = Boolean(data.userActingTokenEncrypted);
  delete data.userActingTokenEncrypted;
  const pendingRefundDebt = await db.PendingRefund.sum("amountRemaining", {
    where: { workerUserId: req.user.id, status: "pending" }
  });
  return res.json({ user: { ...data, hasMtprotoSession, pendingRefundDebt: Number(pendingRefundDebt || 0) } });
}

async function getDashboard(req, res) {
  const stats = await getDashboardStats(req.user.id);
  return res.json({ stats });
}

function profileUserPayload(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    credits: user.credits,
    telegramUserId: user.telegramUserId,
    profilePhotoUrl: user.profilePhotoUrl || null
  };
}

function isAllowedProfilePhotoUrl(value) {
  if (value == null || value === "") return true;
  const s = String(value).trim();
  if (s.length > 600_000) return false;
  if (s.startsWith("https://") || s.startsWith("http://")) return true;
  if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(s)) return true;
  return false;
}

async function updateProfilePhoto(req, res) {
  const raw = req.body?.profilePhotoUrl;
  if (raw !== null && raw !== undefined && typeof raw !== "string") {
    return res.status(400).json({ message: "profilePhotoUrl must be a string or null" });
  }
  const profilePhotoUrl = raw === null || raw === undefined ? null : String(raw).trim() || null;
  if (!isAllowedProfilePhotoUrl(profilePhotoUrl)) {
    return res.status(400).json({
      message: "Use an https image URL or upload a JPEG/PNG/WebP image under 500 KB"
    });
  }

  const user = await db.User.findByPk(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  user.profilePhotoUrl = profilePhotoUrl;
  await user.save();
  return res.json({ message: "Profile photo updated", user: profileUserPayload(user) });
}

/** Link Telegram Login Widget to the signed-in Exchange Tunnel account. */
async function linkTelegram(req, res) {
  const d = req.body;
  if (!d || d.hash == null) {
    return res.status(400).json({ message: "Telegram auth payload (with hash) is required" });
  }
  if (!tg.verifyWidgetLogin(d)) {
    return res.status(401).json({ message: "Invalid Telegram login signature" });
  }
  if (req.user.telegramUserId) {
    return res.status(400).json({ message: "Telegram is already connected to this account" });
  }

  try {
    const user = await attachTelegramIdentityToUser(req.user, {
      id: d.id,
      first_name: d.first_name,
      last_name: d.last_name,
      username: d.username,
      photo_url: d.photo_url
    });
    return res.json({ message: "Telegram connected", user: profileUserPayload(user) });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Could not link Telegram" });
  }
}

/** Start bot deeplink to link Telegram while signed in. */
async function linkTelegramDeeplinkStart(req, res) {
  if (req.user.telegramUserId) {
    return res.json({
      alreadyLinked: true,
      user: profileUserPayload(req.user),
      expiresInMs: 0
    });
  }
  const botName = env.telegram.botName;
  if (!botName) {
    return res.status(503).json({ message: "TELEGRAM_BOT_NAME is not configured on the server" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  deeplinkStore.create(token, { linkUserId: req.user.id });
  return res.json({
    token,
    url: `https://t.me/${botName}?start=login_${token}`,
    expiresInMs: deeplinkStore.TTL_MS
  });
}

/** Poll deeplink link session (must be signed in as the same user who started it). */
async function linkTelegramDeeplinkPoll(req, res) {
  const { token } = req.query;
  if (!token || typeof token !== "string" || !/^[a-f0-9]+$/i.test(token)) {
    return res.status(400).json({ message: "Invalid token" });
  }

  const row = deeplinkStore.peek(token);
  if (!row) {
    return res.status(410).json({ status: "expired", message: "Link expired, please try again" });
  }
  if (row.linkUserId == null) {
    return res.status(400).json({ message: "This is a sign-in link. Use the login page for Telegram sign-in." });
  }
  if (row.linkUserId !== req.user.id) {
    return res.status(403).json({ message: "This link belongs to another signed-in account" });
  }

  const from = deeplinkStore.takeResolved(token);
  if (!from) {
    return res.json({ status: "pending" });
  }

  try {
    const user = await attachTelegramIdentityToUser(req.user, from);
    return res.json({ status: "ok", user: profileUserPayload(user) });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Could not link Telegram" });
  }
}

/** Remove Telegram link from this Exchange Tunnel account (keeps email login). */
async function unlinkTelegram(req, res) {
  const user = await db.User.findByPk(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (!user.telegramUserId) {
    return res.status(400).json({ message: "No Telegram account is linked" });
  }

  user.telegramUserId = null;
  if (typeof user.clearActingTelegramChannel === "function") {
    user.clearActingTelegramChannel();
  }
  user.userActingTokenEncrypted = null;
  await user.save();

  return res.json({
    message: "Telegram unlinked from your account",
    user: profileUserPayload(user)
  });
}

module.exports = {
  getProfile,
  getDashboard,
  updateProfilePhoto,
  linkTelegram,
  linkTelegramDeeplinkStart,
  linkTelegramDeeplinkPoll,
  unlinkTelegram
};
