const db = require("../models");
const { getDashboardStats } = require("../services/creditService");

async function getProfile(req, res) {
  const user = await db.User.findByPk(req.user.id, {
    attributes: [
      "id",
      "email",
      "name",
      "credits",
      "dailyEarnedCredits",
      "dailyEarnedAt",
      "telegramUserId",
      "telegramActingChannelId",
      "telegramActingChannelTitle",
      "userActingTokenEncrypted",
      "createdAt"
    ]
  });
  if (!user) return res.status(404).json({ message: "User not found" });
  const data = user.toJSON();
  const hasMtprotoSession = Boolean(data.userActingTokenEncrypted);
  delete data.userActingTokenEncrypted;
  const pendingRefundDebt = await db.PendingRefund.sum("amountRemaining", {
    where: { workerUserId: req.user.id, status: "pending" }
  });
  return res.json({ user: { ...data, hasMtprotoSession, pendingRefundDebt: Number(pendingRefundDebt || 0) } });
}

async function getDashboard(req, res) {
  const stats = await getDashboardStats(req.user.id);
  return res.json({ stats });
}

module.exports = { getProfile, getDashboard };
