const { Op } = require("sequelize");
const db = require("../models");
const {
  getEffectiveEntitlements,
  getUsageSnapshot
} = require("./subscriptionService");

class EntitlementError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "EntitlementError";
    this.status = code === "INSUFFICIENT_CREDITS" ? 400 : 402;
    this.code = code;
    Object.assign(this, extra);
  }
}

async function countActiveCampaigns(userId) {
  return db.Campaign.count({
    where: { userId, status: { [Op.in]: ["active", "pending"] } }
  });
}

async function assertCanCreateCampaign(user, { totalBudget }) {
  const budget = Number(totalBudget) || 0;
  const { entitlements, subscription } = await getEffectiveEntitlements(user.id);
  const usage = await getUsageSnapshot(user.id);
  const isPaid = Boolean(subscription?.isPaid);

  const maxCampaigns = Number(entitlements.maxActiveCampaigns) || 1;
  const activeCampaigns = await countActiveCampaigns(user.id);
  if (activeCampaigns >= maxCampaigns) {
    throw new EntitlementError(
      "CAMPAIGN_LIMIT_REACHED",
      `Your plan allows up to ${maxCampaigns} active campaign(s). Upgrade to run more.`,
      { maxActiveCampaigns: maxCampaigns, activeCampaigns }
    );
  }

  if (!isPaid && usage.freeCreditCap != null) {
    const cap = Number(usage.freeCreditCap);
    const spent = Number(usage.lifetimeCreditsSpent);
    const projected = spent + budget;
    if (projected > cap) {
      throw new EntitlementError(
        "PLAN_UPGRADE_REQUIRED",
        `You've reached your free plan limit (${cap} credits). Upgrade to launch more campaigns.`,
        {
          freeCreditCap: cap,
          lifetimeCreditsSpent: spent,
          required: budget
        }
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

  return { entitlements, usage, isPaid };
}

async function recordCampaignSpend(userId, amount, { transaction } = {}) {
  const n = Math.floor(Number(amount));
  if (n <= 0) return;
  const user = await db.User.findByPk(userId, { transaction, lock: true });
  if (!user) return;
  const { subscription } = await getEffectiveEntitlements(userId);
  if (subscription?.isPaid) return;
  user.lifetimeCreditsSpent = Number(user.lifetimeCreditsSpent || 0) + n;
  await user.save({ transaction });
}

module.exports = {
  EntitlementError,
  assertCanCreateCampaign,
  recordCampaignSpend,
  getUsageSnapshot
};
