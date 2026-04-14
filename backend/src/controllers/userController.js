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
      "soundcloudUserId",
      "soundcloudActingAccountId",
      "soundcloudActingAccountName",
      "createdAt"
    ]
  });
  return res.json({ user });
}

async function getDashboard(req, res) {
  const stats = await getDashboardStats(req.user.id);
  return res.json({ stats });
}

module.exports = { getProfile, getDashboard };
