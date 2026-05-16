export type CampaignOwner = {
  name?: string | null;
  email?: string | null;
  exchangeDisplayName?: string | null;
  profilePhotoUrl?: string | null;
  avatarUrl?: string | null;
};

export function ownerExchangeDisplayName(owner: CampaignOwner | undefined | null): string {
  if (!owner) return "Exchange member";
  const fromApi = String(owner.exchangeDisplayName || "").trim();
  if (fromApi) return fromApi;
  const name = String(owner.name || "").trim();
  const email = String(owner.email || "").trim();
  if (name && !name.startsWith("@")) return name;
  if (email.includes("@")) {
    const local = email.split("@")[0].replace(/[._+-]+/g, " ").trim();
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "Exchange member";
}

export function ownerAvatarUrl(owner: CampaignOwner | undefined | null, seed: string): string {
  const stored = String(owner?.profilePhotoUrl || owner?.avatarUrl || "").trim();
  if (stored) return stored;
  const label = ownerExchangeDisplayName(owner);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(label || seed || "ET")}&background=2563eb&color=ffffff&size=128&bold=true`;
}

export function ownerAvatarInitials(owner: CampaignOwner | undefined | null): string {
  const label = ownerExchangeDisplayName(owner);
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase() || "ET";
}
