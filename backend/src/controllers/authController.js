const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../models");
const env = require("../config/env");
const tg = require("../services/telegramService");
const deeplinkStore = require("../services/telegramDeeplinkStore");

function createToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn
  });
}

/** Shared: find or create a user record from a confirmed Telegram identity. */
async function findOrCreateTelegramUser({ id, first_name, last_name, username }) {
  const tgId = String(id);
  const display = [first_name, last_name].filter(Boolean).join(" ");
  const nameBase = display || (username ? `@${username}` : `Telegram ${tgId}`);
  const email = `tg_${tgId}@users.telegram.exchange`;

  let user = await db.User.findOne({ where: { telegramUserId: tgId } });
  if (!user) user = await db.User.findOne({ where: { email } });
  if (!user) {
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    user = await db.User.create({
      email,
      passwordHash,
      name: nameBase,
      telegramUserId: tgId,
      credits: 500
    });
  } else {
    user.telegramUserId = tgId;
    if (nameBase && !user.name) user.name = nameBase;
    await user.save();
  }
  return user;
}

async function register(req, res) {
  const { email, password, name } = req.body;
  const existing = await db.User.findOne({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.User.create({
    email,
    passwordHash,
    name: name || null,
    credits: 500
  });
  const token = createToken(user);
  return res.status(201).json({
    message: "Registered successfully",
    token,
    user: { id: user.id, email: user.email, name: user.name, credits: user.credits }
  });
}

async function login(req, res) {
  const { email, password } = req.body;
  const user = await db.User.findOne({ where: { email } });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const token = createToken(user);
  return res.json({
    message: "Login successful",
    token,
    user: { id: user.id, email: user.email, name: user.name, credits: user.credits }
  });
}

/**
 * Telegram Login Widget: https://core.telegram.org/widgets/login
 * Body: id, first_name, last_name, username, photo_url, auth_date, hash, ...
 */
async function telegramAuth(req, res) {
  const d = req.body;
  if (!d || d.hash == null) {
    return res.status(400).json({ message: "Telegram auth payload (with hash) is required" });
  }
  if (!tg.verifyWidgetLogin(d)) {
    return res.status(401).json({ message: "Invalid Telegram login signature" });
  }

  const id = d.id != null ? String(d.id) : null;
  if (!id) {
    return res.status(400).json({ message: "Invalid Telegram id" });
  }

  const user = await findOrCreateTelegramUser({
    id: d.id,
    first_name: d.first_name,
    last_name: d.last_name,
    username: d.username
  });

  const token = createToken(user);
  return res.json({
    message: "Telegram login successful",
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      credits: user.credits,
      telegramUserId: user.telegramUserId
    }
  });
}

/**
 * Step 1 of deep-link login.
 * Returns a one-time token and a t.me deep-link for the user to open in Telegram.
 */
async function telegramDeeplinkStart(req, res) {
  const botName = env.telegram.botName;
  if (!botName) {
    return res.status(503).json({ message: "TELEGRAM_BOT_NAME is not configured on the server" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  deeplinkStore.create(token);
  return res.json({
    token,
    url: `https://t.me/${botName}?start=login_${token}`,
    expiresInMs: deeplinkStore.TTL_MS
  });
}

/**
 * Step 2 of deep-link login — polled by the frontend every ~2 s.
 * Returns { status: "pending" } until the user taps the bot link, then completes login.
 */
async function telegramDeeplinkPoll(req, res) {
  const { token } = req.query;
  if (!token || typeof token !== "string" || !/^[a-f0-9]+$/i.test(token)) {
    return res.status(400).json({ message: "Invalid token" });
  }

  const row = deeplinkStore.peek(token);
  if (!row) {
    return res.status(410).json({ status: "expired", message: "Login link expired, please try again" });
  }

  const from = deeplinkStore.takeResolved(token);
  if (!from) {
    return res.json({ status: "pending" });
  }

  const user = await findOrCreateTelegramUser(from);
  const jwtToken = createToken(user);
  return res.json({
    status: "ok",
    token: jwtToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      credits: user.credits,
      telegramUserId: user.telegramUserId
    }
  });
}

module.exports = { register, login, telegramAuth, telegramDeeplinkStart, telegramDeeplinkPoll };
