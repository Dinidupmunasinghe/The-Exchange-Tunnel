export type PublicCreditPackage = {
  id: number;
  name: string;
  tagline: string;
  priceLabel: string;
  pricePeriod: string;
  credits: number;
  priceLkr: number;
  features: string[];
  isPopular: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

export const EMPTY_PACKAGE_DRAFT: Omit<PublicCreditPackage, "id"> = {
  name: "New plan",
  tagline: "Short description for this plan",
  priceLabel: "$9",
  pricePeriod: "/month",
  credits: 500,
  priceLkr: 9,
  features: ["Feature one", "Feature two", "Feature three"],
  isPopular: false,
  isActive: true,
  sortOrder: 0
};

/** Coerce API / legacy rows into a safe shape for the admin editor and public UI. */
export function normalizePublicPackage(raw: Partial<PublicCreditPackage> & { id?: unknown }): PublicCreditPackage {
  const priceLkr = Number(raw.priceLkr ?? 0);
  const priceLabel = String(raw.priceLabel ?? "").trim();
  let features: string[] = [];
  if (Array.isArray(raw.features)) {
    features = raw.features.map((line) => String(line).trim()).filter(Boolean);
  } else if (typeof raw.features === "string" && raw.features.trim()) {
    try {
      const parsed = JSON.parse(raw.features);
      if (Array.isArray(parsed)) {
        features = parsed.map((line) => String(line).trim()).filter(Boolean);
      }
    } catch {
      features = raw.features
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    }
  }

  return {
    id: Number(raw.id),
    name: String(raw.name ?? "").trim() || "Plan",
    tagline: String(raw.tagline ?? "").trim(),
    priceLabel: priceLabel || (priceLkr <= 0 ? "Free" : `$${priceLkr}`),
    pricePeriod: String(raw.pricePeriod ?? "/month").trim() || "/month",
    credits: Number(raw.credits ?? 0),
    priceLkr,
    features,
    isPopular: Boolean(raw.isPopular),
    isActive: raw.isActive !== false,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 0
  };
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
