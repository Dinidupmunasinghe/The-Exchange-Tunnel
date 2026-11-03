const { Op, UniqueConstraintError } = require("sequelize");
const db = require("../models");
const sequelize = require("../config/database");
const { parseEntitlements } = require("../utils/packageEntitlements");
const { serializeCreditPackage } = require("../utils/creditPackageSerializer");
const { refundCredits, reverseEarnCredits } = require("./creditService");

/** Statuses that grant the plan's entitlements. */
const ENTITLED_STATUSES = ["active"];

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

/**
 * The plan everyone without a paid subscription is on. Only an explicitly free package
 * qualifies; when admins removed it we fall back to built-in free entitlements (never to a
 * paid package).
 */
async function getFreePackage({ transaction } = {}) {
  return db.CreditPackage.findOne({
    where: { isFree: true, isActive: true },
    order: [["sortOrder", "ASC"], ["id", "ASC"]],
    transaction
  });
}

function builtInFreeEntitlements() {
  return parseEntitlements(null, { credits: 50, isFree: true });
}

async function getActiveSubscription(userId, { transaction } = {}) {
  return db.UserSubscription.findOne({
    where: { userId, status: { [Op.in]: ENTITLED_STATUSES } },
    include: [{ model: db.CreditPackage, as: "package" }],
    order: [["id", "DESC"]],
    transaction
  });
}

function isPaidSubscription(sub) {
  return Boolean(sub?.paypalSubscriptionId) && Boolean(sub?.package) && !sub.package.isFree;
}

async function getEffectiveEntitlements(userId, { transaction } = {}) {
  const sub = await getActiveSubscription(userId, { transaction });
  if (sub?.package) {
    return {
      package: serializeCreditPackage(sub.package),
      subscription: {
        id: sub.id,
        status: sub.status,
        packageId: sub.packageId,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        isPaid: isPaidSubscription(sub)
      },
      entitlements: parseEntitlements(sub.package.entitlements, {
        credits: sub.package.credits,
        isFree: sub.package.isFree
      })
    };
  }
  const freePkg = await getFreePackage({ transaction });
  if (!freePkg) {
    return { package: null, subscription: null, entitlements: builtInFreeEntitlements() };
  }
  return {
    package: serializeCreditPackage(freePkg),
    subscription: null,
    entitlements: parseEntitlements(freePkg.entitlements, { credits: freePkg.credits, isFree: true })
  };
}

/**
 * Puts the user on the free plan (when they have no active plan). Never touches credits:
 * free credits are granted exactly once by grantSignupCredits.
 */
async function assignFreePlan(user, { transaction } = {}) {
  const active = await db.UserSubscription.findOne({
    where: { userId: user.id, status: { [Op.in]: ENTITLED_STATUSES } },
    transaction
  });
  if (active) return active;
  const freePkg = await getFreePackage({ transaction });
  if (!freePkg) return null;
  return db.UserSubscription.create(
    {
      userId: user.id,
      packageId: freePkg.id,
      status: "active",
      paypalSubscriptionId: null,
      currentPeriodStart: new Date()
    },
    { transaction }
  );
}

/** One-time welcome credits for new accounts (recorded in the ledger). */
async function grantSignupCredits(user, { transaction } = {}) {
  const run = async (t) => {
    const fresh = await db.User.findByPk(user.id, { transaction: t, lock: true });
    if (!fresh || fresh.freeGrantGivenAt) return 0;
    const freePkg = await getFreePackage({ transaction: t });
    const ent = freePkg
      ? parseEntitlements(freePkg.entitlements, { credits: freePkg.credits, isFree: true })
      : builtInFreeEntitlements();
    const amount = Math.max(0, Math.floor(Number(ent.freeCreditCap) || Number(freePkg?.credits) || 50));
    fresh.freeGrantGivenAt = new Date();
    await fresh.save({ transaction: t });
    if (amount > 0) {
      await refundCredits({
        userId: fresh.id,
        amount,
        reason: "Welcome credits (free plan)",
        referenceType: "signup_grant",
        referenceId: fresh.id,
        transaction: t
      });
    }
    return amount;
  };
  return transaction ? run(transaction) : sequelize.transaction(run);
}

/** Sets up a brand-new account: free plan + one-time welcome credits. */
async function onboardNewUser(user) {
  await sequelize.transaction(async (transaction) => {
    await assignFreePlan(user, { transaction });
    await grantSignupCredits(user, { transaction });
  });
}

/** Records the PayPal subscription we just created so webhooks/confirmations can be matched. */
async function createPendingSubscription({ userId, packageId, paypalSubscriptionId }) {
  const [sub, created] = await db.UserSubscription.findOrCreate({
    where: { paypalSubscriptionId },
    defaults: { userId, packageId, status: "pending", paypalSubscriptionId }
  });
  if (!created && sub.userId !== userId) {
    throw httpError(409, "Subscription belongs to another account");
  }
  return sub;
}

/**
 * Marks a PayPal subscription active for the user and retires their previous plan.
 * Idempotent: re-processing the same activation leaves exactly one active subscription.
 * Returns { sub, supersededPaypalIds } — the caller cancels superseded ones at PayPal.
 */
async function activateFromPayPal({
  userId,
  packageId,
  paypalSubscriptionId,
  paypalPayerId,
  currentPeriodStart,
  currentPeriodEnd
}) {
  return sequelize.transaction(async (transaction) => {
    const pkg = await db.CreditPackage.findByPk(packageId, { transaction });
    if (!pkg) throw new Error("Package not found");
    await db.User.findByPk(userId, { transaction, lock: true });

    let sub = await db.UserSubscription.findOne({
      where: { paypalSubscriptionId },
      transaction,
      lock: true
    });
    if (sub && sub.userId !== userId) throw new Error("Subscription user mismatch");
    const fields = {
      userId,
      packageId,
      status: "active",
      paypalPayerId: paypalPayerId || sub?.paypalPayerId || null,
      currentPeriodStart: currentPeriodStart || sub?.currentPeriodStart || new Date(),
      currentPeriodEnd: currentPeriodEnd || sub?.currentPeriodEnd || null,
      cancelAtPeriodEnd: false
    };
    if (sub) await sub.update(fields, { transaction });
    else sub = await db.UserSubscription.create({ ...fields, paypalSubscriptionId }, { transaction });

    const others = await db.UserSubscription.findAll({
      where: {
        userId,
        id: { [Op.ne]: sub.id },
        status: { [Op.in]: ["active", "past_due", "suspended"] }
      },
      transaction,
      lock: true
    });
    const supersededPaypalIds = [];
    for (const o of others) {
      if (o.paypalSubscriptionId) supersededPaypalIds.push(o.paypalSubscriptionId);
      await o.update({ status: "cancelled", cancelAtPeriodEnd: false }, { transaction });
    }
    return { sub, supersededPaypalIds };
  });
}

/** Lifecycle updates driven by PayPal events. */
async function setSubscriptionStatus(paypalSubscriptionId, status) {
  const sub = await db.UserSubscription.findOne({ where: { paypalSubscriptionId } });
  if (!sub) return null;
  await sub.update({ status });
  if (status !== "active") {
    const user = await db.User.findByPk(sub.userId);
    if (user) await assignFreePlan(user);
  }
  return sub;
}

/**
 * PayPal CANCELLED/EXPIRED: the user already paid for the running period, so keep the plan
 * until currentPeriodEnd; the hourly sweep (expireEndedSubscriptions) ends it afterwards.
 */
async function markSubscriptionEnded(paypalSubscriptionId, finalStatus = "cancelled") {
  const sub = await db.UserSubscription.findOne({ where: { paypalSubscriptionId } });
  if (!sub) return null;
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  if (sub.status === "active" && end && end > new Date()) {
    await sub.update({ cancelAtPeriodEnd: true });
    return sub;
  }
  await sub.update({ status: finalStatus, cancelAtPeriodEnd: false });
  const user = await db.User.findByPk(sub.userId);
  if (user) await assignFreePlan(user);
  return sub;
}

/** Ends subscriptions whose paid period is over after a cancellation. */
async function expireEndedSubscriptions() {
  const due = await db.UserSubscription.findAll({
    where: {
      status: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: { [Op.lt]: new Date() }
    },
    limit: 200
  });
  for (const sub of due) {
    await sub.update({ status: "cancelled", cancelAtPeriodEnd: false });
    const user = await db.User.findByPk(sub.userId);
    if (user) await assignFreePlan(user);
  }
  return due.length;
}

/**
 * Grants a billing period's credits for one PayPal sale, exactly once.
 * Idempotency key: a payment_events row "sale:<saleId>" (unique eventId) inserted in the same
 * transaction as the credit grant — duplicate webhooks, retries and the confirm endpoint can
 * all call this safely.
 * @returns {{ granted: number, duplicate?: boolean, skipped?: string }}
 */
async function grantForSale({ saleId, paypalSubscriptionId, amountUsd, currency }) {
  if (!saleId) return { granted: 0, skipped: "missing sale id" };
  const sub = await db.UserSubscription.findOne({
    where: { paypalSubscriptionId },
    include: [{ model: db.CreditPackage, as: "package" }]
  });
  if (!sub || !sub.package) return { granted: 0, skipped: "unknown subscription" };
  if (sub.status !== "active") return { granted: 0, skipped: `subscription is ${sub.status}` };

  const pkg = sub.package;
  const price = Number(pkg.priceUsd || 0);
  if (currency && String(currency).toUpperCase() !== "USD") {
    return { granted: 0, skipped: `unexpected currency ${currency}` };
  }
  if (Number.isFinite(Number(amountUsd)) && Number(amountUsd) + 0.01 < price) {
    return { granted: 0, skipped: `paid ${amountUsd} < plan price ${price}` };
  }
  const ent = parseEntitlements(pkg.entitlements, { credits: pkg.credits, isFree: pkg.isFree });
  const credits = Math.max(0, Math.floor(Number(ent.monthlyCreditGrant) || Number(pkg.credits) || 0));
  if (credits <= 0) return { granted: 0, skipped: "plan grants no credits" };

  try {
    await sequelize.transaction(async (transaction) => {
      await db.PaymentEvent.create(
        {
          provider: "paypal",
          eventId: `sale:${saleId}`,
          eventType: "SALE.CREDITS_GRANTED",
          resourceId: String(paypalSubscriptionId),
          creditsGranted: credits,
          userId: sub.userId,
          payload: JSON.stringify({ saleId, amountUsd, currency, packageId: pkg.id }),
          processedAt: new Date()
        },
        { transaction }
      );
      await refundCredits({
        userId: sub.userId,
        amount: credits,
        reason: `Plan credits: ${pkg.name}`.slice(0, 255),
        referenceType: "package_purchase",
        referenceId: sub.id,
        transaction
      });
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) return { granted: 0, duplicate: true };
    throw err;
  }
  return { granted: credits };
}

/** PayPal refund/chargeback: take back the credits of that sale (proportionally). */
async function clawBackSale({ saleId, refundAmountUsd }) {
  const grant = await db.PaymentEvent.findOne({ where: { eventId: `sale:${saleId}` } });
  if (!grant || !grant.creditsGranted || !grant.userId) return { reversed: 0, skipped: "no grant for sale" };
  let saleAmount = null;
  try {
    saleAmount = Number(JSON.parse(grant.payload || "{}").amountUsd);
  } catch {
    saleAmount = null;
  }
  const ratio =
    Number.isFinite(Number(refundAmountUsd)) && saleAmount > 0
      ? Math.min(1, Number(refundAmountUsd) / saleAmount)
      : 1;
  const amount = Math.ceil(Number(grant.creditsGranted) * ratio);
  if (amount <= 0) return { reversed: 0 };
  await sequelize.transaction(async (transaction) => {
    await db.PaymentEvent.create(
      {
        provider: "paypal",
        eventId: `refund:${saleId}:${refundAmountUsd ?? "full"}`,
        eventType: "SALE.CREDITS_REVERSED",
        resourceId: grant.resourceId,
        creditsGranted: -amount,
        userId: grant.userId,
        processedAt: new Date()
      },
      { transaction }
    );
    await reverseEarnCredits({
      userId: grant.userId,
      amount,
      reason: `PayPal refund/reversal of plan payment ${saleId}`,
      referenceType: "package_refund",
      referenceId: grant.id,
      transaction
    });
  }).catch((err) => {
    if (!(err instanceof UniqueConstraintError)) throw err;
  });
  return { reversed: amount };
}

async function cancelSubscription(userId) {
  const sub = await getActiveSubscription(userId);
  if (!sub) throw httpError(404, "No active subscription");
  if (!isPaidSubscription(sub)) {
    throw httpError(400, "You are on the free plan — there is nothing to cancel.");
  }
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  if (end && end > new Date()) {
    await sub.update({ cancelAtPeriodEnd: true });
  } else {
    await sub.update({ status: "cancelled", cancelAtPeriodEnd: false });
    await assignFreePlan(await db.User.findByPk(userId));
  }
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
  isPaidSubscription,
  assignFreePlan,
  grantSignupCredits,
  onboardNewUser,
  createPendingSubscription,
  activateFromPayPal,
  setSubscriptionStatus,
  markSubscriptionEnded,
  expireEndedSubscriptions,
  grantForSale,
  clawBackSale,
  cancelSubscription,
  getUsageSnapshot
};
