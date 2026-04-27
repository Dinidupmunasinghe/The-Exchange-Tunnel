const { Op } = require("sequelize");
const db = require("../models");
const sequelize = require("../config/database");
const env = require("../config/env");
const tg = require("../services/telegramService");
const { adjustCreditsByAdmin, refundCredits, reverseEarnCredits } = require("../services/creditService");
const { logAdminAction } = require("../services/adminAuditService");
const { auditSubscribeEngagements, auditSubscriptionMemory } = require("../services/subscriptionAuditService");
const { auditLikeEngagements } = require("../services/likeEngagementAuditService");
const { auditCommentDeletions } = require("../services/commentDeletionAuditService");
const { auditCommentMembershipEngagements } = require("../services/commentMembershipAuditService");

const lastAuditRuns = {
  subscribe: null,
  like: null,
  comment: null,
  commentMembership: null,
  subscribeMemory: null
};

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

function parseDate(raw) {
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(Number(total || 0) / limit)) };
}

/* =========================================================================
 * Overview / KPIs
 * ========================================================================= */

async function getOverview(req, res) {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsers,
    blockedUsers,
    totalCampaigns,
    activeCampaigns,
    pausedCampaigns,
    completedCampaigns,
    totalTasks,
    openTasks,
    completedTasks,
    totalEngagements,
    engagementsLast24h,
    pendingRefundsCount,
    pendingRefundsRemaining,
    totalCredits,
    packagesCount,
    activePackagesCount,
    auditRows
  ] = await Promise.all([
    db.User.count(),
    db.User.count({ where: { isActive: true } }),
    db.User.count({ where: { isActive: false } }),
    db.Campaign.count(),
    db.Campaign.count({ where: { status: "active" } }),
    db.Campaign.count({ where: { status: "paused" } }),
    db.Campaign.count({ where: { status: "completed" } }),
    db.Task.count(),
    db.Task.count({ where: { status: "open" } }),
    db.Task.count({ where: { status: "completed" } }),
    db.Engagement.count(),
    db.Engagement.count({ where: { createdAt: { [Op.gte]: since24h } } }),
    db.PendingRefund.count({ where: { status: "pending" } }),
    db.PendingRefund.sum("amountRemaining", { where: { status: "pending" } }),
    db.User.sum("credits"),
    db.CreditPackage.count(),
    db.CreditPackage.count({ where: { isActive: true } }),
    db.AdminAuditLog.findAll({ order: [["id", "DESC"]], limit: 10 })
  ]);

  return res.json({
    overview: {
      users: {
        total: Number(totalUsers || 0),
        active: Number(activeUsers || 0),
        blocked: Number(blockedUsers || 0)
      },
      campaigns: {
        total: Number(totalCampaigns || 0),
        active: Number(activeCampaigns || 0),
        paused: Number(pausedCampaigns || 0),
        completed: Number(completedCampaigns || 0)
      },
      tasks: {
        total: Number(totalTasks || 0),
        open: Number(openTasks || 0),
        completed: Number(completedTasks || 0)
      },
      engagements: {
        total: Number(totalEngagements || 0),
        last24h: Number(engagementsLast24h || 0)
      },
      pendingRefunds: {
        count: Number(pendingRefundsCount || 0),
        amountRemaining: Number(pendingRefundsRemaining || 0)
      },
      credits: {
        circulating: Number(totalCredits || 0)
      },
      packages: {
        total: Number(packagesCount || 0),
        active: Number(activePackagesCount || 0)
      }
    },
    recentAuditLogs: auditRows
  });
}

/* =========================================================================
 * Users
 * ========================================================================= */

async function listUsers(req, res) {
  const query = String(req.query.query || "").trim();
  const status = String(req.query.status || "").trim();
  const page = parsePage(req.query.page, 1);
  const limit = parseLimit(req.query.limit, 20, 100);
  const offset = (page - 1) * limit;

  const where = {};
  if (query) {
    where[Op.or] = [
      { email: { [Op.like]: `%${query}%` } },
      { name: { [Op.like]: `%${query}%` } },
      { telegramUserId: { [Op.like]: `%${query}%` } }
    ];
  }
  if (status === "active") where.isActive = true;
  else if (status === "blocked") where.isActive = false;

  const { rows, count } = await db.User.findAndCountAll({
    where,
    attributes: [
      "id",
      "email",
      "name",
      "telegramUserId",
      "telegramActingChannelId",
      "telegramActingChannelTitle",
      "credits",
      "dailyEarnedCredits",
      "dailyEarnedAt",
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
    pagination: paginationMeta(page, limit, count)
  });
}

async function getUserDetails(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const user = await db.User.findByPk(id, {
    attributes: [
      "id",
      "email",
      "name",
      "telegramUserId",
      "telegramActingChannelId",
      "telegramActingChannelTitle",
      "credits",
      "dailyEarnedCredits",
      "dailyEarnedAt",
      "isActive",
      "createdAt",
      "updatedAt",
      "userOAuthTokenEncrypted",
      "userActingTokenEncrypted"
    ]
  });
  if (!user) return res.status(404).json({ message: "User not found" });

  const json = user.toJSON();
  json.hasMtprotoSession = Boolean(json.userOAuthTokenEncrypted && json.userActingTokenEncrypted);
  delete json.userOAuthTokenEncrypted;
  delete json.userActingTokenEncrypted;

  const [campaigns, transactions, engagements, pendingDebt] = await Promise.all([
    db.Campaign.findAll({
      where: { userId: id },
      order: [["id", "DESC"]],
      limit: 20,
      attributes: ["id", "name", "engagementType", "status", "creditsPerEngagement", "maxEngagements", "createdAt"]
    }),
    db.Transaction.findAll({
      where: { userId: id },
      order: [["id", "DESC"]],
      limit: 30
    }),
    db.Engagement.findAll({
      where: { userId: id },
      order: [["id", "DESC"]],
      limit: 30,
      include: [
        { model: db.Campaign, as: "campaign", attributes: ["id", "name", "engagementType", "status"] }
      ]
    }),
    db.PendingRefund.sum("amountRemaining", { where: { workerUserId: id, status: "pending" } })
  ]);

  return res.json({
    user: json,
    campaigns,
    transactions,
    engagements,
    pendingRefundDebt: Number(pendingDebt || 0)
  });
}

async function updateUser(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const user = await db.User.findByPk(id);
  if (!user) return res.status(404).json({ message: "User not found" });

  const updates = {};
  if (typeof req.body.name === "string") updates.name = req.body.name.trim().slice(0, 120) || null;
  if (typeof req.body.email === "string") {
    const next = req.body.email.trim().toLowerCase();
    if (next && next !== user.email) {
      const exists = await db.User.findOne({ where: { email: next } });
      if (exists && exists.id !== id) {
        return res.status(400).json({ message: "Email already in use by another user" });
      }
      updates.email = next;
    }
  }
  if (req.body.isActive != null) updates.isActive = Boolean(req.body.isActive);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No supported fields to update" });
  }

  Object.assign(user, updates);
  await user.save();
  await logAdminAction({ req, action: "update_user", targetType: "user", targetId: id, payload: updates });

  return res.json({
    message: "User updated",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive
    }
  });
}

async function blockUser(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const user = await db.User.findByPk(id);
  if (!user) return res.status(404).json({ message: "User not found" });
  user.isActive = false;
  await user.save();
  await logAdminAction({ req, action: "block_user", targetType: "user", targetId: id });
  return res.json({ message: "User blocked", user: { id: user.id, isActive: user.isActive } });
}

async function unblockUser(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const user = await db.User.findByPk(id);
  if (!user) return res.status(404).json({ message: "User not found" });
  user.isActive = true;
  await user.save();
  await logAdminAction({ req, action: "unblock_user", targetType: "user", targetId: id });
  return res.json({ message: "User unblocked", user: { id: user.id, isActive: user.isActive } });
}

async function clearMtprotoSession(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const user = await db.User.findByPk(id);
  if (!user) return res.status(404).json({ message: "User not found" });
  user.userOAuthTokenEncrypted = null;
  user.userActingTokenEncrypted = null;
  await user.save();
  await logAdminAction({ req, action: "clear_mtproto_session", targetType: "user", targetId: id });
  return res.json({ message: "Telegram user session cleared" });
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

  await logAdminAction({
    req,
    action: "adjust_credits",
    targetType: "user",
    targetId: userId,
    payload: { amount, reason }
  });

  return res.json({
    message: amount > 0 ? "Credits added successfully" : "Credits deducted successfully",
    user: result.user,
    balance: result.balance
  });
}

/* =========================================================================
 * Credits / Transactions / Pending refunds
 * ========================================================================= */

async function listTransactions(req, res) {
  const page = parsePage(req.query.page, 1);
  const limit = parseLimit(req.query.limit, 50, 200);
  const offset = (page - 1) * limit;
  const userId = req.query.userId != null && req.query.userId !== "" ? Number(req.query.userId) : null;
  const type = String(req.query.type || "").trim();
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);

  if (userId != null && (!Number.isInteger(userId) || userId < 1)) {
    return res.status(400).json({ message: "Invalid userId filter" });
  }

  const where = {};
  if (userId) where.userId = userId;
  if (type === "earn" || type === "spend") where.type = type;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = from;
    if (to) where.createdAt[Op.lte] = to;
  }

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
    pagination: paginationMeta(page, limit, count)
  });
}

async function listPendingRefunds(req, res) {
  const page = parsePage(req.query.page, 1);
  const limit = parseLimit(req.query.limit, 50, 200);
  const offset = (page - 1) * limit;
  const status = String(req.query.status || "").trim();

  const where = {};
  if (status === "pending" || status === "settled") where.status = status;

  const { rows, count } = await db.PendingRefund.findAndCountAll({
    where,
    include: [
      { model: db.User, as: "worker", attributes: ["id", "email", "name"] },
      { model: db.User, as: "owner", attributes: ["id", "email", "name"] }
    ],
    order: [["id", "DESC"]],
    limit,
    offset
  });

  return res.json({
    refunds: rows,
    pagination: paginationMeta(page, limit, count)
  });
}

async function cancelPendingRefund(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: "Invalid refund id" });
  }
  const refund = await db.PendingRefund.findByPk(id);
  if (!refund) return res.status(404).json({ message: "Pending refund not found" });
  if (refund.status === "settled") {
    return res.status(400).json({ message: "Refund already settled" });
  }
  refund.status = "settled";
  refund.amountRemaining = 0;
  refund.settledAt = new Date();
  refund.reason = `${refund.reason} [admin override]`.slice(0, 255);
  await refund.save();
  await logAdminAction({
    req,
    action: "cancel_pending_refund",
    targetType: "pending_refund",
    targetId: id
  });
  return res.json({ message: "Pending refund cancelled by admin", refund });
}

/* =========================================================================
 * Settings (rewards / daily limit)
 * ========================================================================= */

async function getPlatformSettings(req, res) {
  const rows = await db.AppSetting.findAll({
    where: {
      key: { [Op.in]: ["dailyEarnLimit", "likeReward", "commentReward", "subscribeReward", "shareReward"] }
    },
    order: [["key", "ASC"]]
  });
  const map = new Map(rows.map((r) => [String(r.key), String(r.value)]));
  return res.json({
    settings: {
      dailyEarnLimit: Number(map.get("dailyEarnLimit") || 500),
      likeReward: Number(map.get("likeReward") || 5),
      commentReward: Number(map.get("commentReward") || 10),
      subscribeReward: Number(map.get("subscribeReward") || 10),
      shareReward: Number(map.get("shareReward") || 15)
    }
  });
}

async function updatePlatformSettings(req, res) {
  const payload = {
    dailyEarnLimit: Number(req.body.dailyEarnLimit),
    likeReward: Number(req.body.likeReward),
    commentReward: Number(req.body.commentReward),
    subscribeReward: Number(req.body.subscribeReward),
    shareReward: Number(req.body.shareReward)
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
  await logAdminAction({
    req,
    action: "update_platform_settings",
    targetType: "settings",
    targetId: "platform",
    payload
  });
  return res.json({ message: "Settings updated", settings: payload });
}

/* =========================================================================
 * Repost pricing tiers
 * ========================================================================= */

async function listRepostPricingRules(req, res) {
  const rules = await db.RepostPricingRule.findAll({
    order: [
      ["minSubscribers", "ASC"],
      ["id", "ASC"]
    ]
  });
  return res.json({ rules });
}

async function createRepostPricingRule(req, res) {
  const minSubscribers = Number(req.body.minSubscribers);
  const maxSubscribers =
    req.body.maxSubscribers == null || req.body.maxSubscribers === ""
      ? null
      : Number(req.body.maxSubscribers);
  const credits = Number(req.body.credits);
  const isActive = req.body.isActive !== false;

  if (!Number.isInteger(minSubscribers) || minSubscribers < 0) {
    return res.status(400).json({ message: "minSubscribers must be an integer >= 0" });
  }
  if (maxSubscribers != null && (!Number.isInteger(maxSubscribers) || maxSubscribers < minSubscribers)) {
    return res.status(400).json({ message: "maxSubscribers must be null or an integer >= minSubscribers" });
  }
  if (!Number.isInteger(credits) || credits < 1) {
    return res.status(400).json({ message: "credits must be an integer >= 1" });
  }

  const rule = await db.RepostPricingRule.create({
    minSubscribers,
    maxSubscribers,
    credits,
    isActive
  });
  await logAdminAction({
    req,
    action: "create_repost_pricing_rule",
    targetType: "repost_pricing_rule",
    targetId: rule.id,
    payload: { minSubscribers, maxSubscribers, credits, isActive }
  });
  return res.status(201).json({ message: "Repost pricing rule created", rule });
}

async function updateRepostPricingRule(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid rule id" });
  const rule = await db.RepostPricingRule.findByPk(id);
  if (!rule) return res.status(404).json({ message: "Rule not found" });

  const updates = {};
  if (req.body.minSubscribers != null) {
    const v = Number(req.body.minSubscribers);
    if (!Number.isInteger(v) || v < 0) {
      return res.status(400).json({ message: "minSubscribers must be an integer >= 0" });
    }
    updates.minSubscribers = v;
  }
  if (req.body.maxSubscribers !== undefined) {
    const v = req.body.maxSubscribers == null || req.body.maxSubscribers === "" ? null : Number(req.body.maxSubscribers);
    if (v != null && (!Number.isInteger(v) || v < 0)) {
      return res.status(400).json({ message: "maxSubscribers must be null or an integer >= 0" });
    }
    updates.maxSubscribers = v;
  }
  if (req.body.credits != null) {
    const v = Number(req.body.credits);
    if (!Number.isInteger(v) || v < 1) {
      return res.status(400).json({ message: "credits must be an integer >= 1" });
    }
    updates.credits = v;
  }
  if (req.body.isActive != null) updates.isActive = Boolean(req.body.isActive);

  const nextMin = updates.minSubscribers != null ? updates.minSubscribers : rule.minSubscribers;
  const nextMax = updates.maxSubscribers !== undefined ? updates.maxSubscribers : rule.maxSubscribers;
  if (nextMax != null && nextMax < nextMin) {
    return res.status(400).json({ message: "maxSubscribers must be >= minSubscribers" });
  }

  Object.assign(rule, updates);
  await rule.save();
  await logAdminAction({
    req,
    action: "update_repost_pricing_rule",
    targetType: "repost_pricing_rule",
    targetId: id,
    payload: updates
  });
  return res.json({ message: "Repost pricing rule updated", rule });
}

async function deleteRepostPricingRule(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid rule id" });
  const rule = await db.RepostPricingRule.findByPk(id);
  if (!rule) return res.status(404).json({ message: "Rule not found" });
  await rule.destroy();
  await logAdminAction({
    req,
    action: "delete_repost_pricing_rule",
    targetType: "repost_pricing_rule",
    targetId: id
  });
  return res.json({ message: "Repost pricing rule deleted" });
}

/* =========================================================================
 * Credit packages CRUD
 * ========================================================================= */

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
  await logAdminAction({
    req,
    action: "create_credit_package",
    targetType: "package",
    targetId: created.id,
    payload: { name, credits, priceLkr, isActive }
  });
  return res.status(201).json({ message: "Package created", package: created });
}

async function updateCreditPackage(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid package id" });
  const pkg = await db.CreditPackage.findByPk(id);
  if (!pkg) return res.status(404).json({ message: "Package not found" });
  const updates = {};
  if (req.body.name != null) updates.name = String(req.body.name || "").trim();
  if (req.body.credits != null) {
    const credits = Number(req.body.credits);
    if (!Number.isInteger(credits) || credits < 1) {
      return res.status(400).json({ message: "Credits must be a positive integer" });
    }
    updates.credits = credits;
  }
  if (req.body.priceLkr != null) {
    const priceLkr = Number(req.body.priceLkr);
    if (!Number.isFinite(priceLkr) || priceLkr < 0) {
      return res.status(400).json({ message: "Price must be a valid non-negative number" });
    }
    updates.priceLkr = priceLkr;
  }
  if (req.body.isActive != null) updates.isActive = Boolean(req.body.isActive);
  Object.assign(pkg, updates);
  await pkg.save();
  await logAdminAction({
    req,
    action: "update_credit_package",
    targetType: "package",
    targetId: id,
    payload: updates
  });
  return res.json({ message: "Package updated", package: pkg });
}

async function deleteCreditPackage(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid package id" });
  const pkg = await db.CreditPackage.findByPk(id);
  if (!pkg) return res.status(404).json({ message: "Package not found" });
  await pkg.destroy();
  await logAdminAction({ req, action: "delete_credit_package", targetType: "package", targetId: id });
  return res.json({ message: "Package deleted" });
}

/* =========================================================================
 * Campaigns moderation
 * ========================================================================= */

async function listCampaigns(req, res) {
  const page = parsePage(req.query.page, 1);
  const limit = parseLimit(req.query.limit, 25, 100);
  const offset = (page - 1) * limit;
  const status = String(req.query.status || "").trim();
  const ownerId = req.query.ownerId != null && req.query.ownerId !== "" ? Number(req.query.ownerId) : null;
  const query = String(req.query.query || "").trim();

  const where = {};
  if (status === "active" || status === "paused" || status === "completed" || status === "pending") {
    where.status = status;
  }
  if (ownerId && Number.isInteger(ownerId)) where.userId = ownerId;
  if (query) where.name = { [Op.like]: `%${query}%` };

  const { rows, count } = await db.Campaign.findAndCountAll({
    where,
    include: [{ model: db.User, as: "owner", attributes: ["id", "email", "name", "telegramUserId"] }],
    order: [["id", "DESC"]],
    limit,
    offset
  });

  const campaignIds = rows.map((c) => c.id);
  const completedCounts = campaignIds.length
    ? await db.Task.findAll({
        where: { campaignId: { [Op.in]: campaignIds }, status: "completed" },
        attributes: ["campaignId", [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"]],
        group: ["campaignId"],
        raw: true
      })
    : [];
  const completedMap = new Map(completedCounts.map((r) => [Number(r.campaignId), Number(r.count)]));

  const serialized = rows.map((c) => {
    const json = c.toJSON();
    json.completedTasks = completedMap.get(Number(c.id)) || 0;
    return json;
  });

  return res.json({
    campaigns: serialized,
    pagination: paginationMeta(page, limit, count)
  });
}

async function getCampaignDetails(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid campaign id" });
  const campaign = await db.Campaign.findByPk(id, {
    include: [
      { model: db.User, as: "owner", attributes: ["id", "email", "name", "telegramUserId"] },
      {
        model: db.Task,
        as: "tasks",
        order: [["id", "DESC"]],
        include: [{ model: db.User, as: "assignee", attributes: ["id", "email", "name"] }]
      }
    ]
  });
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  const engagements = await db.Engagement.findAll({
    where: { campaignId: id },
    include: [{ model: db.User, as: "user", attributes: ["id", "email", "name"] }],
    order: [["id", "DESC"]],
    limit: 100
  });
  return res.json({ campaign, engagements });
}

async function updateCampaign(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid campaign id" });
  const campaign = await db.Campaign.findByPk(id);
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });

  const action = String(req.body.action || "").trim();
  if (!["pause", "resume", "cancel"].includes(action)) {
    return res.status(400).json({ message: "Invalid action. Use pause, resume or cancel" });
  }

  if (action === "pause") {
    if (campaign.status === "completed") {
      return res.status(400).json({ message: "Cannot pause a completed campaign" });
    }
    if (campaign.status === "paused") {
      return res.status(400).json({ message: "Campaign is already paused" });
    }
    campaign.status = "paused";
    await campaign.save();
    await logAdminAction({
      req,
      action: "pause_campaign",
      targetType: "campaign",
      targetId: id
    });
    return res.json({ message: "Campaign paused", campaign });
  }
  if (action === "resume") {
    if (campaign.status !== "paused") {
      return res.status(400).json({ message: "Campaign is not paused" });
    }
    const completed = await db.Task.count({
      where: { campaignId: id, status: "completed" }
    });
    if (completed >= campaign.maxEngagements) {
      campaign.status = "completed";
    } else {
      const now = new Date();
      campaign.status =
        campaign.scheduledLaunchAt && new Date(campaign.scheduledLaunchAt) > now ? "pending" : "active";
    }
    await campaign.save();
    await logAdminAction({
      req,
      action: "resume_campaign",
      targetType: "campaign",
      targetId: id
    });
    return res.json({ message: "Campaign resumed", campaign });
  }
  // cancel = mark completed without deleting
  campaign.status = "completed";
  await campaign.save();
  await logAdminAction({
    req,
    action: "cancel_campaign",
    targetType: "campaign",
    targetId: id
  });
  return res.json({ message: "Campaign cancelled", campaign });
}

async function deleteCampaign(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid campaign id" });

  let refundedCredits = 0;
  let ownerId = null;
  try {
    await sequelize.transaction(async (transaction) => {
      const campaign = await db.Campaign.findByPk(id, { transaction });
      if (!campaign) {
        const err = new Error("Campaign not found");
        err.status = 404;
        throw err;
      }
      ownerId = campaign.userId;
      const completed = await db.Task.count({
        where: { campaignId: campaign.id, status: "completed" },
        transaction
      });
      const refund = (campaign.maxEngagements - completed) * campaign.creditsPerEngagement;
      await db.Engagement.destroy({ where: { campaignId: campaign.id }, transaction });
      await db.Task.destroy({ where: { campaignId: campaign.id }, transaction });
      await campaign.destroy({ transaction });
      if (refund > 0) {
        await refundCredits({
          userId: campaign.userId,
          amount: refund,
          reason: `Admin deletion: refund unused budget for campaign #${id}`,
          referenceType: "campaign",
          referenceId: id,
          transaction
        });
        refundedCredits = refund;
      }
    });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ message: err.message });
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ message: "Could not delete campaign" });
  }
  await logAdminAction({
    req,
    action: "delete_campaign",
    targetType: "campaign",
    targetId: id,
    payload: { ownerId, refundedCredits }
  });
  return res.json({ message: "Campaign deleted", refundedCredits });
}

/* =========================================================================
 * Tasks moderation
 * ========================================================================= */

async function listTasks(req, res) {
  const page = parsePage(req.query.page, 1);
  const limit = parseLimit(req.query.limit, 50, 200);
  const offset = (page - 1) * limit;
  const status = String(req.query.status || "").trim();
  const campaignId =
    req.query.campaignId != null && req.query.campaignId !== "" ? Number(req.query.campaignId) : null;
  const assignedUserId =
    req.query.assignedUserId != null && req.query.assignedUserId !== "" ? Number(req.query.assignedUserId) : null;

  const where = {};
  if (["open", "assigned", "completed", "cancelled"].includes(status)) where.status = status;
  if (campaignId && Number.isInteger(campaignId)) where.campaignId = campaignId;
  if (assignedUserId && Number.isInteger(assignedUserId)) where.assignedUserId = assignedUserId;

  const { rows, count } = await db.Task.findAndCountAll({
    where,
    include: [
      { model: db.Campaign, as: "campaign", attributes: ["id", "name", "engagementType", "status", "userId"] },
      { model: db.User, as: "assignee", attributes: ["id", "email", "name"] }
    ],
    order: [["id", "DESC"]],
    limit,
    offset
  });

  return res.json({
    tasks: rows,
    pagination: paginationMeta(page, limit, count)
  });
}

async function cancelTask(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid task id" });

  let refundedCredits = 0;
  let campaignId = null;
  try {
    await sequelize.transaction(async (transaction) => {
      const task = await db.Task.findByPk(id, {
        transaction,
        lock: true,
        include: [{ model: db.Campaign, as: "campaign", required: true }]
      });
      if (!task) {
        const err = new Error("Task not found");
        err.status = 404;
        throw err;
      }
      campaignId = task.campaignId;
      if (task.status === "cancelled") {
        const err = new Error("Task is already cancelled");
        err.status = 400;
        throw err;
      }
      // Refund the slot to the campaign owner if we're killing an open or assigned slot.
      if (task.status === "open" || task.status === "assigned") {
        await refundCredits({
          userId: task.campaign.userId,
          amount: task.rewardCredits,
          reason: `Admin: refund unused slot from cancelled task #${task.id}`,
          referenceType: "task",
          referenceId: task.id,
          transaction
        });
        refundedCredits = task.rewardCredits;
      }
      task.status = "cancelled";
      task.assignedUserId = null;
      task.assignedAt = null;
      task.completedAt = null;
      await task.save({ transaction });
    });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ message: err.message });
    if (err.status === 400) return res.status(400).json({ message: err.message });
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ message: "Could not cancel task" });
  }
  await logAdminAction({
    req,
    action: "cancel_task",
    targetType: "task",
    targetId: id,
    payload: { campaignId, refundedCredits }
  });
  return res.json({ message: "Task cancelled", refundedCredits });
}

/* =========================================================================
 * Engagements monitor + manual reverse
 * ========================================================================= */

async function listEngagements(req, res) {
  const page = parsePage(req.query.page, 1);
  const limit = parseLimit(req.query.limit, 50, 200);
  const offset = (page - 1) * limit;
  const campaignId =
    req.query.campaignId != null && req.query.campaignId !== "" ? Number(req.query.campaignId) : null;
  const userId = req.query.userId != null && req.query.userId !== "" ? Number(req.query.userId) : null;
  const actionKind = String(req.query.actionKind || "").trim();

  const where = {};
  if (campaignId && Number.isInteger(campaignId)) where.campaignId = campaignId;
  if (userId && Number.isInteger(userId)) where.userId = userId;
  if (["like", "comment", "share", "subscribe"].includes(actionKind)) {
    if (actionKind === "subscribe") where.engagementType = "subscribe";
    else where.actionKind = actionKind;
  }

  const { rows, count } = await db.Engagement.findAndCountAll({
    where,
    include: [
      { model: db.User, as: "user", attributes: ["id", "email", "name"] },
      { model: db.Campaign, as: "campaign", attributes: ["id", "name", "engagementType", "status", "userId"] },
      { model: db.Task, as: "task", attributes: ["id", "rewardCredits", "status"] }
    ],
    order: [["id", "DESC"]],
    limit,
    offset
  });

  return res.json({
    engagements: rows,
    pagination: paginationMeta(page, limit, count)
  });
}

async function reverseEngagement(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid engagement id" });

  let workerId = null;
  let ownerId = null;
  let collected = 0;
  try {
    await sequelize.transaction(async (transaction) => {
      const engagement = await db.Engagement.findByPk(id, {
        transaction,
        lock: true,
        include: [
          { model: db.Task, as: "task", required: true },
          { model: db.Campaign, as: "campaign", required: true }
        ]
      });
      if (!engagement) {
        const err = new Error("Engagement not found");
        err.status = 404;
        throw err;
      }
      workerId = engagement.userId;
      ownerId = engagement.campaign?.userId || null;

      const amount = Number(engagement.task?.rewardCredits || 0);
      const reversal = amount > 0
        ? await reverseEarnCredits({
            userId: engagement.userId,
            amount,
            reason: `Admin reversal of engagement #${engagement.id}`,
            referenceType: "task",
            referenceId: engagement.taskId,
            beneficiaryUserId: engagement.campaign?.userId || null,
            transaction
          })
        : null;
      collected = Number(reversal?.collected || 0);
      if (collected > 0 && engagement.campaign?.userId) {
        await refundCredits({
          userId: engagement.campaign.userId,
          amount: collected,
          reason: `Admin refund: engagement reversal on campaign #${engagement.campaignId}`,
          referenceType: "campaign",
          referenceId: engagement.campaignId,
          transaction
        });
      }
      // Reopen the underlying task if it was completed for this engagement.
      const task = engagement.task;
      if (task) {
        task.status = "open";
        task.assignedUserId = null;
        task.assignedAt = null;
        task.completedAt = null;
        await task.save({ transaction });
      }
      // Clean up cross-campaign memory so users can re-earn elsewhere appropriately.
      if (engagement.campaign?.messageKey) {
        if (engagement.engagementType === "subscribe") {
          await db.UserSubscriptionMemory.destroy({
            where: {
              userId: engagement.userId,
              channelKey: String(engagement.campaign.messageKey)
            },
            transaction
          });
        } else if (engagement.actionKind) {
          await db.UserPostAction.destroy({
            where: {
              userId: engagement.userId,
              postKey: String(engagement.campaign.messageKey),
              actionKind: engagement.actionKind
            },
            transaction
          });
        }
      }
      // If campaign was completed, reopen because of new free slot.
      if (engagement.campaign?.status === "completed") {
        engagement.campaign.status = "active";
        await engagement.campaign.save({ transaction });
      }
      await engagement.destroy({ transaction });
    });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ message: err.message });
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ message: err.message || "Could not reverse engagement" });
  }
  await logAdminAction({
    req,
    action: "reverse_engagement",
    targetType: "engagement",
    targetId: id,
    payload: { workerId, ownerId, collectedCredits: collected }
  });
  return res.json({
    message: "Engagement reversed",
    collectedCredits: collected
  });
}

/* =========================================================================
 * Telegram health and audits
 * ========================================================================= */

async function getTelegramHealth(req, res) {
  return res.json({
    botConfigured: tg.isConfigured(),
    botName: env.telegram.botName || null,
    mtprotoConfigured: Boolean(env.telegram.mtproto?.apiId && env.telegram.mtproto?.apiHash),
    mtprotoApiIdConfigured: Boolean(env.telegram.mtproto?.apiId),
    mtprotoApiHashConfigured: Boolean(env.telegram.mtproto?.apiHash),
    pythonBinary: env.telegram.mtproto?.pythonBinary || "python",
    webhookSecretConfigured: Boolean(env.telegram.webhookSecret),
    lastAuditRuns
  });
}

async function runTelegramAudits(req, res) {
  const kind = String(req.body.kind || "all").trim();
  const results = {};
  const startedAt = new Date();
  try {
    if (kind === "all" || kind === "subscribe") {
      results.subscribe = await auditSubscribeEngagements();
      lastAuditRuns.subscribe = { ranAt: startedAt.toISOString(), result: results.subscribe };
    }
    if (kind === "all" || kind === "subscribeMemory") {
      results.subscribeMemory = await auditSubscriptionMemory();
      lastAuditRuns.subscribeMemory = { ranAt: startedAt.toISOString(), result: results.subscribeMemory };
    }
    if (kind === "all" || kind === "like") {
      results.like = await auditLikeEngagements();
      lastAuditRuns.like = { ranAt: startedAt.toISOString(), result: results.like };
    }
    if (kind === "all" || kind === "comment") {
      results.comment = await auditCommentDeletions();
      lastAuditRuns.comment = { ranAt: startedAt.toISOString(), result: results.comment };
    }
    if (kind === "all" || kind === "commentMembership") {
      results.commentMembership = await auditCommentMembershipEngagements();
      lastAuditRuns.commentMembership = {
        ranAt: startedAt.toISOString(),
        result: results.commentMembership
      };
    }
  } catch (err) {
    return res.status(500).json({ message: err.message || "Audit run failed" });
  }
  await logAdminAction({
    req,
    action: "run_telegram_audits",
    targetType: "audit",
    targetId: kind,
    payload: results
  });
  return res.json({ message: "Audits complete", results });
}

/* =========================================================================
 * Admin audit logs
 * ========================================================================= */

async function listAuditLogs(req, res) {
  const page = parsePage(req.query.page, 1);
  const limit = parseLimit(req.query.limit, 50, 200);
  const offset = (page - 1) * limit;
  const adminEmail = String(req.query.adminEmail || "").trim();
  const action = String(req.query.action || "").trim();

  const where = {};
  if (adminEmail) where.adminEmail = { [Op.like]: `%${adminEmail}%` };
  if (action) where.action = { [Op.like]: `%${action}%` };

  const { rows, count } = await db.AdminAuditLog.findAndCountAll({
    where,
    order: [["id", "DESC"]],
    limit,
    offset
  });

  return res.json({
    logs: rows,
    pagination: paginationMeta(page, limit, count)
  });
}

module.exports = {
  getOverview,
  listUsers,
  getUserDetails,
  updateUser,
  blockUser,
  unblockUser,
  clearMtprotoSession,
  adjustCredits,
  listTransactions,
  listPendingRefunds,
  cancelPendingRefund,
  getPlatformSettings,
  updatePlatformSettings,
  listRepostPricingRules,
  createRepostPricingRule,
  updateRepostPricingRule,
  deleteRepostPricingRule,
  listCreditPackages,
  createCreditPackage,
  updateCreditPackage,
  deleteCreditPackage,
  listCampaigns,
  getCampaignDetails,
  updateCampaign,
  deleteCampaign,
  listTasks,
  cancelTask,
  listEngagements,
  reverseEngagement,
  getTelegramHealth,
  runTelegramAudits,
  listAuditLogs
};
