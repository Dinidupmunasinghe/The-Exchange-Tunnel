const PROFILE_CACHE_KEY = "exchange_profile_cache_v1";

export type CachedProfile = {
  name?: string;
  email?: string;
  credits?: number;
  savedAt: number;
};

export function readProfileCache(): CachedProfile | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProfile;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeProfileCache(profile: Omit<CachedProfile, "savedAt">) {
  try {
    sessionStorage.setItem(
      PROFILE_CACHE_KEY,
      JSON.stringify({ ...profile, savedAt: Date.now() } satisfies CachedProfile)
    );
  } catch {
    // quota / private mode
  }
}

export function clearProfileCache() {
  try {
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // ignore
  }
}
