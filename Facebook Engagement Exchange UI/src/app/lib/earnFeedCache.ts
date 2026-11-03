export type EarnFeedCache = {
  tasks: unknown[];
  myEngagements: unknown[];
  savedAt: number;
  hasTelegram: boolean | null;
  hasMtprotoSession: boolean | null;
  hasMore?: boolean;
  nextCursor?: number | null;
  /** Which session wrote this cache — never show one user's feed to another. */
  owner?: string;
};

const CACHE_KEY = "et_earn_feed_v3";
const TOKEN_KEY = "exchange_token";

/** Short, non-reversible tag of the current session token. */
function currentOwner(): string {
  try {
    const t = localStorage.getItem(TOKEN_KEY) || "";
    let h = 0;
    for (let i = 0; i < t.length; i += 1) h = (h * 31 + t.charCodeAt(i)) | 0;
    return t ? `o${(h >>> 0).toString(36)}` : "";
  } catch {
    return "";
  }
}

export function readEarnFeedCache(): EarnFeedCache | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EarnFeedCache;
    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.myEngagements)) {
      return null;
    }
    const owner = currentOwner();
    if (!owner || parsed.owner !== owner) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeEarnFeedCache(data: EarnFeedCache, expectedOwner?: string): void {
  try {
    const owner = currentOwner();
    // A background prefetch that finishes after logout/login must not write a stale feed.
    if (!owner || (expectedOwner && expectedOwner !== owner)) return;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, owner }));
  } catch {
    // private mode / quota
  }
}

export function clearEarnFeedCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem("et_earn_feed_v2");
  } catch {
    // ignore
  }
}

export function earnFeedCacheOwner(): string {
  return currentOwner();
}

export function isEarnFeedCacheFresh(maxAgeMs: number, cache = readEarnFeedCache()): boolean {
  if (!cache) return false;
  return Date.now() - cache.savedAt < maxAgeMs;
}
