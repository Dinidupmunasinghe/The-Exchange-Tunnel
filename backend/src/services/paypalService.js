const axios = require("axios");
const env = require("../config/env");

let cachedToken = null;
let tokenExpiresAt = 0;

function isConfigured() {
  return Boolean(env.paypal.clientId && env.paypal.clientSecret);
}

function apiBase() {
  return env.paypal.mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken() {
  if (!isConfigured()) throw new Error("PayPal is not configured");
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const auth = Buffer.from(`${env.paypal.clientId}:${env.paypal.clientSecret}`).toString("base64");
  const res = await axios.post(
    `${apiBase()}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );
  cachedToken = res.data.access_token;
  tokenExpiresAt = Date.now() + Number(res.data.expires_in || 3600) * 1000;
  return cachedToken;
}

async function paypalRequest(method, path, data) {
  const token = await getAccessToken();
  const res = await axios({
    method,
    url: `${apiBase()}${path}`,
    data,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  return res.data;
}

async function syncPlanForPackage(pkgRow) {
  if (!isConfigured()) {
    return { ok: false, message: "PayPal credentials not configured" };
  }
  const serialized =
    typeof pkgRow.toJSON === "function"
      ? pkgRow
      : pkgRow;
  const priceUsd = Number(serialized.priceUsd ?? 0);
  if (serialized.isFree || priceUsd <= 0) {
    return { ok: true, skipped: true, message: "Free package — no PayPal plan" };
  }

  const productName = String(serialized.name || "Plan").slice(0, 120);
  const product = await paypalRequest("POST", "/v1/catalogs/products", {
    name: productName,
    description: String(serialized.tagline || productName).slice(0, 250),
    type: "SERVICE",
    category: "SOFTWARE"
  });

  const plan = await paypalRequest("POST", "/v1/billing/plans", {
    product_id: product.id,
    name: `${productName} Monthly`,
    description: String(serialized.tagline || productName).slice(0, 250),
    billing_cycles: [
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: {
          fixed_price: { value: priceUsd.toFixed(2), currency_code: "USD" }
        }
      }
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 3
    }
  });

  serialized.paypalPlanId = plan.id;
  if (typeof pkgRow.update === "function") {
    await pkgRow.update({ paypalPlanId: plan.id });
  }

  return { ok: true, paypalPlanId: plan.id, productId: product.id };
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
  return {
    approvalUrl: link?.href,
    paypalSubscriptionId: sub.id,
    status: sub.status
  };
}

async function verifyWebhook(headers, body) {
  if (!isConfigured() || !env.paypal.webhookId) return false;
  try {
    const token = await getAccessToken();
    const res = await axios.post(
      `${apiBase()}/v1/notifications/verify-webhook-signature`,
      {
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: env.paypal.webhookId,
        webhook_event: typeof body === "string" ? JSON.parse(body) : body
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );
    return res.data?.verification_status === "SUCCESS";
  } catch {
    return env.nodeEnv !== "production";
  }
}

async function cancelPayPalSubscription(paypalSubscriptionId, reason = "User requested cancellation") {
  if (!isConfigured() || !paypalSubscriptionId) return;
  await paypalRequest("POST", `/v1/billing/subscriptions/${paypalSubscriptionId}/cancel`, {
    reason
  });
}

module.exports = {
  isConfigured,
  syncPlanForPackage,
  createSubscriptionApproval,
  verifyWebhook,
  cancelPayPalSubscription
};
