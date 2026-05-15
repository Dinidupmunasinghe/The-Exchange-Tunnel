const db = require("../models");

function isPlaceholderTelegramEmail(email) {
  if (!email) return false;
  return (
    email.endsWith("@users.telegram.exchange") || email.endsWith("@users.facebook.exchange")
  );
}

/**
 * Attach a verified Telegram identity to an existing Exchange Tunnel user.
 * @param {import("../models").User} user
 * @param {{ id: string|number, first_name?: string, last_name?: string, username?: string }} from
 */
async function attachTelegramIdentityToUser(user, from) {
  const tgId = from?.id != null ? String(from.id) : "";
  if (!tgId) {
    const err = new Error("Invalid Telegram id");
    err.status = 400;
    throw err;
  }

  const conflict = await db.User.findOne({ where: { telegramUserId: tgId } });
  if (conflict && conflict.id !== user.id) {
    const err = new Error("This Telegram account is already linked to another Exchange Tunnel account");
    err.status = 409;
    throw err;
  }

  if (user.telegramUserId && user.telegramUserId !== tgId) {
    const err = new Error("Your account already has a different Telegram account linked");
    err.status = 409;
    throw err;
  }

  const usernameHandle = from.username
    ? `@${String(from.username).replace(/^@/, "")}`
    : null;
  const display = [from.first_name, from.last_name].filter(Boolean).join(" ");
  const nameBase = usernameHandle || display || null;

  user.telegramUserId = tgId;
  if (nameBase && (!user.name || isPlaceholderTelegramEmail(user.email))) {
    user.name = nameBase;
  }
  await user.save();
  return user;
}

module.exports = { attachTelegramIdentityToUser, isPlaceholderTelegramEmail };
