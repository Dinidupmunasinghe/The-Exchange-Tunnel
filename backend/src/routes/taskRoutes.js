const express = require("express");
const { body } = require("express-validator");
const {
  getAvailableTasks,
  submitTaskCompletion,
  revertEngagement,
  startCommentDetection,
  pollCommentDetection
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
    body("commentVerifyToken").optional().isString().isLength({ min: 10, max: 120 }),
    body("proofText").optional().isString().isLength({ max: 500 }),
    body("proofText").custom(() => true)
  ],
  validateRequest,
  submitTaskCompletion
);

router.post(
  "/comment-detect/start",
  taskSubmitLimiter,
  [body("taskId").isInt({ min: 1 })],
  validateRequest,
  startCommentDetection
);

router.get("/comment-detect/poll", pollCommentDetection);

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
