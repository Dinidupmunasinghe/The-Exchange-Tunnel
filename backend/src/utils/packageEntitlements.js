const DEFAULT_FLAGS = {
  apiAccess: false,
  prioritySupport: false,
  customTargeting: false,
  removeWatermark: false
};

function defaultEntitlementsForPackage({ credits = 0, isFree = false } = {}) {
  const c = Number(credits) || 0;
  if (isFree) {
    return {
      freeCreditCap: 50,
      monthlyCreditGrant: 0,
      monthlyExchangeLimit: 50,
      dailyEarnLimitOverride: null,
      maxActiveCampaigns: 1,
      flags: { ...DEFAULT_FLAGS }
    };
  }
  return {
    freeCreditCap: null,
    monthlyCreditGrant: c,
    monthlyExchangeLimit: c,
    dailyEarnLimitOverride: null,
    maxActiveCampaigns: 5,
    flags: { ...DEFAULT_FLAGS }
  };
}

function parseEntitlements(raw, fallback = {}) {
  let obj = raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = {};
    }
  }
  if (!obj || typeof obj !== "object") obj = {};
  const base = defaultEntitlementsForPackage(fallback);
  const flagsIn = obj.flags && typeof obj.flags === "object" ? obj.flags : {};
  return {
    freeCreditCap:
      obj.freeCreditCap === null || obj.freeCreditCap === undefined
        ? base.freeCreditCap
        : Number(obj.freeCreditCap),
    monthlyCreditGrant: Number.isFinite(Number(obj.monthlyCreditGrant))
      ? Number(obj.monthlyCreditGrant)
      : base.monthlyCreditGrant,
    monthlyExchangeLimit: Number.isFinite(Number(obj.monthlyExchangeLimit))
      ? Number(obj.monthlyExchangeLimit)
      : base.monthlyExchangeLimit,
    dailyEarnLimitOverride:
      obj.dailyEarnLimitOverride === null || obj.dailyEarnLimitOverride === ""
        ? null
        : Number.isFinite(Number(obj.dailyEarnLimitOverride))
          ? Number(obj.dailyEarnLimitOverride)
          : null,
    maxActiveCampaigns: Number.isFinite(Number(obj.maxActiveCampaigns))
      ? Number(obj.maxActiveCampaigns)
      : base.maxActiveCampaigns,
    flags: { ...DEFAULT_FLAGS, ...base.flags, ...flagsIn }
  };
}

function serializeEntitlements(entitlements) {
  return JSON.stringify(parseEntitlements(entitlements));
}

function priceUsdFromLabel(label, fallback = 0) {
  const s = String(label ?? "").trim().toLowerCase();
  if (!s || s === "free") return 0;
  const match = String(label).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : Number(fallback) || 0;
}

module.exports = {
  DEFAULT_FLAGS,
  defaultEntitlementsForPackage,
  parseEntitlements,
  serializeEntitlements,
  priceUsdFromLabel
};
