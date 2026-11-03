const express = require("express");
const { body } = require("express-validator");
const authMiddleware = require("../middleware/auth");
const validateRequest = require("../middleware/validateRequest");
const ctrl = require("../controllers/paymentController");

const router = express.Router();

router.use(authMiddleware);

router.post(
  "/paypal/subscriptions",
  [body("packageId").isInt({ min: 1 })],
  validateRequest,
  ctrl.createPayPalSubscription
);
router.get("/subscription/me", ctrl.getMySubscription);
router.post("/subscription/cancel", ctrl.cancelMySubscription);

module.exports = router;
