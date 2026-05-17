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

function defaultPriceLabel(priceLkr) {
  const n = Number(priceLkr);
  if (!Number.isFinite(n) || n <= 0) return "Free";
  return `$${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.00$/, "")}`;
}

function serializeCreditPackage(pkg) {
  const j = pkg?.toJSON ? pkg.toJSON() : pkg;
  const priceLkr = Number(j.priceLkr ?? 0);
  return {
    id: Number(j.id),
    name: String(j.name || "").trim(),
    tagline: String(j.tagline || "").trim(),
    priceLabel: String(j.priceLabel || "").trim() || defaultPriceLabel(priceLkr),
    pricePeriod: String(j.pricePeriod || "/month").trim() || "/month",
    credits: Number(j.credits || 0),
    priceLkr,
    features: parseFeatures(j.features),
    isPopular: Boolean(j.isPopular),
    isActive: Boolean(j.isActive !== false),
    sortOrder: Number.isFinite(Number(j.sortOrder)) ? Number(j.sortOrder) : 0
  };
}

module.exports = { parseFeatures, serializeCreditPackage, defaultPriceLabel };
