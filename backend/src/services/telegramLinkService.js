const db = require("../models");

function isPlaceholderTelegramEmail(email) {
  if (!email) return false;
  return (
    email.endsWith("@users.telegram.exchange") || email.endsWith("@users.facebook.exchange")
  );
}

/** A Telegram-only account that never created campaigns, engaged, or spent/earned credits. */
async function isUnusedGhostAccount(user) {
  const [campaigns, engagements, txns] = await Promise.all([
    db.Campaign.count({ where: { userId: user.id } }),
    db.Engagement.count({ where: { userId: user.id } }),
    db.Transaction.count({ where: { userId: user.id, type: ["earn", "spend"] } })
  ]);
  return campaigns === 0 && engagements === 0 && txns === 0;
}

/**
 * Attach a verified Telegram identity to an existing Exchange Tunnel user.
 * @param {import("../models").User} user
 * @param {{ id: string|number, first_name?: string, last_name?: string, username?: string, photo_url?: string }} from
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
    // Telegram-only ghost from "Sign in with Telegram": the real email account may claim it,
    // but only while the ghost is unused. Otherwise its credits/campaigns would be orphaned.
    if (isPlaceholderTelegramEmail(conflict.email) && (await isUnusedGhostAccount(conflict))) {
      conflict.telegramUserId = null;
      if (typeof conflict.clearActingTelegramChannel === "function") {
        conflict.clearActingTelegramChannel();
      }
      await conflict.save();
    } else {
      const err = new Error(
        isPlaceholderTelegramEmail(conflict.email)
          ? "This Telegram account already has its own Exchange Tunnel account with activity. Sign in with Telegram to use it, or contact support to merge accounts."
          : "This Telegram account is already linked to another Exchange Tunnel account. Sign in with that email, or contact support."
      );
      err.status = 409;
      throw err;
    }
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
  const photoUrl = from.photo_url ? String(from.photo_url).trim() : "";
  if (photoUrl && photoUrl.startsWith("http")) {
    user.profilePhotoUrl = photoUrl;
  }
  await user.save();
  return user;
}

module.exports = { attachTelegramIdentityToUser, isPlaceholderTelegramEmail };
