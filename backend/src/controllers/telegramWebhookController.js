const env = require("../config/env");
const deeplinkStore = require("../services/telegramDeeplinkStore");

/**
 * Telegram Bot API push updates — used to complete "open t.me/bot?start=login_*" login.
 * @see https://core.telegram.org/bots/api#setwebhook
 */
async function handleTelegramWebhook(req, res) {
  const secret = env.telegram.webhookSecret;
  if (env.nodeEnv === "production" && !secret) {
    return res.status(503).json({ ok: false, message: "Set TELEGRAM_WEBHOOK_SECRET and configure setWebhook" });
  }
  if (secret) {
    if (req.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
      return res.status(403).json({ ok: false });
    }
  } else if (env.nodeEnv !== "production") {
    // eslint-disable-next-line no-console
    console.warn("telegram webhook: TELEGRAM_WEBHOOK_SECRET unset (dev only — insecure)");
  }

  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(200).json({ ok: true });
  }

  const msg = body.message;
  if (!msg || typeof msg.text !== "string") {
    return res.status(200).json({ ok: true });
  }

  const trimmed = msg.text.trim();
  const m = /^\/start\s+(.+)$/.exec(trimmed);
  if (!m) {
    return res.status(200).json({ ok: true });
  }

  const payload = m[1].trim();
  if (!payload.startsWith("login_")) {
    return res.status(200).json({ ok: true });
  }

  const token = payload.slice("login_".length);
  if (!token || !/^[a-f0-9]+$/i.test(token)) {
    return res.status(200).json({ ok: true });
  }

  const from = msg.from;
  if (!from || from.is_bot) {
    return res.status(200).json({ ok: true });
  }

  const ok = deeplinkStore.resolve(token, {
    id: from.id,
    first_name: from.first_name,
    last_name: from.last_name,
    username: from.username,
    photo_url: undefined
  });

  if (!ok) {
    // Unknown/expired token — still 200 so Telegram does not retry forever
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}

module.exports = { handleTelegramWebhook };
