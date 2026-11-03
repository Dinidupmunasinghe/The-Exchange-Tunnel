const { Op } = require("sequelize");
const db = require("../models");
const env = require("../config/env");
const paypal = require("../services/paypalService");
const {
  getActiveSubscription,
  isPaidSubscription,
  createPendingSubscription,
  activateFromPayPal,
  setSubscriptionStatus,
  markSubscriptionEnded,
  grantForSale,
  clawBackSale,
  cancelSubscription,
  getUsageSnapshot,
  getEffectiveEntitlements
} = require("../services/subscriptionService");

/** Explicit opt-in for local testing with PayPal's simulator; never honoured in production. */
const SKIP_VERIFY = !env.isProduction && process.env.PAYPAL_WEBHOOK_SKIP_VERIFY === "true";
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

function checkoutUrls(packageId) {
  const base = env.frontendUrl.replace(/\/$/, "");
  return {
    success: `${base}/checkout/success?packageId=${packageId}`,
    cancel: `${base}/checkout/cancel?packageId=${packageId}`
  };
}

function parseCustomId(raw) {
  if (!raw) return {};
  try {
    const j = JSON.parse(raw);
    return { userId: Number(j.userId) || null, packageId: Number(j.packageId) || null };
  } catch {
    return {};
  }
}

async function createPayPalSubscription(req, res) {
  const packageId = Number(req.body.packageId);
  if (!Number.isInteger(packageId) || packageId < 1) {
    return res.status(400).json({ message: "Invalid package id" });
  }
  const pkg = await db.CreditPackage.findByPk(packageId);
  if (!pkg || !pkg.isActive) return res.status(404).json({ message: "Package not found" });
  if (pkg.isFree || Number(pkg.priceUsd) <= 0) {
    return res.status(400).json({ message: "This plan is free — no payment needed." });
  }
  if (!paypal.isConfigured()) {
    return res.status(503).json({ message: "Online payments are not available yet. Please try again later." });
  }

  const current = await getActiveSubscription(req.user.id);
  if (isPaidSubscription(current) && current.packageId === pkg.id && !current.cancelAtPeriodEnd) {
    return res.status(409).json({ code: "ALREADY_SUBSCRIBED", message: `You are already on the ${pkg.name} plan.` });
  }

  if (!pkg.paypalPlanId) {
    const sync = await paypal.syncPlanForPackage(pkg);
    if (!sync.ok || !sync.paypalPlanId) {
      return res.status(400).json({ message: sync.message || "This plan is not available for checkout yet." });
    }
    await pkg.reload();
  }

  const result = await paypal.createSubscriptionApproval({
    packageRow: pkg,
    userId: req.user.id,
    returnUrls: checkoutUrls(pkg.id)
  });
  if (!result.approvalUrl || !result.paypalSubscriptionId) {
    return res.status(502).json({ message: "Could not create PayPal approval link" });
  }
  await createPendingSubscription({
    userId: req.user.id,
    packageId: pkg.id,
    paypalSubscriptionId: result.paypalSubscriptionId
  });
  return res.json({ approvalUrl: result.approvalUrl, paypalSubscriptionId: result.paypalSubscriptionId });
}

function serializeSubscription(sub) {
  if (!sub) return null;
  return {
    id: sub.id,
    status: sub.status,
    packageId: sub.packageId,
    packageName: sub.package?.name,
    paypalSubscriptionId: sub.paypalSubscriptionId,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    isPaid: isPaidSubscription(sub)
  };
}

async function getMySubscription(req, res) {
  const [sub, effective, usage] = await Promise.all([
    getActiveSubscription(req.user.id),
    getEffectiveEntitlements(req.user.id),
    getUsageSnapshot(req.user.id)
  ]);
  return res.json({
    subscription: serializeSubscription(sub),
    package: effective.package,
    usage,
    paypalConfigured: paypal.isConfigured()
  });
}

async function cancelMySubscription(req, res) {
  const sub = await getActiveSubscription(req.user.id);
  if (!sub) return res.status(404).json({ message: "No active subscription" });
  if (!isPaidSubscription(sub)) {
    return res.status(400).json({ message: "You are on the free plan — there is nothing to cancel." });
  }
  await paypal.cancelPayPalSubscription(sub.paypalSubscriptionId);
  const updated = await cancelSubscription(req.user.id);
  const end = updated.currentPeriodEnd ? new Date(updated.currentPeriodEnd) : null;
  return res.json({
    message:
      end && end > new Date()
        ? `Subscription cancelled. Your plan stays active until ${end.toDateString()}.`
        : "Subscription cancelled.",
    subscription: serializeSubscription(await getActiveSubscription(req.user.id))
  });
}

/** Activates a PayPal subscription from PayPal's own record (server-side source of truth). */
async function syncFromPayPalRecord(ppSub, { expectedUserId } = {}) {
  const custom = parseCustomId(ppSub.custom_id);
  const local = await db.UserSubscription.findOne({ where: { paypalSubscriptionId: ppSub.id } });
  const userId = local?.userId || custom.userId;
  const packageId = custom.packageId || local?.packageId;
  if (!userId || !packageId) throw new Error(`Cannot match PayPal subscription ${ppSub.id} to a user`);
  if (expectedUserId && userId !== expectedUserId) {
    const err = new Error("This subscription belongs to another account");
    err.status = 403;
    throw err;
  }
  const status = String(ppSub.status || "").toUpperCase();
  if (status === "ACTIVE") {
    const { supersededPaypalIds } = await activateFromPayPal({
      userId,
      packageId,
      paypalSubscriptionId: ppSub.id,
      paypalPayerId: ppSub.subscriber?.payer_id,
      currentPeriodStart: ppSub.start_time ? new Date(ppSub.start_time) : new Date(),
      currentPeriodEnd: ppSub.billing_info?.next_billing_time ? new Date(ppSub.billing_info.next_billing_time) : null
    });
    for (const oldId of supersededPaypalIds) {
      await paypal.cancelPayPalSubscription(oldId, "Replaced by a new plan").catch(() => undefined);
    }
  } else if (status === "SUSPENDED") {
    await setSubscriptionStatus(ppSub.id, "suspended");
  } else if (status === "CANCELLED" || status === "EXPIRED") {
    await markSubscriptionEnded(ppSub.id, status === "EXPIRED" ? "expired" : "cancelled");
  }
  return { userId, packageId, status };
}

/**
 * GET /payments/subscription/confirm?subscriptionId=...
 * Called by the checkout success page. Confirms with PayPal directly, so the plan activates
 * (and the first payment is credited) even if the webhook is slow or misconfigured.
 */
async function confirmMySubscription(req, res) {
  const subscriptionId = String(req.query.subscriptionId || "").trim();
  if (!/^[A-Za-z0-9-]{6,64}$/.test(subscriptionId)) {
    return res.status(400).json({ message: "Invalid subscription id" });
  }
  if (!paypal.isConfigured()) return res.status(503).json({ message: "PayPal is not configured" });

  const ppSub = await paypal.getSubscription(subscriptionId);
  const result = await syncFromPayPalRecord(ppSub, { expectedUserId: req.user.id });
  let creditsGranted = 0;
  if (result.status === "ACTIVE") {
    const txns = await paypal.listSubscriptionTransactions(subscriptionId).catch(() => []);
    for (const t of txns) {
      if (String(t.status || "").toUpperCase() !== "COMPLETED") continue;
      const out = await grantForSale({
        saleId: t.id,
        paypalSubscriptionId: subscriptionId,
        amountUsd: t.amount_with_breakdown?.gross_amount?.value,
        currency: t.amount_with_breakdown?.gross_amount?.currency_code
      });
      creditsGranted += out.granted || 0;
    }
  }
  const sub = await getActiveSubscription(req.user.id);
  return res.json({
    paypalStatus: result.status,
    active: Boolean(sub && sub.paypalSubscriptionId === subscriptionId),
    creditsGranted,
    subscription: serializeSubscription(sub)
  });
}

async function handlePayPalWebhook(req, res) {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : "";
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).send("Invalid JSON");
  }
  const eventId = String(event?.id || "");
  const eventType = String(event?.event_type || "");
  if (!eventId) return res.status(400).send("Missing event id");

  const verified = SKIP_VERIFY || (await paypal.verifyWebhook(req.headers, rawBody));
  if (!verified) return res.status(401).send("Invalid signature");

  const [row] = await db.PaymentEvent.findOrCreate({
    where: { eventId },
    defaults: { eventId, eventType, payload: rawBody.slice(0, 60000), resourceId: event.resource?.id || null }
  });
  if (row.processedAt) return res.status(200).send("OK");

  // Atomic claim: only one delivery processes an event at a time.
  const [claimed] = await db.PaymentEvent.update(
    { processingAt: new Date() },
    {
      where: {
        id: row.id,
        processedAt: null,
        [Op.or]: [{ processingAt: null }, { processingAt: { [Op.lt]: new Date(Date.now() - CLAIM_TIMEOUT_MS) } }]
      }
    }
  );
  if (!claimed) return res.status(200).send("OK");

  try {
    await processPayPalEvent(event);
    await row.update({ processedAt: new Date(), processingAt: null, error: null });
    return res.status(200).send("OK");
  } catch (err) {
    await row.update({ processingAt: null, error: String(err?.message || err).slice(0, 2000) });
    // eslint-disable-next-line no-console
    console.error("PayPal webhook processing failed:", eventType, err?.message || err);
    return res.status(500).send("Processing failed"); // PayPal retries
  }
}

async function processPayPalEvent(event) {
  const type = event.event_type;
  const resource = event.resource || {};

  switch (type) {
    case "BILLING.SUBSCRIPTION.ACTIVATED":
    case "BILLING.SUBSCRIPTION.RE-ACTIVATED":
    case "BILLING.SUBSCRIPTION.UPDATED":
      if (resource.id) await syncFromPayPalRecord(resource);
      return;
    case "BILLING.SUBSCRIPTION.SUSPENDED":
      if (resource.id) await setSubscriptionStatus(resource.id, "suspended");
      return;
    case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
      if (resource.id) await setSubscriptionStatus(resource.id, "past_due");
      return;
    case "BILLING.SUBSCRIPTION.CANCELLED":
      if (resource.id) await markSubscriptionEnded(resource.id, "cancelled");
      return;
    case "BILLING.SUBSCRIPTION.EXPIRED":
      if (resource.id) await markSubscriptionEnded(resource.id, "expired");
      return;
    case "PAYMENT.SALE.COMPLETED": {
      const subId = resource.billing_agreement_id;
      if (!subId) return; // not a subscription payment
      let local = await db.UserSubscription.findOne({ where: { paypalSubscriptionId: subId } });
      if (!local || local.status !== "active") {
        // Sale arrived before ACTIVATED (PayPal does not guarantee order): ask PayPal directly.
        await syncFromPayPalRecord(await paypal.getSubscription(subId));
        local = await db.UserSubscription.findOne({ where: { paypalSubscriptionId: subId } });
      }
      if (!local) throw new Error(`No local subscription for ${subId} yet`);
      const out = await grantForSale({
        saleId: resource.id,
        paypalSubscriptionId: subId,
        amountUsd: resource.amount?.total,
        currency: resource.amount?.currency
      });
      if (out.skipped) {
        // eslint-disable-next-line no-console
        console.warn(`PayPal sale ${resource.id} not credited: ${out.skipped}`);
      }
      return;
    }
    case "PAYMENT.SALE.REFUNDED":
    case "PAYMENT.SALE.REVERSED":
      await clawBackSale({
        saleId: resource.sale_id || resource.parent_payment || resource.id,
        refundAmountUsd: resource.amount?.total
      });
      return;
    default:
  }
}

module.exports = {
  createPayPalSubscription,
  getMySubscription,
  cancelMySubscription,
  confirmMySubscription,
  handlePayPalWebhook
};
