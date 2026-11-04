const crypto = require("crypto");
const env = require("../config/env");
const deeplinkStore = require("../services/telegramDeeplinkStore");
const commentDetectionStore = require("../services/commentDetectionStore");
const tg = require("../services/telegramService");
const engagementAudit = require("../services/engagementAuditService");

/**
 * Telegram Bot API push updates — used to complete "open t.me/bot?start=login_*" login.
 * @see https://core.telegram.org/bots/api#setwebhook
 */
async function handleTelegramWebhook(req, res) {
  const secret = env.telegram.webhookSecret;
  // A forged update can complete someone else's deep-link login, so the secret is mandatory.
  // Local testing without it requires an explicit opt-in (never honoured in production).
  const allowInsecure = !env.isProduction && process.env.TELEGRAM_WEBHOOK_ALLOW_INSECURE === "true";
  if (!secret && !allowInsecure) {
    return res
      .status(503)
      .json({ ok: false, message: "Set TELEGRAM_WEBHOOK_SECRET and configure setWebhook" });
  }
  if (secret) {
    const given = Buffer.from(String(req.get("X-Telegram-Bot-Api-Secret-Token") || ""));
    const expected = Buffer.from(String(secret));
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return res.status(403).json({ ok: false });
    }
  }

  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(200).json({ ok: true });
  }

  // Real-time undo detection: someone left a channel, or reactions on a post went down.
  if (body.chat_member && typeof body.chat_member === "object") {
    const cm = body.chat_member;
    const next = cm.new_chat_member || {};
    const left =
      next.status === "left" || next.status === "kicked" || (next.status === "restricted" && next.is_member === false);
    if (left && cm.chat?.id != null && next.user?.id != null && !next.user.is_bot) {
      await engagementAudit.onMemberLeft(String(cm.chat.id), String(next.user.id)).catch(() => undefined);
    }
    return res.status(200).json({ ok: true });
  }
  if (body.message_reaction_count && typeof body.message_reaction_count === "object") {
    const rc = body.message_reaction_count;
    if (rc.chat?.id != null && rc.message_id != null) {
      await engagementAudit
        .onReactionCount(String(rc.chat.id), Number(rc.message_id), rc.reactions)
        .catch(() => undefined);
    }
    return res.status(200).json({ ok: true });
  }

  if (body.callback_query && typeof body.callback_query === "object") {
    await handleLoginCallback(body.callback_query).catch(() => undefined);
    return res.status(200).json({ ok: true });
  }

  const msg = body.message;
  if (!msg || typeof msg !== "object") {
    return res.status(200).json({ ok: true });
  }

  // Comment auto-detection path (discussion group messages)
  if (msg.chat && msg.from && !msg.from.is_bot && msg.chat.id != null && msg.from.id != null) {
    try {
      commentDetectionStore.resolveByTelegramMessage(String(msg.chat.id), String(msg.from.id));
    } catch {
      // keep webhook resilient
    }
  }

  if (typeof msg.text !== "string") {
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

  const pendingInfo = deeplinkStore.awaitConfirmation(token, {
    id: from.id,
    first_name: from.first_name,
    last_name: from.last_name,
    username: from.username,
    photo_url: undefined
  });

  const chatId = msg.chat?.id ?? from.id;
  if (!pendingInfo) {
    // Unknown/expired token — still 200 so Telegram does not retry forever.
    await tg
      .sendBotMessage(chatId, "This sign-in link has expired. Start again from the Exchange Tunnel website.")
      .catch(() => undefined);
    return res.status(200).json({ ok: true });
  }

  const action = pendingInfo.linkMode
    ? "link this Telegram account to an Exchange Tunnel account"
    : "sign in to Exchange Tunnel with this Telegram account";
  await tg
    .sendBotMessage(
      chatId,
      `Someone asked to ${action}.\n\n` +
        `Confirmation code: ${pendingInfo.code}\n\n` +
        "Only tap Confirm if YOU started this on your own device and the website shows the same code. " +
        "Never confirm a link someone else sent you.",
      {
        inline_keyboard: [
          [
            { text: "✅ Confirm", callback_data: `cl_${token}` },
            { text: "✖ Cancel", callback_data: `xl_${token}` }
          ]
        ]
      }
    )
    .catch(() => undefined);

  return res.status(200).json({ ok: true });
}

/** Handles the Confirm / Cancel inline buttons of the deep-link login prompt. */
async function handleLoginCallback(cq) {
  const data = String(cq.data || "");
  const m = /^(cl|xl)_([a-f0-9]+)$/i.exec(data);
  if (!m || !cq.from || cq.from.is_bot) {
    if (cq.id) await tg.answerCallbackQuery(cq.id).catch(() => undefined);
    return;
  }
  const [, kind, token] = m;
  const ok = kind === "cl" ? deeplinkStore.confirm(token, cq.from.id) : deeplinkStore.cancel(token, cq.from.id);
  const text = !ok
    ? "This request has expired or was already handled."
    : kind === "cl"
      ? "Confirmed. Return to the website — you will be signed in automatically."
      : "Cancelled. Nobody was signed in.";
  await tg.answerCallbackQuery(cq.id, text).catch(() => undefined);
  if (cq.message?.chat?.id != null && cq.message?.message_id != null) {
    await tg.editBotMessageText(cq.message.chat.id, cq.message.message_id, text).catch(() => undefined);
  }
}

module.exports = { handleTelegramWebhook };
