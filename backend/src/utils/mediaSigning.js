const crypto = require("crypto");
const env = require("../config/env");

/** Signed, expiring URLs for Telegram photos served by our own media proxy.
 *  <img> tags cannot send an Authorization header, so we authorise with an HMAC instead.
 *  Expiry is rounded to the hour so the same URL is reused (and browser-cached) for a while. */
const HOUR_MS = 60 * 60 * 1000;
const VALID_KINDS = new Set(["chat", "user"]);

function signature(kind, id, exp) {
  return crypto
    .createHmac("sha256", `media:${env.jwt.secret}`)
    .update(`${kind}:${id}:${exp}`)
    .digest("base64url")
    .slice(0, 32);
}

function signedTelegramPhotoPath(kind, id) {
  if (!VALID_KINDS.has(kind) || id == null || id === "") return null;
  const exp = Math.ceil(Date.now() / HOUR_MS) * HOUR_MS + 6 * HOUR_MS;
  const sid = encodeURIComponent(String(id));
  return `/api/media/tg/${kind}/${sid}?exp=${exp}&sig=${signature(kind, String(id), exp)}`;
}

function verifyTelegramPhotoSignature(kind, id, exp, sig) {
  if (!VALID_KINDS.has(kind)) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;
  const expected = Buffer.from(signature(kind, String(id), expNum));
  const given = Buffer.from(String(sig || ""));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

module.exports = { signedTelegramPhotoPath, verifyTelegramPhotoSignature };
