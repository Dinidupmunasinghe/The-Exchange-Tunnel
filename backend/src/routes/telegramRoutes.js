const express = require("express");
const { body, query } = require("express-validator");
const {
  connectChannelToUser,
  getMyPosts,
  getPostPreview,
  getManagedAccounts,
  selectManagedAccount,
  clearSelectedAccount
} = require("../controllers/telegramController");
const { isLikelyTelegramMessageUrl } = require("../services/telegramService");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

router.get(
  "/post-preview",
  [
    query("url")
      .isString()
      .isLength({ min: 12, max: 2048 })
      .custom((value) => {
        if (!isLikelyTelegramMessageUrl(value)) {
          throw new Error("Use a t.me/… post link only");
        }
        return true;
      })
  ],
  validateRequest,
  getPostPreview
);

router.post(
  "/connect",
  [body("channel").isString().isLength({ min: 1, max: 512 })],
  validateRequest,
  connectChannelToUser
);
router.get("/pages", getManagedAccounts);
router.post(
  "/pages/select",
  [body("pageId").isString().isLength({ min: 1 }).withMessage("Channel id is required")],
  validateRequest,
  selectManagedAccount
);
router.delete("/pages/select", clearSelectedAccount);
router.get("/posts", getMyPosts);

module.exports = router;
