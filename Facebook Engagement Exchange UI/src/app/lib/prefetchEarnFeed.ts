import { api, getToken, withNetworkRetry } from "../services/api";
import { earnFeedCacheOwner, writeEarnFeedCache } from "./earnFeedCache";

let inflight: Promise<void> | null = null;

/** Warm earn feed + profile in the background (sidebar hover, app shell). */
export function prefetchEarnFeed(): Promise<void> {
  if (!getToken()) return Promise.resolve();
  if (inflight) return inflight;

  const owner = earnFeedCacheOwner();
  inflight = (async () => {
    try {
      const [profileRes, tasksRes] = await Promise.all([
        api.getProfile({ skipSessionRedirect: true }).catch(() => null),
        withNetworkRetry(
          () => api.getTasks({ fast: true, limit: 12, skipSessionRedirect: true }),
          { attempts: 2, baseDelayMs: 1200 }
        ).catch(() => null),
      ]);
      if (!tasksRes) return;
      const u = profileRes?.user as
        | { telegramUserId?: string | null; hasMtprotoSession?: boolean }
        | undefined;
      writeEarnFeedCache({
        tasks: Array.isArray(tasksRes?.tasks) ? tasksRes.tasks : [],
        myEngagements: Array.isArray(tasksRes?.myEngagements) ? tasksRes.myEngagements : [],
        savedAt: Date.now(),
        hasTelegram: u ? Boolean(u.telegramUserId) : null,
        hasMtprotoSession: u ? Boolean(u.hasMtprotoSession) : null,
        hasMore: Boolean(tasksRes?.hasMore),
        nextCursor: typeof tasksRes?.nextCursor === "number" ? tasksRes.nextCursor : null,
      }, owner);
    } catch {
      // ignore — page will retry on open
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
