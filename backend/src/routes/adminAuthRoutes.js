const express = require("express");
const { body } = require("express-validator");
const validateRequest = require("../middleware/validateRequest");
const adminAuth = require("../middleware/adminAuth");
const { adminLogin, adminMe, adminLogout } = require("../controllers/adminAuthController");

const router = express.Router();

router.post(
  "/login",
  [body("email").isEmail(), body("password").isString().isLength({ min: 1, max: 255 })],
  validateRequest,
  adminLogin
);

router.get("/me", adminAuth, adminMe);
router.post("/logout", adminAuth, adminLogout);

module.exports = router;
