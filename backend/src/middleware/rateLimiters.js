const rateLimit = require("express-rate-limit");

/** Per signed-in user when available (routes behind authMiddleware), else per IP. */
function userOrIpKey(req) {
  if (req.user?.id) return `u:${req.user.id}`;
  return rateLimit.ipKeyGenerator(req.ip || "");
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});

/** Admin login: strict, only failed attempts count. */
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many admin login attempts. Try again in 15 minutes." }
});

const taskSubmitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey
});

/** Telegram send-code triggers an SMS/app code to a phone number: keep it tight. */
const telegramCodeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Too many verification code requests. Try again later." }
});

/** Sign-in steps and direct MTProto actions share a single Python bridge slot. */
const telegramBridgeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Too many Telegram requests. Slow down and try again in a minute." }
});

module.exports = {
  authLimiter,
  adminLoginLimiter,
  taskSubmitLimiter,
  telegramCodeLimiter,
  telegramBridgeLimiter
};
