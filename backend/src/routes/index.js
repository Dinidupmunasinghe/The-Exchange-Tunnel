const express = require("express");
const authMiddleware = require("../middleware/auth");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const telegramRoutes = require("./telegramRoutes");
const campaignRoutes = require("./campaignRoutes");
const taskRoutes = require("./taskRoutes");
const transactionRoutes = require("./transactionRoutes");
const adminRoutes = require("./adminRoutes");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "exchange-tunnel-backend" });
});

router.use("/auth", authRoutes);
router.use(authMiddleware);
router.use("/users", userRoutes);
router.use("/telegram", telegramRoutes);
router.use("/campaigns", campaignRoutes);
router.use("/tasks", taskRoutes);
router.use("/transactions", transactionRoutes);
router.use("/admin", adminRoutes);

module.exports = router;
