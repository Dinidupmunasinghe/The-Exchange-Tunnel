const { Op } = require("sequelize");
const db = require("../models");
const { parseEntitlements } = require("../utils/packageEntitlements");
const { serializeCreditPackage } = require("../utils/creditPackageSerializer");
const { refundCredits } = require("./creditService");

async function getFreePackage() {
  let pkg = await db.CreditPackage.findOne({
    where: { isFree: true, isActive: true },
    order: [["sortOrder", "ASC"], ["id", "ASC"]]
  });
  if (!pkg) {
    pkg = await db.CreditPackage.findOne({
      where: { isActive: true },
      order: [["sortOrder", "ASC"], ["id", "ASC"]]
    });
  }
  return pkg;
}

async function getActiveSubscription(userId, { transaction } = {}) {
  return db.UserSubscription.findOne({
    where: { userId, status: "active" },
    include: [{ model: db.CreditPackage, as: "package" }],
    order: [["id", "DESC"]],
    transaction
  });
}

async function getEffectiveEntitlements(userId) {
  const sub = await getActiveSubscription(userId);
  if (sub?.package) {
    return {
      package: serializeCreditPackage(sub.package),
      subscription: {
        id: sub.id,
        status: sub.status,
        packageId: sub.packageId,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        isPaid: Boolean(sub.paypalSubscriptionId) && !sub.package.isFree
      },
      entitlements: parseEntitlements(sub.package.entitlements, {
        credits: sub.package.credits,
        isFree: sub.package.isFree
      })
    };
  }
  const freePkg = await getFreePackage();
  if (!freePkg) {
    return {
      package: null,
      subscription: null,
      entitlements: parseEntitlements(null, { credits: 50, isFree: true })
    };
  }
  return {
    package: serializeCreditPackage(freePkg),
    subscription: null,
    entitlements: parseEntitlements(freePkg.entitlements, {
      credits: freePkg.credits,
      isFree: true
    })
  };
}

async function assignFreePlan(user, { transaction } = {}) {
  const freePkg = await getFreePackage();
  if (!freePkg) return null;

  const ent = parseEntitlements(freePkg.entitlements, {
    credits: freePkg.credits,
    isFree: true
  });
  const cap = Number(ent.freeCreditCap) || Number(freePkg.credits) || 50;

  const existingPaid = await db.UserSubscription.findOne({
    where: {
      userId: user.id,
      status: "active",
      paypalSubscriptionId: { [Op.ne]: null }
    },
    transaction
  });
  if (existingPaid) return existingPaid;

  await db.UserSubscription.update(
    { status: "cancelled" },
    { where: { userId: user.id, status: "active" }, transaction }
  );

  const sub = await db.UserSubscription.create(
    {
      userId: user.id,
      packageId: freePkg.id,
      status: "active",
      paypalSubscriptionId: null,
      currentPeriodStart: new Date()
    },
    { transaction }
  );

  if (Number(user.credits) < cap) {
    user.credits = cap;
    await user.save({ transaction });
  }

  return sub;
}

async function activateFromPayPal({
  userId,
  packageId,
  paypalSubscriptionId,
  paypalPayerId,
  currentPeriodStart,
  currentPeriodEnd
}) {
  const pkg = await db.CreditPackage.findByPk(packageId);
  if (!pkg) throw new Error("Package not found");

  await db.UserSubscription.update(
    { status: "cancelled" },
    { where: { userId, status: "active" } }
  );

  const [sub] = await db.UserSubscription.findOrCreate({
    where: { paypalSubscriptionId },
    defaults: {
      userId,
      packageId,
      status: "active",
      paypalPayerId: paypalPayerId || null,
      currentPeriodStart: currentPeriodStart || new Date(),
      currentPeriodEnd: currentPeriodEnd || null,
      cancelAtPeriodEnd: false
    }
  });

  if (sub.userId !== userId || sub.packageId !== packageId) {
    await sub.update({
      userId,
      packageId,
      status: "active",
      paypalPayerId: paypalPayerId || null,
      currentPeriodStart: currentPeriodStart || new Date(),
      currentPeriodEnd: currentPeriodEnd || null,
      cancelAtPeriodEnd: false
    });
  }

  return sub;
}

async function grantBillingPeriodCredits(userId, packageId, { subscriptionId, transaction } = {}) {
  const pkg = await db.CreditPackage.findByPk(packageId, { transaction });
  if (!pkg) return null;
  const ent = parseEntitlements(pkg.entitlements, { credits: pkg.credits, isFree: pkg.isFree });
  const grant = Number(ent.monthlyCreditGrant) || Number(pkg.credits) || 0;
  if (grant <= 0) return null;

  const user = await db.User.findByPk(userId, { transaction, lock: transaction ? true : undefined });
  if (!user) return null;

  await refundCredits({
    userId,
    amount: grant,
    reason: `Monthly plan credits: ${pkg.name}`,
    referenceType: "package_purchase",
    referenceId: subscriptionId || packageId,
    transaction
  });

  return grant;
}

async function cancelSubscription(userId) {
  const sub = await getActiveSubscription(userId);
  if (!sub) return null;
  if (!sub.paypalSubscriptionId) {
    await sub.update({ status: "cancelled" });
    await assignFreePlan(await db.User.findByPk(userId));
    return sub;
  }
  await sub.update({ cancelAtPeriodEnd: true });
  return sub;
}

async function markSubscriptionCancelled(paypalSubscriptionId) {
  const sub = await db.UserSubscription.findOne({ where: { paypalSubscriptionId } });
  if (!sub) return null;
  await sub.update({ status: "cancelled", cancelAtPeriodEnd: false });
  const user = await db.User.findByPk(sub.userId);
  if (user) await assignFreePlan(user);
  return sub;
}

async function getUsageSnapshot(userId) {
  const user = await db.User.findByPk(userId);
  const { entitlements, package: pkg, subscription } = await getEffectiveEntitlements(userId);
  const isPaid = Boolean(subscription?.isPaid);
  const freeCap = Number(entitlements.freeCreditCap);
  return {
    lifetimeCreditsSpent: Number(user?.lifetimeCreditsSpent || 0),
    freeCreditCap: Number.isFinite(freeCap) ? freeCap : null,
    isOnFreePlan: !isPaid,
    planName: pkg?.name || "Free",
    packageId: pkg?.id || null
  };
}

module.exports = {
  getFreePackage,
  getActiveSubscription,
  getEffectiveEntitlements,
  assignFreePlan,
  activateFromPayPal,
  grantBillingPeriodCredits,
  cancelSubscription,
  markSubscriptionCancelled,
  getUsageSnapshot
};
