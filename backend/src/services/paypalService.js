const axios = require("axios");
const env = require("../config/env");
const db = require("../models");

let cachedToken = null;
let tokenExpiresAt = 0;

const PRODUCT_SETTING_KEY = () => `paypalProductId:${env.paypal.mode}`;
const INTERVALS = new Set(["DAY", "WEEK", "MONTH", "YEAR"]);

function isConfigured() {
  return Boolean(env.paypal.clientId && env.paypal.clientSecret);
}

function apiBase() {
  return env.paypal.mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

/** Turns axios/PayPal failures into readable errors (status 502 = upstream problem). */
function toPayPalError(err, fallback) {
  const data = err?.response?.data;
  const detail =
    data?.details?.[0]?.description || data?.message || data?.error_description || err?.message || "";
  const e = new Error(`${fallback}${detail ? `: ${detail}` : ""}`);
  e.status = 502;
  e.expose = true;
  e.paypalStatus = err?.response?.status || null;
  e.paypalName = data?.name || null;
  return e;
}

async function getAccessToken(force = false) {
  if (!isConfigured()) throw new Error("PayPal is not configured");
  if (!force && cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  const auth = Buffer.from(`${env.paypal.clientId}:${env.paypal.clientSecret}`).toString("base64");
  try {
    const res = await axios.post(`${apiBase()}/v1/oauth2/token`, "grant_type=client_credentials", {
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15000
    });
    cachedToken = res.data.access_token;
    tokenExpiresAt = Date.now() + Number(res.data.expires_in || 3600) * 1000;
    return cachedToken;
  } catch (err) {
    throw toPayPalError(err, "PayPal authentication failed");
  }
}

async function paypalRequest(method, path, data, { retried = false } = {}) {
  const token = await getAccessToken(retried);
  try {
    const res = await axios({
      method,
      url: `${apiBase()}${path}`,
      data,
      timeout: 20000,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    });
    return res.data;
  } catch (err) {
    if (err?.response?.status === 401 && !retried) {
      return paypalRequest(method, path, data, { retried: true });
    }
    throw toPayPalError(err, `PayPal ${method} ${path.split("?")[0]} failed`);
  }
}

/** One catalog product per environment, reused by every plan. */
async function ensureProductId() {
  const key = PRODUCT_SETTING_KEY();
  const row = await db.AppSetting.findOne({ where: { key } });
  if (row?.value) return row.value;
  const product = await paypalRequest("POST", "/v1/catalogs/products", {
    name: "Exchange Tunnel",
    description: "Exchange Tunnel credit plans",
    type: "SERVICE",
    category: "SOFTWARE"
  });
  await db.AppSetting.upsert({ key, value: String(product.id) });
  return product.id;
}

async function deactivatePlan(planId) {
  if (!planId) return;
  try {
    await paypalRequest("POST", `/v1/billing/plans/${planId}/deactivate`);
  } catch {
    // already inactive or not found: nothing to do
  }
}

/**
 * Creates a PayPal billing plan for the package's current price/interval and stores its id.
 * PayPal plan prices are effectively immutable for our use, so a price change = new plan;
 * the previous plan is deactivated (existing subscribers keep their old plan).
 */
async function syncPlanForPackage(pkgRow) {
  if (!isConfigured()) return { ok: false, message: "PayPal credentials not configured" };
  const priceUsd = Number(pkgRow.priceUsd ?? 0);
  if (pkgRow.isFree || priceUsd <= 0) {
    return { ok: true, skipped: true, message: "Free package — no PayPal plan" };
  }
  const interval = INTERVALS.has(String(pkgRow.billingInterval || "").toUpperCase())
    ? String(pkgRow.billingInterval).toUpperCase()
    : "MONTH";
  const name = String(pkgRow.name || "Plan").slice(0, 100);
  const productId = await ensureProductId();
  const plan = await paypalRequest("POST", "/v1/billing/plans", {
    product_id: productId,
    name: `${name} (${interval.toLowerCase()}ly)`.slice(0, 127),
    description: String(pkgRow.tagline || name).slice(0, 127),
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: interval, interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: priceUsd.toFixed(2), currency_code: "USD" } }
      }
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 3
    }
  });
  const previous = pkgRow.paypalPlanId;
  if (typeof pkgRow.update === "function") await pkgRow.update({ paypalPlanId: plan.id });
  if (previous && previous !== plan.id) await deactivatePlan(previous);
  return { ok: true, paypalPlanId: plan.id, productId };
}

async function createSubscriptionApproval({ packageRow, userId, returnUrls }) {
  if (!isConfigured()) throw new Error("PayPal is not configured");
  const planId = packageRow.paypalPlanId;
  if (!planId) throw new Error("Package is not synced to PayPal. Ask admin to sync the plan.");
  const sub = await paypalRequest("POST", "/v1/billing/subscriptions", {
    plan_id: planId,
    custom_id: JSON.stringify({ userId, packageId: packageRow.id }),
    application_context: {
      brand_name: "Exchange Tunnel",
      locale: "en-US",
      shipping_preference: "NO_SHIPPING",
      user_action: "SUBSCRIBE_NOW",
      return_url: returnUrls.success,
      cancel_url: returnUrls.cancel
    }
  });
  const link = (sub.links || []).find((l) => l.rel === "approve");
  return { approvalUrl: link?.href, paypalSubscriptionId: sub.id, status: sub.status };
}

async function getSubscription(paypalSubscriptionId) {
  return paypalRequest("GET", `/v1/billing/subscriptions/${encodeURIComponent(paypalSubscriptionId)}`);
}

/** Completed payments of a subscription in the last `days` days. */
async function listSubscriptionTransactions(paypalSubscriptionId, days = 3) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const data = await paypalRequest(
    "GET",
    `/v1/billing/subscriptions/${encodeURIComponent(paypalSubscriptionId)}/transactions?start_time=${start.toISOString()}&end_time=${end.toISOString()}`
  );
  return Array.isArray(data?.transactions) ? data.transactions : [];
}

/**
 * Verifies a webhook with PayPal. `rawBody` must be the exact bytes PayPal sent, spliced
 * into the request unchanged (re-serialising the parsed JSON can break the signature).
 * Only an explicit SUCCESS counts; any error => false.
 */
async function verifyWebhook(headers, rawBody) {
  if (!isConfigured() || !env.paypal.webhookId || !rawBody) return false;
  try {
    const token = await getAccessToken();
    const meta = {
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: env.paypal.webhookId
    };
    const body = `${JSON.stringify(meta).slice(0, -1)},"webhook_event":${rawBody}}`;
    const res = await axios.post(`${apiBase()}/v1/notifications/verify-webhook-signature`, body, {
      timeout: 15000,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    });
    return res.data?.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}

/** Cancels at PayPal. Already-cancelled/expired subscriptions are treated as success. */
async function cancelPayPalSubscription(paypalSubscriptionId, reason = "User requested cancellation") {
  if (!isConfigured() || !paypalSubscriptionId) return;
  try {
    await paypalRequest("POST", `/v1/billing/subscriptions/${encodeURIComponent(paypalSubscriptionId)}/cancel`, {
      reason
    });
  } catch (err) {
    if (err.paypalStatus === 422 || err.paypalStatus === 404) return; // not cancellable any more
    throw err;
  }
}

module.exports = {
  isConfigured,
  syncPlanForPackage,
  createSubscriptionApproval,
  getSubscription,
  listSubscriptionTransactions,
  verifyWebhook,
  cancelPayPalSubscription
};
