const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../models");
const env = require("../config/env");
const tg = require("../services/telegramService");

function createToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn
  });
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
  const display = [d.first_name, d.last_name].filter(Boolean).join(" ");
  const nameBase = display || (d.username ? `@${d.username}` : `Telegram ${id}`);
  const email = `tg_${id}@users.telegram.exchange`;

  let user = await db.User.findOne({ where: { telegramUserId: id } });
  if (!user) {
    user = await db.User.findOne({ where: { email } });
  }
  if (!user) {
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    user = await db.User.create({
      email,
      passwordHash,
      name: nameBase,
      telegramUserId: id,
      credits: 500
    });
  } else {
    user.telegramUserId = id;
    if (nameBase && !user.name) {
      user.name = nameBase;
    }
  }
  await user.save();
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

module.exports = { register, login, telegramAuth };
