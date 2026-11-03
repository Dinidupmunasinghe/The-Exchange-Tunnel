export type PackageEntitlements = {
  freeCreditCap: number | null;
  monthlyCreditGrant: number;
  monthlyExchangeLimit: number;
  dailyEarnLimitOverride: number | null;
  maxActiveCampaigns: number;
  flags: {
    apiAccess: boolean;
    prioritySupport: boolean;
    customTargeting: boolean;
    removeWatermark: boolean;
  };
};

export type PublicCreditPackage = {
  id: number;
  name: string;
  tagline: string;
  priceLabel: string;
  pricePeriod: string;
  credits: number;
  priceLkr: number;
  priceUsd: number;
  features: string[];
  isPopular: boolean;
  isActive?: boolean;
  sortOrder?: number;
  isFree?: boolean;
  requiresPayment?: boolean;
  billingInterval?: string;
  paypalPlanId?: string | null;
  entitlements?: PackageEntitlements;
};

export const DEFAULT_ENTITLEMENTS: PackageEntitlements = {
  freeCreditCap: null,
  monthlyCreditGrant: 500,
  monthlyExchangeLimit: 500,
  dailyEarnLimitOverride: null,
  maxActiveCampaigns: 5,
  flags: {
    apiAccess: false,
    prioritySupport: false,
    customTargeting: false,
    removeWatermark: false
  }
};

export const FREE_ENTITLEMENTS: PackageEntitlements = {
  freeCreditCap: 50,
  monthlyCreditGrant: 0,
  monthlyExchangeLimit: 50,
  dailyEarnLimitOverride: null,
  maxActiveCampaigns: 1,
  flags: {
    apiAccess: false,
    prioritySupport: false,
    customTargeting: false,
    removeWatermark: false
  }
};

export const EMPTY_PACKAGE_DRAFT: Omit<PublicCreditPackage, "id"> = {
  name: "New plan",
  tagline: "Short description for this plan",
  priceLabel: "$9",
  pricePeriod: "/month",
  credits: 500,
  priceLkr: 0,
  priceUsd: 9,
  features: ["Feature one", "Feature two", "Feature three"],
  isPopular: false,
  isActive: true,
  sortOrder: 0,
  isFree: false,
  entitlements: { ...DEFAULT_ENTITLEMENTS }
};

export function normalizeEntitlements(raw?: Partial<PackageEntitlements> | null, isFree = false): PackageEntitlements {
  const base = isFree ? { ...FREE_ENTITLEMENTS } : { ...DEFAULT_ENTITLEMENTS, monthlyCreditGrant: 500 };
  if (!raw) return base;
  return {
    freeCreditCap: raw.freeCreditCap === undefined ? base.freeCreditCap : raw.freeCreditCap,
    monthlyCreditGrant: Number.isFinite(Number(raw.monthlyCreditGrant))
      ? Number(raw.monthlyCreditGrant)
      : base.monthlyCreditGrant,
    monthlyExchangeLimit: Number.isFinite(Number(raw.monthlyExchangeLimit))
      ? Number(raw.monthlyExchangeLimit)
      : base.monthlyExchangeLimit,
    dailyEarnLimitOverride:
      raw.dailyEarnLimitOverride === undefined || raw.dailyEarnLimitOverride === null
        ? base.dailyEarnLimitOverride
        : Number(raw.dailyEarnLimitOverride),
    maxActiveCampaigns: Number.isFinite(Number(raw.maxActiveCampaigns))
      ? Number(raw.maxActiveCampaigns)
      : base.maxActiveCampaigns,
    flags: { ...base.flags, ...(raw.flags || {}) }
  };
}

/** Coerce API / legacy rows into a safe shape for the admin editor and public UI. */
export function normalizePublicPackage(raw: Partial<PublicCreditPackage> & { id?: unknown }): PublicCreditPackage {
  const priceLkr = Number(raw.priceLkr ?? 0);
  const priceLabel = String(raw.priceLabel ?? "").trim();
  // priceUsd is the billing price; the label is display text and never decides "free".
  const priceUsd =
    raw.priceUsd != null && (raw.priceUsd as unknown) !== "" && Number.isFinite(Number(raw.priceUsd))
      ? Number(raw.priceUsd)
      : priceUsdFromDisplayLabel(priceLabel);
  const isFree = raw.isFree === true || !(priceUsd > 0);
  const rawFeatures: unknown = raw.features;
  let features: string[] = [];
  if (Array.isArray(rawFeatures)) {
    features = rawFeatures.map((line) => String(line).trim()).filter(Boolean);
  } else if (typeof rawFeatures === "string" && rawFeatures.trim()) {
    try {
      const parsed = JSON.parse(rawFeatures);
      if (Array.isArray(parsed)) {
        features = parsed.map((line: unknown) => String(line).trim()).filter(Boolean);
      }
    } catch {
      features = rawFeatures
        .split("\n")
        .map((line: string) => line.trim())
        .filter(Boolean);
    }
  }

  return {
    id: Number(raw.id),
    name: String(raw.name ?? "").trim() || "Plan",
    tagline: String(raw.tagline ?? "").trim(),
    priceLabel: priceLabel || (priceUsd <= 0 ? "Free" : `$${priceUsd}`),
    pricePeriod: String(raw.pricePeriod ?? "/month").trim() || "/month",
    credits: Number(raw.credits ?? 0),
    priceLkr,
    priceUsd,
    features,
    isPopular: Boolean(raw.isPopular),
    isActive: raw.isActive !== false,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 0,
    isFree,
    requiresPayment: !isFree,
    billingInterval: String(raw.billingInterval || "MONTH"),
    paypalPlanId: raw.paypalPlanId ? String(raw.paypalPlanId) : null,
    entitlements: normalizeEntitlements(raw.entitlements, isFree)
  };
}

export function priceUsdFromDisplayLabel(label: string): number {
  const s = String(label ?? "").trim().toLowerCase();
  if (!s || s === "free") return 0;
  const match = String(label).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

/** Legacy LKR field — derived from display price when not set explicitly. */
export function priceLkrFromDisplayLabel(label: string): number {
  return priceUsdFromDisplayLabel(label);
}

export function normalizeFeatures(features: string[] | undefined | null): string[] {
  if (!Array.isArray(features)) return [];
  return features.map((f) => String(f).trim()).filter(Boolean);
}

export function featuresToText(features: string[]): string {
  return (features || []).join("\n");
}

export function textToFeatures(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
