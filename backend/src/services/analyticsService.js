const { Op, fn, col } = require("sequelize");
const db = require("../models");

const EARN_TASK = { type: "earn", referenceType: "task" };
const SPEND_CAMPAIGN = { type: "spend", referenceType: "campaign" };

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function emptyDays(days) {
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    out.push(dayKey(d));
  }
  return out;
}

async function sumAmount(where) {
  const v = await db.Transaction.sum("amount", { where });
  return Math.abs(Number(v || 0));
}

/**
 * Real analytics for one user (worker + campaign owner view).
 * All numbers come from the ledger / engagement tables; nothing is estimated.
 */
async function getUserAnalytics(userId, { days = 30 } = {}) {
  const span = Math.min(Math.max(Number(days) || 30, 7), 90);
  const since = new Date(Date.now() - span * 24 * 3600 * 1000);
  const dateExpr = fn("DATE", col("createdAt"));

  const [txDaily, engagedDaily, receivedDaily, campaigns, earnedTotal, spentTotal, refundedTotal, planCredits, byKind] =
    await Promise.all([
      db.Transaction.findAll({
        attributes: [[dateExpr, "day"], "type", "referenceType", [fn("SUM", col("amount")), "total"]],
        where: { userId, createdAt: { [Op.gte]: since } },
        group: [dateExpr, "type", "referenceType"],
        raw: true
      }),
      db.Engagement.findAll({
        attributes: [[dateExpr, "day"], [fn("COUNT", col("id")), "count"]],
        where: { userId, createdAt: { [Op.gte]: since } },
        group: [dateExpr],
        raw: true
      }),
      db.Engagement.findAll({
        attributes: [[fn("DATE", col("Engagement.createdAt")), "day"], [fn("COUNT", col("Engagement.id")), "count"]],
        where: { createdAt: { [Op.gte]: since } },
        include: [{ model: db.Campaign, as: "campaign", attributes: [], where: { userId }, required: true }],
        group: [fn("DATE", col("Engagement.createdAt"))],
        raw: true
      }),
      db.Campaign.findAll({
        where: { userId },
        include: [{ model: db.Task, as: "tasks", attributes: ["status"] }],
        order: [["createdAt", "DESC"]],
        limit: 50
      }),
      sumAmount({ userId, ...EARN_TASK }),
      sumAmount({ userId, ...SPEND_CAMPAIGN }),
      sumAmount({ userId, type: "earn", referenceType: "campaign" }),
      sumAmount({ userId, type: "earn", referenceType: { [Op.in]: ["package_purchase", "signup_grant"] } }),
      db.Engagement.findAll({
        attributes: ["engagementType", "actionKind", [fn("COUNT", col("id")), "count"]],
        where: { userId },
        group: ["engagementType", "actionKind"],
        raw: true
      })
    ]);

  const daily = new Map(
    emptyDays(span).map((d) => [d, { date: d, earned: 0, spent: 0, refunded: 0, engagementsDone: 0, engagementsReceived: 0 }])
  );
  for (const r of txDaily) {
    const row = daily.get(dayKey(r.day));
    if (!row) continue;
    const amt = Math.abs(Number(r.total || 0));
    if (r.type === "earn" && r.referenceType === "task") row.earned += amt;
    else if (r.type === "spend" && r.referenceType === "campaign") row.spent += amt;
    else if (r.type === "earn" && r.referenceType === "campaign") row.refunded += amt;
  }
  for (const r of engagedDaily) {
    const row = daily.get(dayKey(r.day));
    if (row) row.engagementsDone += Number(r.count || 0);
  }
  for (const r of receivedDaily) {
    const row = daily.get(dayKey(r.day));
    if (row) row.engagementsReceived += Number(r.count || 0);
  }

  const engagementsByType = { subscribe: 0, like: 0, comment: 0, share: 0 };
  for (const r of byKind) {
    const k = r.engagementType === "subscribe" ? "subscribe" : r.actionKind || r.engagementType;
    if (k in engagementsByType) engagementsByType[k] += Number(r.count || 0);
  }

  const campaignRows = campaigns.map((c) => {
    const completed = c.tasks.filter((t) => t.status === "completed").length;
    return {
      id: c.id,
      name: c.name,
      engagementType: c.engagementType,
      status: c.status,
      maxEngagements: c.maxEngagements,
      completed,
      progress: c.maxEngagements ? Math.round((completed / c.maxEngagements) * 100) : 0,
      creditsSpent: completed * Number(c.creditsPerEngagement || 0),
      budget: Number(c.maxEngagements || 0) * Number(c.creditsPerEngagement || 0),
      createdAt: c.createdAt
    };
  });

  const received = campaignRows.reduce((s, c) => s + c.completed, 0);
  const netSpent = Math.max(0, spentTotal - refundedTotal);
  return {
    days: span,
    totals: {
      creditsEarned: earnedTotal,
      creditsSpent: netSpent,
      creditsRefunded: refundedTotal,
      planCredits,
      engagementsDone: Object.values(engagementsByType).reduce((s, n) => s + n, 0),
      engagementsReceived: received,
      campaigns: campaignRows.length,
      activeCampaigns: campaignRows.filter((c) => c.status === "active" || c.status === "pending").length,
      costPerEngagement: received > 0 ? Math.round((campaignRows.reduce((s, c) => s + c.creditsSpent, 0) / received) * 10) / 10 : 0
    },
    daily: [...daily.values()],
    engagementsByType,
    campaigns: campaignRows
  };
}

module.exports = { getUserAnalytics };
