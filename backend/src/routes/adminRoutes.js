const express = require("express");
const { body, query } = require("express-validator");
const requireAdmin = require("../middleware/admin");
const validateRequest = require("../middleware/validateRequest");
const { listUsers, adjustCredits, listTransactions } = require("../controllers/adminController");

const router = express.Router();

router.use(requireAdmin);

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

module.exports = router;
