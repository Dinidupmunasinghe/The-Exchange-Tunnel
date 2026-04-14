const express = require("express");
const { body } = require("express-validator");
const { register, login, soundcloudLogin } = require("../controllers/authController");
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
  "/soundcloud",
  authLimiter,
  [
    body("accessToken").optional().isString().isLength({ min: 10 }),
    body("code").optional().isString().isLength({ min: 4 }),
    body("redirectUri").optional().isString().isLength({ min: 8 }),
    body("codeVerifier").optional().isString().isLength({ min: 43, max: 128 })
  ],
  validateRequest,
  soundcloudLogin
);

module.exports = router;
