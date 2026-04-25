const express = require("express");
const authMiddleware = require("../middleware/auth");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const telegramRoutes = require("./telegramRoutes");
const campaignRoutes = require("./campaignRoutes");
const taskRoutes = require("./taskRoutes");
const transactionRoutes = require("./transactionRoutes");
const adminRoutes = require("./adminRoutes");
const adminAuthRoutes = require("./adminAuthRoutes");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "exchange-tunnel-backend" });
});

router.use("/auth", authRoutes);
router.use("/admin-auth", adminAuthRoutes);
router.use("/admin", adminRoutes);
router.use(authMiddleware);
router.use("/users", userRoutes);
router.use("/telegram", telegramRoutes);
router.use("/campaigns", campaignRoutes);
router.use("/tasks", taskRoutes);
router.use("/transactions", transactionRoutes);

module.exports = router;
