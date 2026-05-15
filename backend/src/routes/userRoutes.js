const express = require("express");
const { body } = require("express-validator");
const {
  getProfile,
  getDashboard,
  linkTelegram,
  linkTelegramDeeplinkStart,
  linkTelegramDeeplinkPoll
} = require("../controllers/userController");
const validateRequest = require("../middleware/validateRequest");
const { authLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

router.get("/me", getProfile);
router.get("/dashboard", getDashboard);

router.post(
  "/me/telegram/link",
  authLimiter,
  [
    body("hash").isString().isLength({ min: 1 }),
    body("id")
      .custom((v) => v != null && v !== "" && (typeof v === "number" || (typeof v === "string" && v.length < 20)))
      .withMessage("id is required from Telegram")
  ],
  validateRequest,
  linkTelegram
);

router.post("/me/telegram/link-deeplink/start", authLimiter, linkTelegramDeeplinkStart);
router.get("/me/telegram/link-deeplink/poll", linkTelegramDeeplinkPoll);

module.exports = router;
