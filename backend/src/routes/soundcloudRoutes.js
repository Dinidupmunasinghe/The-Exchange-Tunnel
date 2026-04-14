const express = require("express");
const { body, query } = require("express-validator");
const {
  connectSoundCloud,
  getMyPosts,
  getPostPreview,
  getManagedAccounts,
  selectManagedAccount,
  clearSelectedAccount
} = require("../controllers/soundcloudController");
const validateRequest = require("../middleware/validateRequest");
const { isAllowedOpenGraphPreviewHost } = require("../services/soundcloudService");

const router = express.Router();

router.get(
  "/post-preview",
  [
    query("url")
      .isString()
      .isLength({ min: 12, max: 2048 })
      .custom((value) => {
        let u;
        try {
          u = new URL(value);
        } catch {
          throw new Error("Invalid URL");
        }
        if (!/^https?:$/i.test(u.protocol)) {
          throw new Error("Only http(s) URLs");
        }
        if (!isAllowedOpenGraphPreviewHost(u.hostname)) {
          throw new Error("Only SoundCloud or legacy Facebook post URLs are allowed");
        }
        return true;
      })
  ],
  validateRequest,
  getPostPreview
);

router.post(
  "/connect",
  [
    body("accessToken").optional().isString().isLength({ min: 10 }),
    body("code").optional().isString().isLength({ min: 4 }),
    body("redirectUri").optional().isString().isLength({ min: 8 }),
    body("codeVerifier").optional().isString().isLength({ min: 43, max: 128 })
  ],
  validateRequest,
  connectSoundCloud
);
router.get("/pages", getManagedAccounts);
router.post(
  "/pages/select",
  [body("pageId").isString().isLength({ min: 1 }).withMessage("Managed account ID is required")],
  validateRequest,
  selectManagedAccount
);
router.delete("/pages/select", clearSelectedAccount);
router.get("/posts", getMyPosts);

module.exports = router;
