const { parseEntitlements, priceUsdFromLabel } = require("./packageEntitlements");

function parseFeatures(raw) {
  if (Array.isArray(raw)) return raw.map((line) => String(line).trim()).filter(Boolean);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map((line) => String(line).trim()).filter(Boolean) : [];
  } catch {
    return String(raw)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
}

function defaultPriceLabel(priceUsd, priceLkr) {
  const usd = Number(priceUsd);
  if (Number.isFinite(usd) && usd > 0) {
    return `$${Number.isInteger(usd) ? usd : usd.toFixed(2).replace(/\.00$/, "")}`;
  }
  const n = Number(priceLkr);
  if (!Number.isFinite(n) || n <= 0) return "Free";
  return `$${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.00$/, "")}`;
}

function serializeCreditPackage(pkg, { includeEntitlements = true } = {}) {
  const j = pkg?.toJSON ? pkg.toJSON() : pkg;
  const priceLkr = Number(j.priceLkr ?? 0);
  const isFree = Boolean(j.isFree) || priceUsdFromLabel(j.priceLabel, priceLkr) <= 0;
  const priceUsd = Number.isFinite(Number(j.priceUsd))
    ? Number(j.priceUsd)
    : priceUsdFromLabel(j.priceLabel, priceLkr);
  const entitlements = parseEntitlements(j.entitlements, { credits: j.credits, isFree });

  const out = {
    id: Number(j.id),
    name: String(j.name || "").trim(),
    tagline: String(j.tagline || "").trim(),
    priceLabel: String(j.priceLabel || "").trim() || defaultPriceLabel(priceUsd, priceLkr),
    pricePeriod: String(j.pricePeriod || "/month").trim() || "/month",
    credits: Number(j.credits || 0),
    priceLkr,
    priceUsd,
    features: parseFeatures(j.features),
    isPopular: Boolean(j.isPopular),
    isActive: Boolean(j.isActive !== false),
    sortOrder: Number.isFinite(Number(j.sortOrder)) ? Number(j.sortOrder) : 0,
    isFree,
    billingInterval: String(j.billingInterval || "MONTH"),
    paypalPlanId: j.paypalPlanId ? String(j.paypalPlanId) : null,
    requiresPayment: !isFree
  };

  if (includeEntitlements) {
    out.entitlements = entitlements;
  }

  return out;
}

function serializeCreditPackagePublic(pkg) {
  const full = serializeCreditPackage(pkg, { includeEntitlements: false });
  return {
    id: full.id,
    name: full.name,
    tagline: full.tagline,
    priceLabel: full.priceLabel,
    pricePeriod: full.pricePeriod,
    credits: full.credits,
    priceUsd: full.priceUsd,
    features: full.features,
    isPopular: full.isPopular,
    isActive: full.isActive,
    sortOrder: full.sortOrder,
    isFree: full.isFree,
    requiresPayment: full.requiresPayment
  };
}

module.exports = {
  parseFeatures,
  serializeCreditPackage,
  serializeCreditPackagePublic,
  defaultPriceLabel
};
