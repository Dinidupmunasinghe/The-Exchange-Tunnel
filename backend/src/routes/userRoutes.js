const express = require("express");
const { body } = require("express-validator");
const {
  getProfile,
  getDashboard,
  updateProfilePhoto,
  linkTelegram,
  linkTelegramDeeplinkStart,
  linkTelegramDeeplinkPoll,
  unlinkTelegram
} = require("../controllers/userController");
const validateRequest = require("../middleware/validateRequest");
const { authLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

router.get("/me", getProfile);
router.get("/dashboard", getDashboard);
router.patch("/me/profile-photo", authLimiter, updateProfilePhoto);

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
router.post("/me/telegram/unlink", authLimiter, unlinkTelegram);

module.exports = router;
