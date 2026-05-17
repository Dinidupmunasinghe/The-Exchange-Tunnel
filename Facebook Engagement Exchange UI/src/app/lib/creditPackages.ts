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

export function featuresToText(features: string[]): string {
  return (features || []).join("\n");
}

export function textToFeatures(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
