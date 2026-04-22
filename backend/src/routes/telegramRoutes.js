const express = require("express");
const { body, query } = require("express-validator");
const {
  connectChannelToUser,
  getMyPosts,
  getPostPreview,
  getManagedAccounts,
  selectManagedAccount,
  clearSelectedAccount,
  sendMtprotoCode,
  mtprotoSignIn,
  mtprotoSignInPassword,
  mtprotoJoinChannel,
  mtprotoReact,
  mtprotoReply
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
router.post(
  "/user-auth/send-code",
  [body("apiId").optional().notEmpty(), body("apiHash").optional().isString().isLength({ min: 8 }), body("phone").isString()],
  validateRequest,
  sendMtprotoCode
);
router.post(
  "/user-auth/sign-in",
  [
    body("apiId").optional().notEmpty(),
    body("apiHash").optional().isString().isLength({ min: 8 }),
    body("phone").isString(),
    body("phoneCode").isString(),
    body("phoneCodeHash").optional().isString()
  ],
  validateRequest,
  mtprotoSignIn
);
router.post(
  "/user-auth/sign-in-2fa",
  [body("password").isString().isLength({ min: 1 })],
  validateRequest,
  mtprotoSignInPassword
);
router.post(
  "/actions/join-channel",
  [body("channel").isString().isLength({ min: 1, max: 512 })],
  validateRequest,
  mtprotoJoinChannel
);
router.post(
  "/actions/react",
  [body("chat").notEmpty(), body("msgId").isInt({ min: 1 }), body("reaction").isString().isLength({ min: 1, max: 32 })],
  validateRequest,
  mtprotoReact
);
router.post(
  "/actions/reply",
  [body("chat").notEmpty(), body("msgId").isInt({ min: 1 }), body("text").isString().isLength({ min: 1, max: 4096 })],
  validateRequest,
  mtprotoReply
);

module.exports = router;
