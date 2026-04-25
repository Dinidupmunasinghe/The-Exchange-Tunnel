const { Op } = require("sequelize");
const db = require("../models");
const { adjustCreditsByAdmin } = require("../services/creditService");

function parsePage(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function parseLimit(raw, fallback, max = 100) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

async function listUsers(req, res) {
  const query = String(req.query.query || "").trim();
  const page = parsePage(req.query.page, 1);
  const limit = parseLimit(req.query.limit, 20, 100);
  const offset = (page - 1) * limit;

  const where = query
    ? {
        [Op.or]: [
          { email: { [Op.like]: `%${query}%` } },
          { name: { [Op.like]: `%${query}%` } },
          { telegramUserId: { [Op.like]: `%${query}%` } }
        ]
      }
    : {};

  const { rows, count } = await db.User.findAndCountAll({
    where,
    attributes: [
      "id",
      "email",
      "name",
      "telegramUserId",
      "credits",
      "isActive",
      "createdAt",
      "updatedAt"
    ],
    order: [["id", "DESC"]],
    limit,
    offset
  });

  return res.json({
    users: rows,
    pagination: { page, limit, total: count, totalPages: Math.max(1, Math.ceil(count / limit)) }
  });
}

async function adjustCredits(req, res) {
  const userId = Number(req.body.userId);
  const amount = Number(req.body.amount);
  const reason = String(req.body.reason || "").trim();

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: "Invalid userId" });
  }
  if (!Number.isInteger(amount) || amount === 0) {
    return res.status(400).json({ message: "Amount must be a non-zero integer" });
  }
  if (!reason || reason.length > 255) {
    return res.status(400).json({ message: "Reason is required and must be 255 characters or fewer" });
  }

  const result = await db.sequelize.transaction(async (transaction) => {
    const balance = await adjustCreditsByAdmin({
      userId,
      amount,
      reason,
      adminUserId: req.user.id,
      adminEmail: req.user.email || "",
      transaction
    });
    const updatedUser = await db.User.findByPk(userId, {
      attributes: ["id", "email", "name", "credits"],
      transaction
    });
    return { balance, user: updatedUser };
  });

  return res.json({
    message: amount > 0 ? "Credits added successfully" : "Credits deducted successfully",
    user: result.user,
    balance: result.balance
  });
}

async function listTransactions(req, res) {
  const page = parsePage(req.query.page, 1);
  const limit = parseLimit(req.query.limit, 50, 200);
  const offset = (page - 1) * limit;
  const userId = req.query.userId != null && req.query.userId !== "" ? Number(req.query.userId) : null;
  if (userId != null && (!Number.isInteger(userId) || userId < 1)) {
    return res.status(400).json({ message: "Invalid userId filter" });
  }

  const where = userId ? { userId } : {};
  const { rows, count } = await db.Transaction.findAndCountAll({
    where,
    include: [
      {
        model: db.User,
        as: "user",
        attributes: ["id", "email", "name"]
      }
    ],
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    limit,
    offset
  });

  return res.json({
    transactions: rows,
    pagination: { page, limit, total: count, totalPages: Math.max(1, Math.ceil(count / limit)) }
  });
}

module.exports = { listUsers, adjustCredits, listTransactions };
