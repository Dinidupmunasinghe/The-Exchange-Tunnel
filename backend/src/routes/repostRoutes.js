const express = require("express");
const { body, query } = require("express-validator");
const validateRequest = require("../middleware/validateRequest");
const { listRepostChannels, requestRepost, listRepostRequests } = require("../controllers/repostController");

const router = express.Router();

router.get("/channels", listRepostChannels);
router.get(
  "/requests",
  [query("type").optional().isIn(["received", "sent"])],
  validateRequest,
  listRepostRequests
);
router.post(
  "/requests",
  [body("targetUserId").isInt({ min: 1 }), body("messageUrl").isString().isLength({ min: 10, max: 512 })],
  validateRequest,
  requestRepost
);

module.exports = router;
