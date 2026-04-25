const { Op } = require("sequelize");
const env = require("../config/env");
const db = require("../models");

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

async function spendCredits({ userId, amount, reason, referenceType, referenceId, transaction }) {
  const user = await db.User.findByPk(userId, { transaction, lock: true });
  if (!user) throw new Error("User not found");
  if (user.credits < amount) {
    const err = new Error("Insufficient credits");
    err.status = 400;
    throw err;
  }
  user.credits -= amount;
  await user.save({ transaction });

  await db.Transaction.create(
    {
      userId,
      type: "spend",
      amount: -Math.abs(amount),
      reason,
      referenceType,
      referenceId
    },
    { transaction }
  );

  return user.credits;
}

/** Adds credits without applying the daily earn cap (e.g. campaign refunds). */
async function refundCredits({ userId, amount, reason, referenceType, referenceId, transaction }) {
  const n = Math.floor(Number(amount));
  if (n <= 0) return null;
  const user = await db.User.findByPk(userId, { transaction, lock: true });
  if (!user) throw new Error("User not found");
  user.credits += n;
  await user.save({ transaction });
  await db.Transaction.create(
    {
      userId,
      type: "earn",
      amount: n,
      reason,
      referenceType,
      referenceId
    },
    { transaction }
  );
  return user.credits;
}

async function settlePendingRefundDebts({ workerUserId, transaction }) {
  const worker = await db.User.findByPk(workerUserId, { transaction, lock: true });
  if (!worker) throw new Error("User not found");
  if (worker.credits <= 0) return { settled: 0, remainingDebt: 0 };

  const debts = await db.PendingRefund.findAll({
    where: { workerUserId, status: "pending" },
    order: [["id", "ASC"]],
    transaction,
    lock: true
  });
  if (debts.length === 0) return { settled: 0, remainingDebt: 0 };

  let available = worker.credits;
  let settled = 0;
  for (const debt of debts) {
    if (available <= 0) break;
    const pay = Math.min(available, Number(debt.amountRemaining || 0));
    if (pay <= 0) continue;

    const owner = await db.User.findByPk(debt.ownerUserId, { transaction, lock: true });
    if (!owner) continue;

    worker.credits -= pay;
    owner.credits += pay;
    await owner.save({ transaction });

    debt.amountRemaining -= pay;
    if (debt.amountRemaining <= 0) {
      debt.amountRemaining = 0;
      debt.status = "settled";
      debt.settledAt = new Date();
    }
    await debt.save({ transaction });

    await db.Transaction.create(
      {
        userId: workerUserId,
        type: "spend",
        amount: -pay,
        reason: `Auto debt settlement: ${debt.reason}`,
        referenceType: "pending_refund",
        referenceId: debt.id
      },
      { transaction }
    );
    await db.Transaction.create(
      {
        userId: owner.id,
        type: "earn",
        amount: pay,
        reason: `Refund debt settled by worker #${workerUserId}: ${debt.reason}`,
        referenceType: "pending_refund",
        referenceId: debt.id
      },
      { transaction }
    );

    available -= pay;
    settled += pay;
  }

  await worker.save({ transaction });
  const remainingDebt = await db.PendingRefund.sum("amountRemaining", {
    where: { workerUserId, status: "pending" },
    transaction
  });
  return { settled, remainingDebt: Number(remainingDebt || 0) };
}

async function canEarnCreditsToday({ userId, amount, transaction }) {
  const user = await db.User.findByPk(userId, { transaction, lock: true });
  if (!user) throw new Error("User not found");
  const today = getTodayDateString();
  if (user.dailyEarnedAt !== today) {
    user.dailyEarnedAt = today;
    user.dailyEarnedCredits = 0;
  }
  const allowed = user.dailyEarnedCredits + amount <= env.limits.dailyEarnLimit;
  return { user, allowed };
}

/** Take back credits that were earned (e.g. user removed a like). Adjusts daily earn when applicable. */
async function reverseEarnCredits({
  userId,
  amount,
  reason,
  referenceType,
  referenceId,
  beneficiaryUserId = null,
  transaction
}) {
  const n = Math.floor(Number(amount));
  if (n <= 0) return null;
  const user = await db.User.findByPk(userId, { transaction, lock: true });
  if (!user) throw new Error("User not found");
  const collected = Math.min(Number(user.credits || 0), n);
  const remaining = n - collected;
  user.credits -= collected;
  const today = getTodayDateString();
  if (user.dailyEarnedAt === today && user.dailyEarnedCredits > 0) {
    user.dailyEarnedCredits = Math.max(0, Number(user.dailyEarnedCredits || 0) - collected);
  }
  await user.save({ transaction });
  if (collected > 0) {
    await db.Transaction.create(
      {
        userId,
        type: "spend",
        amount: -collected,
        reason,
        referenceType,
        referenceId
      },
      { transaction }
    );
  }
  if (remaining > 0 && beneficiaryUserId) {
    await db.PendingRefund.create(
      {
        workerUserId: userId,
        ownerUserId: beneficiaryUserId,
        amountRemaining: remaining,
        reason,
        referenceType,
        referenceId,
        status: "pending"
      },
      { transaction }
    );
  }
  return { balance: user.credits, collected, remaining };
}

async function earnCredits({ userId, amount, reason, referenceType, referenceId, transaction }) {
  const check = await canEarnCreditsToday({ userId, amount, transaction });
  if (!check.allowed) {
    const err = new Error("Daily earning limit reached");
    err.status = 400;
    throw err;
  }
  const user = check.user;
  user.credits += amount;
  user.dailyEarnedCredits += amount;
  await user.save({ transaction });

  await db.Transaction.create(
    {
      userId,
      type: "earn",
      amount: Math.abs(amount),
      reason,
      referenceType,
      referenceId
    },
    { transaction }
  );
  await settlePendingRefundDebts({ workerUserId: userId, transaction });

  return user.credits;
}

function getRewardByType(type) {
  if (type === "like") return env.limits.likeReward;
  if (type === "comment") return env.limits.commentReward;
  return env.limits.shareReward;
}

async function listTransactionsForUser(userId, limit = 50) {
  return db.Transaction.findAll({
    where: { userId },
    order: [["createdAt", "DESC"]],
    limit
  });
}

async function adjustCreditsByAdmin({
  userId,
  amount,
  reason,
  adminUserId = null,
  adminEmail = "",
  transaction
}) {
  const n = Math.trunc(Number(amount));
  if (!Number.isFinite(n) || n === 0) {
    const err = new Error("Amount must be a non-zero integer");
    err.status = 400;
    throw err;
  }
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    const err = new Error("Reason is required");
    err.status = 400;
    throw err;
  }

  const actor = adminEmail ? `${adminEmail}` : adminUserId ? `user#${adminUserId}` : "unknown_admin";
  const taggedReason = `Admin adjustment by ${actor}: ${cleanReason}`;

  if (n > 0) {
    return refundCredits({
      userId,
      amount: n,
      reason: taggedReason,
      referenceType: "admin_adjustment",
      referenceId: adminUserId || null,
      transaction
    });
  }

  return spendCredits({
    userId,
    amount: Math.abs(n),
    reason: taggedReason,
    referenceType: "admin_adjustment",
    referenceId: adminUserId || null,
    transaction
  });
}

async function getDashboardStats(userId) {
  const campaigns = await db.Campaign.findAll({ where: { userId } });
  const tx = await db.Transaction.findAll({
    where: {
      userId,
      createdAt: { [Op.gte]: new Date(Date.now() - 30 * 24 * 3600 * 1000) }
    }
  });
  const activeCampaigns = campaigns.filter((c) => {
    if (c.status === "active") return true;
    if (
      c.status === "pending" &&
      c.scheduledLaunchAt &&
      new Date(c.scheduledLaunchAt) <= new Date()
    ) {
      return true;
    }
    return false;
  }).length;
  const creditsEarned30d = tx.filter((t) => t.type === "earn").reduce((sum, t) => sum + t.amount, 0);
  const creditsSpent30d = Math.abs(tx.filter((t) => t.type === "spend").reduce((sum, t) => sum + t.amount, 0));
  return { activeCampaigns, creditsEarned30d, creditsSpent30d };
}

module.exports = {
  spendCredits,
  earnCredits,
  reverseEarnCredits,
  settlePendingRefundDebts,
  refundCredits,
  adjustCreditsByAdmin,
  getRewardByType,
  listTransactionsForUser,
  getDashboardStats
};
