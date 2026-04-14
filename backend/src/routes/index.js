const express = require("express");
const authMiddleware = require("../middleware/auth");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const soundcloudRoutes = require("./soundcloudRoutes");
const campaignRoutes = require("./campaignRoutes");
const taskRoutes = require("./taskRoutes");
const transactionRoutes = require("./transactionRoutes");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "soundcloud-engagement-backend" });
});

router.use("/auth", authRoutes);
router.use(authMiddleware);
router.use("/users", userRoutes);
router.use("/soundcloud", soundcloudRoutes);
router.use("/campaigns", campaignRoutes);
router.use("/tasks", taskRoutes);
router.use("/transactions", transactionRoutes);

module.exports = router;
