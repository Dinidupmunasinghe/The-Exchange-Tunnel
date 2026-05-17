const express = require("express");
const authMiddleware = require("../middleware/auth");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const telegramRoutes = require("./telegramRoutes");
const campaignRoutes = require("./campaignRoutes");
const taskRoutes = require("./taskRoutes");
const transactionRoutes = require("./transactionRoutes");
const repostRoutes = require("./repostRoutes");
const packageRoutes = require("./packageRoutes");
const adminRoutes = require("./adminRoutes");
const adminAuthRoutes = require("./adminAuthRoutes");

const router = express.Router();

const env = require("../config/env");

router.get("/health", (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: "ok",
    service: "exchange-tunnel-backend",
    uptimeSec: Math.round(process.uptime()),
    memoryMb: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024)
    },
    lowMemoryHost: env.lowMemoryHost,
    auditsEnabled: env.auditsEnabled,
    telegramDeepSync: env.telegramDeepSync
  });
});

router.use("/auth", authRoutes);
router.use("/admin-auth", adminAuthRoutes);
router.use("/admin", adminRoutes);
router.use("/packages", packageRoutes);
router.use(authMiddleware);
router.use("/users", userRoutes);
router.use("/telegram", telegramRoutes);
router.use("/campaigns", campaignRoutes);
router.use("/tasks", taskRoutes);
router.use("/transactions", transactionRoutes);
router.use("/repost", repostRoutes);

module.exports = router;
