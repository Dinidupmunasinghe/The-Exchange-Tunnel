const express = require("express");
const { body } = require("express-validator");
const { register, login, telegramAuth } = require("../controllers/authController");
const validateRequest = require("../middleware/validateRequest");
const { authLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

router.post(
  "/register",
  authLimiter,
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
    body("name").optional().isString().isLength({ min: 2, max: 120 })
  ],
  validateRequest,
  register
);

router.post(
  "/login",
  authLimiter,
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
  ],
  validateRequest,
  login
);

router.post(
  "/telegram",
  authLimiter,
  [
    body("hash").isString().isLength({ min: 1 }),
    body("id")
      .custom((v) => v != null && v !== "" && (typeof v === "number" || (typeof v === "string" && v.length < 20)))
      .withMessage("id is required from Telegram")
  ],
  validateRequest,
  telegramAuth
);

module.exports = router;
