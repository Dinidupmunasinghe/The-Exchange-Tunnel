const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../models");
const env = require("../config/env");
const {
  fetchOAuthProfileByAccessToken,
  exchangeSoundCloudOAuthCodeForAccessToken
} = require("../services/soundcloudService");
const scNative = require("../services/soundcloudNativeService");

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
 * Login or register: SoundCloud OAuth 2.1 (PKCE + code) when configured, else legacy Meta Graph token/code.
 */
async function soundcloudLogin(req, res) {
  let accessToken = req.body.accessToken;
  const { code, redirectUri, codeVerifier } = req.body;

  if (!accessToken && code && redirectUri) {
    if (scNative.isConfigured() && codeVerifier) {
      try {
        const tok = await scNative.exchangeAuthorizationCode({
          code,
          redirectUri,
          codeVerifier
        });
        accessToken = tok.access_token;
      } catch (err) {
        return res.status(401).json({ message: err.message || "SoundCloud code exchange failed" });
      }
    } else {
      try {
        accessToken = await exchangeSoundCloudOAuthCodeForAccessToken(code, redirectUri, "login");
      } catch (err) {
        return res.status(401).json({ message: err.message || "OAuth code exchange failed" });
      }
    }
  }

  if (!accessToken || typeof accessToken !== "string" || accessToken.length < 10) {
    return res.status(400).json({
      message:
        "Send accessToken, or code plus redirectUri. For SoundCloud OAuth 2.1, also send codeVerifier from the PKCE flow."
    });
  }

  let profile = null;
  try {
    profile = await scNative.fetchAuthenticatedUser(accessToken);
  } catch {
    profile = null;
  }
  if (!profile) {
    try {
      profile = await fetchOAuthProfileByAccessToken(accessToken, "login");
    } catch (err) {
      return res.status(401).json({ message: err.message || "Invalid access token" });
    }
  }

  if (!profile || profile.id == null) {
    return res.status(401).json({ message: "Could not read OAuth profile" });
  }

  const oauthId = String(profile.id);
  const displayName =
    profile.username || profile.name || profile.permalink || (profile.first_name ? String(profile.first_name) : null);
  const email =
    profile.email && String(profile.email).includes("@")
      ? String(profile.email).toLowerCase()
      : `sc_${oauthId}@users.soundcloud.exchange`;

  let user = await db.User.findOne({ where: { soundcloudUserId: oauthId } });
  if (!user) {
    user = await db.User.findOne({ where: { email } });
  }

  if (!user) {
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    user = await db.User.create({
      email,
      passwordHash,
      name: displayName || null,
      soundcloudUserId: oauthId,
      credits: 500
    });
  } else {
    user.soundcloudUserId = oauthId;
    if (displayName && !user.name) {
      user.name = displayName;
    }
  }

  user.setSoundCloudToken(accessToken);
  await user.save();

  const token = createToken(user);
  return res.json({
    message: "SoundCloud login successful",
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      credits: user.credits,
      soundcloudUserId: user.soundcloudUserId
    }
  });
}

/** @deprecated Use soundcloudLogin */
async function facebookLogin(req, res) {
  return soundcloudLogin(req, res);
}

module.exports = { register, login, soundcloudLogin, facebookLogin };
