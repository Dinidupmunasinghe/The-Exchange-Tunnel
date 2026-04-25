const express = require("express");
const { body, query } = require("express-validator");
const adminAuth = require("../middleware/adminAuth");
const validateRequest = require("../middleware/validateRequest");
const {
  listUsers,
  adjustCredits,
  listTransactions,
  getPlatformSettings,
  updatePlatformSettings,
  listCreditPackages,
  createCreditPackage,
  updateCreditPackage
} = require("../controllers/adminController");

const router = express.Router();

router.use(adminAuth);

router.get(
  "/users",
  [
    query("query").optional().isString().isLength({ max: 120 }),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 })
  ],
  validateRequest,
  listUsers
);

router.post(
  "/credits/adjust",
  [
    body("userId").isInt({ min: 1 }),
    body("amount").isInt(),
    body("reason").isString().trim().isLength({ min: 1, max: 255 })
  ],
  validateRequest,
  adjustCredits
);

router.get(
  "/transactions",
  [
    query("userId").optional().isInt({ min: 1 }),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 200 })
  ],
  validateRequest,
  listTransactions
);

router.get("/settings", getPlatformSettings);
router.put(
  "/settings",
  [
    body("dailyEarnLimit").isInt({ min: 0 }),
    body("likeReward").isInt({ min: 0 }),
    body("commentReward").isInt({ min: 0 }),
    body("subscribeReward").isInt({ min: 0 })
  ],
  validateRequest,
  updatePlatformSettings
);

router.get("/packages", listCreditPackages);
router.post(
  "/packages",
  [
    body("name").isString().trim().isLength({ min: 1, max: 120 }),
    body("credits").isInt({ min: 1 }),
    body("priceLkr").isFloat({ min: 0 }),
    body("isActive").optional().isBoolean()
  ],
  validateRequest,
  createCreditPackage
);
router.patch(
  "/packages/:id",
  [
    body("name").optional().isString().trim().isLength({ min: 1, max: 120 }),
    body("credits").optional().isInt({ min: 1 }),
    body("priceLkr").optional().isFloat({ min: 0 }),
    body("isActive").optional().isBoolean()
  ],
  validateRequest,
  updateCreditPackage
);

module.exports = router;
