const db = require("../models");
const env = require("../config/env");
const paypal = require("../services/paypalService");
const {
  getActiveSubscription,
  activateFromPayPal,
  grantBillingPeriodCredits,
  cancelSubscription,
  markSubscriptionCancelled,
  getUsageSnapshot,
  getEffectiveEntitlements
} = require("../services/subscriptionService");

function checkoutUrls() {
  const base = env.frontendUrl.replace(/\/$/, "");
  return {
    success: `${base}/checkout/success`,
    cancel: `${base}/checkout/cancel`
  };
}

async function createPayPalSubscription(req, res) {
  const packageId = Number(req.body.packageId);
  if (!Number.isInteger(packageId) || packageId < 1) {
    return res.status(400).json({ message: "Invalid package id" });
  }

  const pkg = await db.CreditPackage.findByPk(packageId);
  if (!pkg || !pkg.isActive) {
    return res.status(404).json({ message: "Package not found" });
  }
  if (pkg.isFree || Number(pkg.priceUsd) <= 0) {
    return res.status(400).json({ message: "This plan does not require payment" });
  }

  if (!paypal.isConfigured()) {
    return res.status(503).json({ message: "PayPal is not configured on the server" });
  }

  if (!pkg.paypalPlanId) {
    const sync = await paypal.syncPlanForPackage(pkg);
    if (!sync.ok || !sync.paypalPlanId) {
      return res.status(400).json({
        message: sync.message || "PayPal plan not available. Sync the package in admin first."
      });
    }
    await pkg.reload();
  }

  const result = await paypal.createSubscriptionApproval({
    packageRow: pkg,
    userId: req.user.id,
    returnUrls: checkoutUrls()
  });

  if (!result.approvalUrl) {
    return res.status(502).json({ message: "Could not create PayPal approval link" });
  }

  return res.json({
    approvalUrl: result.approvalUrl,
    paypalSubscriptionId: result.paypalSubscriptionId
  });
}

async function getMySubscription(req, res) {
  const sub = await getActiveSubscription(req.user.id);
  const effective = await getEffectiveEntitlements(req.user.id);
  const usage = await getUsageSnapshot(req.user.id);
  return res.json({
    subscription: sub
      ? {
          id: sub.id,
          status: sub.status,
          packageId: sub.packageId,
          packageName: sub.package?.name,
          paypalSubscriptionId: sub.paypalSubscriptionId,
          currentPeriodEnd: sub.currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          isPaid: Boolean(sub.paypalSubscriptionId)
        }
      : null,
    package: effective.package,
    usage,
    paypalConfigured: paypal.isConfigured()
  });
}

async function cancelMySubscription(req, res) {
  const sub = await getActiveSubscription(req.user.id);
  if (!sub) return res.status(404).json({ message: "No active subscription" });
  if (sub.paypalSubscriptionId) {
    await paypal.cancelPayPalSubscription(sub.paypalSubscriptionId);
  }
  await cancelSubscription(req.user.id);
  return res.json({ message: "Subscription cancelled" });
}

async function handlePayPalWebhook(req, res) {
  const raw = req.body;
  const event = typeof raw === "string" ? JSON.parse(raw) : raw;
  const eventId = String(event?.id || "");
  const eventType = String(event?.event_type || "");

  if (!eventId) return res.status(400).send("Missing event id");

  const existing = await db.PaymentEvent.findOne({ where: { eventId } });
  if (existing?.processedAt) return res.status(200).send("OK");

  const verified = await paypal.verifyWebhook(req.headers, event);
  if (!verified && env.isProduction) {
    return res.status(401).send("Invalid signature");
  }

  const row =
    existing ||
    (await db.PaymentEvent.create({
      eventId,
      eventType,
      payload: JSON.stringify(event)
    }));

  try {
    await processPayPalEvent(event);
    await row.update({ processedAt: new Date(), error: null });
  } catch (err) {
    await row.update({ error: String(err.message || err) });
    if (env.isProduction) return res.status(500).send("Processing failed");
  }

  return res.status(200).send("OK");
}

async function processPayPalEvent(event) {
  const type = event.event_type;
  const resource = event.resource || {};

  if (type === "BILLING.SUBSCRIPTION.ACTIVATED") {
    const custom = parseCustomId(resource.custom_id);
    const userId = custom.userId;
    const packageId = custom.packageId;
    if (!userId || !packageId) return;
    await activateFromPayPal({
      userId,
      packageId,
      paypalSubscriptionId: resource.id,
      paypalPayerId: resource.subscriber?.payer_id,
      currentPeriodStart: resource.start_time ? new Date(resource.start_time) : new Date(),
      currentPeriodEnd: resource.billing_info?.next_billing_time
        ? new Date(resource.billing_info.next_billing_time)
        : null
    });
    return;
  }

  if (type === "BILLING.SUBSCRIPTION.CANCELLED" || type === "BILLING.SUBSCRIPTION.SUSPENDED") {
    if (resource.id) await markSubscriptionCancelled(resource.id);
    return;
  }

  if (type === "PAYMENT.SALE.COMPLETED") {
    const subId = resource.billing_agreement_id;
    if (!subId) return;
    const sub = await db.UserSubscription.findOne({ where: { paypalSubscriptionId: subId } });
    if (!sub) return;
    await grantBillingPeriodCredits(sub.userId, sub.packageId, { subscriptionId: sub.id });
  }
}

function parseCustomId(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

module.exports = {
  createPayPalSubscription,
  getMySubscription,
  cancelMySubscription,
  handlePayPalWebhook
};
