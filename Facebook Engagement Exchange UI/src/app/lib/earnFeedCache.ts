export type EarnFeedCache = {
  tasks: unknown[];
  myEngagements: unknown[];
  savedAt: number;
  hasTelegram: boolean | null;
  hasMtprotoSession: boolean | null;
  hasMore?: boolean;
  nextCursor?: number | null;
};

const CACHE_KEY = "et_earn_feed_v2";

export function readEarnFeedCache(): EarnFeedCache | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EarnFeedCache;
    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.myEngagements)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeEarnFeedCache(data: EarnFeedCache): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // private mode / quota
  }
}

export function isEarnFeedCacheFresh(maxAgeMs: number, cache = readEarnFeedCache()): boolean {
  if (!cache) return false;
  return Date.now() - cache.savedAt < maxAgeMs;
}
