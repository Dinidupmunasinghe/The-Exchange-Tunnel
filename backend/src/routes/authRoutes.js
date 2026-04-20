const express = require("express");
const { body } = require("express-validator");
const {
  register,
  login,
  telegramAuth,
  telegramDeeplinkStart,
  telegramDeeplinkPoll
} = require("../controllers/authController");
const { handleTelegramWebhook } = require("../controllers/telegramWebhookController");
const validateRequest = require("../middleware/validateRequest");
const { authLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

router.post(
  "/register",
  authLimiter,
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
    body("name").optional().isString().isLength({ min: 2, max: 120 })
  ],
  validateRequest,
  register
);

router.post(
  "/login",
  authLimiter,
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
  ],
  validateRequest,
  login
);

router.post(
  "/telegram",
  authLimiter,
  [
    body("hash").isString().isLength({ min: 1 }),
    body("id")
      .custom((v) => v != null && v !== "" && (typeof v === "number" || (typeof v === "string" && v.length < 20)))
      .withMessage("id is required from Telegram")
  ],
  validateRequest,
  telegramAuth
);

/** Deep-link login: start (returns token + t.me URL) */
router.post("/telegram-deeplink/start", authLimiter, telegramDeeplinkStart);

/** Deep-link login: poll (frontend calls every 2 s until status=ok or expired) */
router.get("/telegram-deeplink/poll", telegramDeeplinkPoll);

/** Telegram Bot webhook — receives /start login_<token> messages from the bot */
router.post("/telegram-webhook", handleTelegramWebhook);

module.exports = router;
