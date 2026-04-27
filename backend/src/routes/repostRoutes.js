const express = require("express");
const { body } = require("express-validator");
const validateRequest = require("../middleware/validateRequest");
const { listRepostChannels, requestRepost } = require("../controllers/repostController");

const router = express.Router();

router.get("/channels", listRepostChannels);
router.post(
  "/requests",
  [body("targetUserId").isInt({ min: 1 }), body("messageUrl").isString().isLength({ min: 10, max: 512 })],
  validateRequest,
  requestRepost
);

module.exports = router;
