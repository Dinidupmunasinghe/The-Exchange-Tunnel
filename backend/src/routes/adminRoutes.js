const express = require("express");
const { body, param, query } = require("express-validator");
const adminAuth = require("../middleware/adminAuth");
const validateRequest = require("../middleware/validateRequest");
const ctrl = require("../controllers/adminController");

const router = express.Router();

router.use(adminAuth);

/* Overview */
router.get("/overview", ctrl.getOverview);

/* Users */
router.get(
  "/users",
  [
    query("query").optional().isString().isLength({ max: 120 }),
    query("status").optional().isIn(["active", "blocked", ""]),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 })
  ],
  validateRequest,
  ctrl.listUsers
);
router.get(
  "/users/:id",
  [param("id").isInt({ min: 1 })],
  validateRequest,
  ctrl.getUserDetails
);
router.patch(
  "/users/:id",
  [
    param("id").isInt({ min: 1 }),
    body("name").optional().isString().isLength({ max: 120 }),
    body("email").optional().isString().isEmail().isLength({ max: 160 }),
    body("isActive").optional().isBoolean()
  ],
  validateRequest,
  ctrl.updateUser
);
router.post(
  "/users/:id/block",
  [param("id").isInt({ min: 1 })],
  validateRequest,
  ctrl.blockUser
);
router.post(
  "/users/:id/unblock",
  [param("id").isInt({ min: 1 })],
  validateRequest,
  ctrl.unblockUser
);
router.post(
  "/users/:id/clear-mtproto-session",
  [param("id").isInt({ min: 1 })],
  validateRequest,
  ctrl.clearMtprotoSession
);

/* Credits adjustments */
router.post(
  "/credits/adjust",
  [
    body("userId").isInt({ min: 1 }),
    body("amount").isInt(),
    body("reason").isString().trim().isLength({ min: 1, max: 255 })
  ],
  validateRequest,
  ctrl.adjustCredits
);

/* Transactions */
router.get(
  "/transactions",
  [
    query("userId").optional().isInt({ min: 1 }),
    query("type").optional().isIn(["earn", "spend", ""]),
    query("from").optional().isISO8601(),
    query("to").optional().isISO8601(),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 200 })
  ],
  validateRequest,
  ctrl.listTransactions
);

/* Pending refunds */
router.get(
  "/pending-refunds",
  [
    query("status").optional().isIn(["pending", "settled", ""]),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 200 })
  ],
  validateRequest,
  ctrl.listPendingRefunds
);
router.post(
  "/pending-refunds/:id/cancel",
  [param("id").isInt({ min: 1 })],
  validateRequest,
  ctrl.cancelPendingRefund
);

/* Settings */
router.get("/settings", ctrl.getPlatformSettings);
router.put(
  "/settings",
  [
    body("dailyEarnLimit").isInt({ min: 0 }),
    body("likeReward").isInt({ min: 0 }),
    body("commentReward").isInt({ min: 0 }),
    body("subscribeReward").isInt({ min: 0 }),
    body("shareReward").isInt({ min: 0 })
  ],
  validateRequest,
  ctrl.updatePlatformSettings
);

/* Repost pricing tiers */
router.get("/repost-pricing-rules", ctrl.listRepostPricingRules);
router.post(
  "/repost-pricing-rules",
  [
    body("minSubscribers").isInt({ min: 0 }),
    body("maxSubscribers").optional({ nullable: true }).isInt({ min: 0 }),
    body("credits").isInt({ min: 1 }),
    body("isActive").optional().isBoolean()
  ],
  validateRequest,
  ctrl.createRepostPricingRule
);
router.patch(
  "/repost-pricing-rules/:id",
  [
    param("id").isInt({ min: 1 }),
    body("minSubscribers").optional().isInt({ min: 0 }),
    body("maxSubscribers").optional({ nullable: true }).isInt({ min: 0 }),
    body("credits").optional().isInt({ min: 1 }),
    body("isActive").optional().isBoolean()
  ],
  validateRequest,
  ctrl.updateRepostPricingRule
);
router.delete(
  "/repost-pricing-rules/:id",
  [param("id").isInt({ min: 1 })],
  validateRequest,
  ctrl.deleteRepostPricingRule
);

/* Packages */
router.get("/packages", ctrl.listCreditPackages);
router.post(
  "/packages",
  [
    body("name").isString().trim().isLength({ min: 1, max: 120 }),
    body("credits").isInt({ min: 1 }),
    body("priceLkr").isFloat({ min: 0 }),
    body("isActive").optional().isBoolean()
  ],
  validateRequest,
  ctrl.createCreditPackage
);
router.patch(
  "/packages/:id",
  [
    param("id").isInt({ min: 1 }),
    body("name").optional().isString().trim().isLength({ min: 1, max: 120 }),
    body("credits").optional().isInt({ min: 1 }),
    body("priceLkr").optional().isFloat({ min: 0 }),
    body("isActive").optional().isBoolean()
  ],
  validateRequest,
  ctrl.updateCreditPackage
);
router.delete(
  "/packages/:id",
  [param("id").isInt({ min: 1 })],
  validateRequest,
  ctrl.deleteCreditPackage
);

/* Campaigns */
router.get(
  "/campaigns",
  [
    query("query").optional().isString().isLength({ max: 160 }),
    query("status").optional().isIn(["pending", "active", "paused", "completed", ""]),
    query("ownerId").optional().isInt({ min: 1 }),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 })
  ],
  validateRequest,
  ctrl.listCampaigns
);
router.get(
  "/campaigns/:id",
  [param("id").isInt({ min: 1 })],
  validateRequest,
  ctrl.getCampaignDetails
);
router.patch(
  "/campaigns/:id",
  [
    param("id").isInt({ min: 1 }),
    body("action").isIn(["pause", "resume", "cancel"])
  ],
  validateRequest,
  ctrl.updateCampaign
);
router.delete(
  "/campaigns/:id",
  [param("id").isInt({ min: 1 })],
  validateRequest,
  ctrl.deleteCampaign
);

/* Tasks */
router.get(
  "/tasks",
  [
    query("status").optional().isIn(["open", "assigned", "completed", "cancelled", ""]),
    query("campaignId").optional().isInt({ min: 1 }),
    query("assignedUserId").optional().isInt({ min: 1 }),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 200 })
  ],
  validateRequest,
  ctrl.listTasks
);
router.post(
  "/tasks/:id/cancel",
  [param("id").isInt({ min: 1 })],
  validateRequest,
  ctrl.cancelTask
);

/* Engagements */
router.get(
  "/engagements",
  [
    query("campaignId").optional().isInt({ min: 1 }),
    query("userId").optional().isInt({ min: 1 }),
    query("actionKind").optional().isIn(["like", "comment", "share", "subscribe", ""]),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 200 })
  ],
  validateRequest,
  ctrl.listEngagements
);
router.post(
  "/engagements/:id/reverse",
  [param("id").isInt({ min: 1 })],
  validateRequest,
  ctrl.reverseEngagement
);

/* Telegram health and audits */
router.get("/telegram/health", ctrl.getTelegramHealth);
router.post(
  "/telegram/audits/run",
  [
    body("kind")
      .optional()
      .isIn(["all", "subscribe", "subscribeMemory", "like", "comment", "commentMembership"])
  ],
  validateRequest,
  ctrl.runTelegramAudits
);

/* Audit logs */
router.get(
  "/audit-logs",
  [
    query("adminEmail").optional().isString().isLength({ max: 160 }),
    query("action").optional().isString().isLength({ max: 120 }),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 200 })
  ],
  validateRequest,
  ctrl.listAuditLogs
);

module.exports = router;
