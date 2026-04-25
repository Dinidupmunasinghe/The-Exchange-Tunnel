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
      adminUserId: null,
      adminEmail: req.admin?.email || "admin",
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

async function getPlatformSettings(req, res) {
  const rows = await db.AppSetting.findAll({
    where: { key: { [Op.in]: ["dailyEarnLimit", "likeReward", "commentReward", "subscribeReward"] } },
    order: [["key", "ASC"]]
  });
  const map = new Map(rows.map((r) => [String(r.key), String(r.value)]));
  return res.json({
    settings: {
      dailyEarnLimit: Number(map.get("dailyEarnLimit") || 500),
      likeReward: Number(map.get("likeReward") || 5),
      commentReward: Number(map.get("commentReward") || 10),
      subscribeReward: Number(map.get("subscribeReward") || 10)
    }
  });
}

async function updatePlatformSettings(req, res) {
  const payload = {
    dailyEarnLimit: Number(req.body.dailyEarnLimit),
    likeReward: Number(req.body.likeReward),
    commentReward: Number(req.body.commentReward),
    subscribeReward: Number(req.body.subscribeReward)
  };
  const keys = Object.keys(payload);
  for (const key of keys) {
    const value = payload[key];
    if (!Number.isInteger(value) || value < 0) {
      return res.status(400).json({ message: `${key} must be an integer >= 0` });
    }
  }
  await db.sequelize.transaction(async (transaction) => {
    for (const key of keys) {
      await db.AppSetting.upsert({ key, value: String(payload[key]) }, { transaction });
    }
  });
  return res.json({ message: "Settings updated", settings: payload });
}

async function listCreditPackages(req, res) {
  const packages = await db.CreditPackage.findAll({ order: [["id", "DESC"]] });
  return res.json({ packages });
}

async function createCreditPackage(req, res) {
  const name = String(req.body.name || "").trim();
  const credits = Number(req.body.credits);
  const priceLkr = Number(req.body.priceLkr);
  const isActive = req.body.isActive !== false;
  if (!name) return res.status(400).json({ message: "Package name is required" });
  if (!Number.isInteger(credits) || credits < 1) {
    return res.status(400).json({ message: "Credits must be a positive integer" });
  }
  if (!Number.isFinite(priceLkr) || priceLkr < 0) {
    return res.status(400).json({ message: "Price must be a valid non-negative number" });
  }
  const created = await db.CreditPackage.create({ name, credits, priceLkr, isActive });
  return res.status(201).json({ message: "Package created", package: created });
}

async function updateCreditPackage(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid package id" });
  const pkg = await db.CreditPackage.findByPk(id);
  if (!pkg) return res.status(404).json({ message: "Package not found" });
  if (req.body.name != null) pkg.name = String(req.body.name || "").trim();
  if (req.body.credits != null) {
    const credits = Number(req.body.credits);
    if (!Number.isInteger(credits) || credits < 1) {
      return res.status(400).json({ message: "Credits must be a positive integer" });
    }
    pkg.credits = credits;
  }
  if (req.body.priceLkr != null) {
    const priceLkr = Number(req.body.priceLkr);
    if (!Number.isFinite(priceLkr) || priceLkr < 0) {
      return res.status(400).json({ message: "Price must be a valid non-negative number" });
    }
    pkg.priceLkr = priceLkr;
  }
  if (req.body.isActive != null) pkg.isActive = Boolean(req.body.isActive);
  await pkg.save();
  return res.json({ message: "Package updated", package: pkg });
}

module.exports = {
  listUsers,
  adjustCredits,
  listTransactions,
  getPlatformSettings,
  updatePlatformSettings,
  listCreditPackages,
  createCreditPackage,
  updateCreditPackage
};
