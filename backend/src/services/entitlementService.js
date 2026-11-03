const { Op } = require("sequelize");
const db = require("../models");
const { getEffectiveEntitlements } = require("./subscriptionService");

class EntitlementError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "EntitlementError";
    this.status = code === "INSUFFICIENT_CREDITS" ? 400 : 402;
    this.code = code;
    Object.assign(this, extra);
  }
}

async function countActiveCampaigns(userId, transaction) {
  return db.Campaign.count({
    where: { userId, status: { [Op.in]: ["active", "pending"] } },
    transaction
  });
}

/**
 * Plan checks for spending credits on a campaign. Call it again INSIDE the spending
 * transaction with the user row locked (`user` = locked row), so parallel requests cannot
 * all pass the limits.
 */
async function assertCanCreateCampaign(user, { totalBudget, transaction, skipCampaignLimit = false } = {}) {
  const budget = Number(totalBudget) || 0;
  const { entitlements, subscription } = await getEffectiveEntitlements(user.id, { transaction });
  const isPaid = Boolean(subscription?.isPaid);

  if (!skipCampaignLimit) {
    const maxCampaigns = Number(entitlements.maxActiveCampaigns) || 1;
    const activeCampaigns = await countActiveCampaigns(user.id, transaction);
    if (activeCampaigns >= maxCampaigns) {
      throw new EntitlementError(
        "CAMPAIGN_LIMIT_REACHED",
        `Your plan allows up to ${maxCampaigns} active campaign(s). Upgrade to run more.`,
        { maxActiveCampaigns: maxCampaigns, activeCampaigns }
      );
    }
  }

  const freeCap = Number(entitlements.freeCreditCap);
  if (!isPaid && Number.isFinite(freeCap)) {
    const spent = Number(user.lifetimeCreditsSpent || 0);
    if (spent + budget > freeCap) {
      throw new EntitlementError(
        "PLAN_UPGRADE_REQUIRED",
        `You've reached your free plan limit (${freeCap} credits). Upgrade to launch more campaigns.`,
        { freeCreditCap: freeCap, lifetimeCreditsSpent: spent, required: budget }
      );
    }
  }

  if (Number(user.credits) < budget) {
    throw new EntitlementError(
      "INSUFFICIENT_CREDITS",
      `Insufficient credits — this campaign needs ${budget} upfront but you have ${user.credits}.`,
      { required: budget, balance: user.credits }
    );
  }

  return { entitlements, isPaid };
}

/** Tracks free-plan spend (the free cap). Must run in the same transaction as the spend. */
async function recordCampaignSpend(userId, amount, { transaction } = {}) {
  const n = Math.floor(Number(amount));
  if (n <= 0) return;
  const user = await db.User.findByPk(userId, { transaction, lock: true });
  if (!user) return;
  const { subscription } = await getEffectiveEntitlements(userId, { transaction });
  if (subscription?.isPaid) return;
  user.lifetimeCreditsSpent = Number(user.lifetimeCreditsSpent || 0) + n;
  await user.save({ transaction });
}

function entitlementErrorBody(err) {
  const status = err.status || 400;
  return {
    status,
    body: {
      message: err.message,
      code: err.code || (status === 402 ? "PLAN_UPGRADE_REQUIRED" : undefined),
      required: err.required,
      balance: err.balance,
      freeCreditCap: err.freeCreditCap,
      lifetimeCreditsSpent: err.lifetimeCreditsSpent
    }
  };
}

module.exports = {
  EntitlementError,
  assertCanCreateCampaign,
  recordCampaignSpend,
  entitlementErrorBody
};
