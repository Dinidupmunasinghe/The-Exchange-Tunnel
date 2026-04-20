const express = require("express");
const { body } = require("express-validator");
const {
  getAvailableTasks,
  submitTaskCompletion,
  revertEngagement
} = require("../controllers/taskController");
const validateRequest = require("../middleware/validateRequest");
const { taskSubmitLimiter } = require("../middleware/rateLimiters");
const { ENGAGEMENT_TYPES, ACTION_KINDS } = require("../constants/engagement");

const router = express.Router();

router.get("/", getAvailableTasks);
router.post(
  "/complete",
  taskSubmitLimiter,
  [
    body("taskId").isInt({ min: 1 }),
    body("engagementType").isIn(ENGAGEMENT_TYPES),
    body("actionKind").isIn(ACTION_KINDS),
    body("proofText").optional().isString().isLength({ max: 500 }),
    body("proofText").custom((value, { req }) => {
      if (req.body.actionKind === "subscribe") return true;
      if (!value || String(value).trim().length < 10) {
        throw new Error("Proof text must be at least 10 characters for this action");
      }
      return true;
    })
  ],
  validateRequest,
  submitTaskCompletion
);

router.post(
  "/revert",
  taskSubmitLimiter,
  [
    body("campaignId").isInt({ min: 1 }),
    body("actionKind").isIn(["comment"])
  ],
  validateRequest,
  revertEngagement
);

module.exports = router;
