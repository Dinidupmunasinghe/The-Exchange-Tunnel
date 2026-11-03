import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ThumbsUp, MessageCircle, ExternalLink, Coins, RefreshCw, BellPlus, Loader2, SendHorizontal, Trash2, Repeat2 } from "lucide-react";
import { TelegramMessageMedia } from "../components/TelegramMessageMedia";
import { formatDistanceToNow } from "date-fns";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { api } from "../services/api";
import {
  bundleAllowsAction,
  getEngagementLabel
} from "../lib/engagement";
import { isEarnFeedCacheFresh, readEarnFeedCache, writeEarnFeedCache } from "../lib/earnFeedCache";
import {
  campaignDisplayTitle,
  ownerAvatarInitials,
  ownerAvatarUrl,
  ownerExchangeDisplayName,
  type CampaignOwner
} from "../lib/ownerProfile";
import { withNetworkRetry } from "../services/api";
import { Callout, EmptyState, ListSkeleton, PageHeader } from "../components/kit";
import { FinishSetupDialog } from "../components/setup/FinishSetupDialog";
import { useSetupStatus, setupHref, type SetupStepId } from "../lib/setupStatus";
import { friendlyError } from "../lib/friendlyErrors";
import { Sparkles } from "lucide-react";

type TaskRow = {
  id: number;
  engagementType: string;
  rewardCredits: number;
  status?: string;
  assignedUserId?: number | null;
  createdAt?: string;
  campaign?: {
    id: number;
    name?: string;
    messageUrl?: string;
    soundcloudPostUrl: string;
    createdAt?: string;
    owner?: CampaignOwner & {
      id?: number;
      telegramUserId?: string | null;
    };
  };
  campaignId?: number;
};

type MyEngagementRow = {
  id: number;
  campaignId: number;
  taskId: number;
  actionKind: string;
  verificationDetails?: string | null;
  metaEngagementId?: string | null;
  source?: "memory" | "telegram" | string;
  preExisting?: boolean;
  earned?: boolean;
};
const REACTION_CHOICES = ["👍", "🔥", "❤️", "👏", "🤩", "🎉"];

function relativeCampaignTime(iso: string | undefined): string {
  if (!iso) return "Recently added";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "Recently added";
  }
}

function getEngagement(rows: MyEngagementRow[], campaignId: number, kind: string): MyEngagementRow | undefined {
  return rows.find((e) => e.campaignId === campaignId && e.actionKind === kind);
}

function hasEngagement(rows: MyEngagementRow[], campaignId: number, kind: string): boolean {
  return Boolean(getEngagement(rows, campaignId, kind));
}

function isEngagementEarned(
  rows: MyEngagementRow[],
  campaignId: number,
  kind: string,
  campaignTasks: TaskRow[]
): boolean {
  if (kind === "subscribe" && hasCompletedTask(campaignTasks)) return true;
  return Boolean(getEngagement(rows, campaignId, kind)?.earned);
}

function getCommentText(rows: MyEngagementRow[], campaignId: number): string {
  const row = rows.find((e) => e.campaignId === campaignId && e.actionKind === "comment");
  const details = String(row?.verificationDetails || "");
  const marker = "Telegram: mtproto comment sent :: ";
  if (details.startsWith(marker)) return details.slice(marker.length).trim();
  return "";
}

function firstOpenTask(tasks: TaskRow[]): TaskRow | undefined {
  const sorted = [...tasks].sort((a, b) => a.id - b.id);
  return sorted.find((t) => t.status === "open" || t.status === "assigned");
}

function hasCompletedTask(tasks: TaskRow[]): boolean {
  return tasks.some((t) => t.status === "completed");
}

function withoutEngagement(
  rows: MyEngagementRow[],
  campaignId: number,
  actionKind: string
): MyEngagementRow[] {
  return rows.filter((e) => !(e.campaignId === campaignId && e.actionKind === actionKind));
}

const EARN_FEED_POLL_MS = 60_000;
const EARN_CACHE_STALE_MS = 60_000;
const EARN_PAGE_SIZE = 12;

function mergeTasksById(current: TaskRow[], incoming: TaskRow[]): TaskRow[] {
  const map = new Map<number, TaskRow>();
  for (const task of current) map.set(task.id, task);
  for (const task of incoming) map.set(task.id, task);
  return [...map.values()].sort((a, b) => b.id - a.id);
}

function mergeEngagements(current: MyEngagementRow[], incoming: MyEngagementRow[]): MyEngagementRow[] {
  const map = new Map<string, MyEngagementRow>();
  for (const row of current) map.set(`${row.campaignId}:${row.actionKind}:${row.id}`, row);
  for (const row of incoming) map.set(`${row.campaignId}:${row.actionKind}:${row.id}`, row);
  return [...map.values()];
}

/** Keep owner labels/avatars when a refresh returns tasks without nested owner (stale cache). */
function mergeTasksPreserveOwner(current: TaskRow[], incoming: TaskRow[]): TaskRow[] {
  const ownerByCampaignId = new Map<number, CampaignOwner>();
  for (const t of current) {
    const cid = t.campaign?.id;
    if (cid && t.campaign?.owner) ownerByCampaignId.set(cid, t.campaign.owner);
  }
  return incoming.map((t) => {
    if (t.campaign?.owner) return t;
    const cid = t.campaign?.id;
    const prevOwner = cid ? ownerByCampaignId.get(cid) : undefined;
    if (!prevOwner || !t.campaign) return t;
    return { ...t, campaign: { ...t.campaign, owner: prevOwner } };
  });
}

function readCachedEarnState() {
  const cached = readEarnFeedCache();
  if (!cached) {
    return {
      tasks: [] as TaskRow[],
      myEngagements: [] as MyEngagementRow[],
      hasTelegram: null as boolean | null,
      hasMtprotoSession: null as boolean | null,
      hasMore: false,
      nextCursor: null as number | null,
      hasCache: false
    };
  }
  return {
    tasks: cached.tasks as TaskRow[],
    myEngagements: cached.myEngagements as MyEngagementRow[],
    hasTelegram: cached.hasTelegram,
    hasMtprotoSession: cached.hasMtprotoSession,
    hasMore: Boolean(cached.hasMore),
    nextCursor: typeof cached.nextCursor === "number" ? cached.nextCursor : null,
    hasCache: cached.tasks.length > 0 || cached.myEngagements.length > 0
  };
}

/** High-contrast credit pill on filled (primary) action buttons. */
const rewardBadgeOnFilled =
  "ml-2 rounded-full border-0 bg-white/20 px-2 text-xs font-semibold text-white hover:bg-white/20";
/** High-contrast credit pill on outline action buttons. */
const rewardBadgeOnOutline =
  "ml-2 rounded-full border border-border bg-background px-2 text-xs font-semibold text-foreground hover:bg-background";
/** Task type chip in card header (not on blue). */
const taskTypeBadgeClass = "border-border bg-muted text-foreground hover:bg-muted";

export function EarnCredits() {
  const initial = readCachedEarnState();
  const [tasks, setTasks] = useState<TaskRow[]>(initial.tasks);
  const [myEngagements, setMyEngagements] = useState<MyEngagementRow[]>(initial.myEngagements);
  const [loading, setLoading] = useState(!initial.hasCache);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [nextCursor, setNextCursor] = useState<number | null>(initial.nextCursor);
  const [busy, setBusy] = useState<string | null>(null);
  const [hasTelegram, setHasTelegram] = useState<boolean | null>(initial.hasTelegram);
  const [hasMtprotoSession, setHasMtprotoSession] = useState<boolean | null>(initial.hasMtprotoSession);
  const [selectedReactionByCampaign, setSelectedReactionByCampaign] = useState<Record<number, string>>({});
  const [commentDraftByCampaign, setCommentDraftByCampaign] = useState<Record<number, string>>({});
  const [activeCommentCampaignId, setActiveCommentCampaignId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const setup = useSetupStatus();
  const [setupNeeded, setSetupNeeded] = useState<Exclude<SetupStepId, "goal"> | null>(null);

  const applyFeedPayload = useCallback(
    (
      tasksRes: { tasks?: unknown; myEngagements?: unknown; hasMore?: unknown; nextCursor?: unknown },
      profileUser?: { telegramUserId?: string | null; hasMtprotoSession?: boolean } | null,
      mode: "replace" | "append" = "replace"
    ) => {
      const nextTasks = Array.isArray(tasksRes?.tasks) ? (tasksRes.tasks as TaskRow[]) : [];
      const nextEngagements = Array.isArray(tasksRes?.myEngagements)
        ? (tasksRes.myEngagements as MyEngagementRow[])
        : [];
      const responseHasMore = Boolean(tasksRes?.hasMore);
      const responseNextCursor = typeof tasksRes?.nextCursor === "number" ? tasksRes.nextCursor : null;
      let mergedTasks =
        mode === "append" ? mergeTasksById(tasks, nextTasks) : mergeTasksPreserveOwner(tasks, nextTasks);
      let mergedCursor = responseNextCursor;
      let mergedHasMore = responseHasMore;
      // A background refresh returns only the first page: keep the older pages the user already
      // loaded with "Load more" instead of shrinking the list under them.
      if (mode === "replace" && responseHasMore && nextTasks.length > 0 && tasks.length > nextTasks.length) {
        const oldestIncoming = Math.min(...nextTasks.map((t) => Number(t.id)));
        const olderLoaded = tasks.filter((t) => Number(t.id) < oldestIncoming);
        if (olderLoaded.length > 0) {
          mergedTasks = [...mergedTasks, ...olderLoaded];
          mergedCursor = nextCursor;
          mergedHasMore = hasMore;
        }
      }
      const mergedEngagements =
        mode === "append" ? mergeEngagements(myEngagements, nextEngagements) : nextEngagements;
      setTasks(mergedTasks);
      setMyEngagements(mergedEngagements);
      setHasMore(mergedHasMore);
      setNextCursor(mergedCursor);
      const prevCache = readEarnFeedCache();
      let cachedTelegram = prevCache?.hasTelegram ?? hasTelegram;
      let cachedMtproto = prevCache?.hasMtprotoSession ?? hasMtprotoSession;
      if (profileUser) {
        cachedTelegram = Boolean(profileUser.telegramUserId);
        cachedMtproto = Boolean(profileUser.hasMtprotoSession);
        setHasTelegram(cachedTelegram);
        setHasMtprotoSession(cachedMtproto);
      }
      writeEarnFeedCache({
        tasks: mergedTasks,
        myEngagements: mergedEngagements,
        savedAt: Date.now(),
        hasTelegram: cachedTelegram,
        hasMtprotoSession: cachedMtproto,
        hasMore: mergedHasMore,
        nextCursor: mergedCursor
      });
      setLoadError(null);
    },
    [hasTelegram, hasMtprotoSession, myEngagements, tasks, nextCursor, hasMore]
  );

  const refreshTasksFast = useCallback(async () => {
    const res = await withNetworkRetry(() =>
      api.getTasks({ fast: true, limit: EARN_PAGE_SIZE, skipSessionRedirect: true })
    );
    applyFeedPayload(res);
    return res;
  }, [applyFeedPayload]);

  const refreshFeed = useCallback(async () => {
    await refreshTasksFast();
  }, [refreshTasksFast]);

  /** Run action under busy key; always clears spinner even if follow-up refresh fails. */
  const runWithBusy = async (busyKey: string, work: () => Promise<void>) => {
    setBusy(busyKey);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  };

  const refreshAfterEngagementChange = () => {
    void refreshFeed().catch(() => undefined);
  };

  const loadTasks = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      const hasVisibleFeed = tasks.length > 0 || Boolean(readEarnFeedCache()?.tasks.length);
      if (!silent && !hasVisibleFeed) setLoading(true);
      else if (!silent) setIsRefreshing(true);
      try {
        const hasCache = tasks.length > 0 || Boolean(readEarnFeedCache()?.tasks.length);
        const [profileRes, tasksRes] = await Promise.all([
          api.getProfile({ skipSessionRedirect: true }).catch(() => null),
          withNetworkRetry(
            () => api.getTasks({ fast: true, limit: EARN_PAGE_SIZE, skipSessionRedirect: true }),
            hasCache ? { attempts: 2, baseDelayMs: 1200 } : { attempts: 3, baseDelayMs: 2500 }
          )
        ]);
        const u = profileRes?.user as
          | { telegramUserId?: string | null; hasMtprotoSession?: boolean }
          | undefined;
        applyFeedPayload(tasksRes, u ?? null);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Could not load tasks";
        setLoadError(message);
        if (!silent && tasks.length === 0) toast.error(message);
      } finally {
        if (!silent) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [applyFeedPayload, tasks.length]
  );

  const loadMoreTasks = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getTasks({ fast: true, limit: EARN_PAGE_SIZE, cursor: nextCursor });
      applyFeedPayload(res, null, "append");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not load more tasks");
    } finally {
      setLoadingMore(false);
    }
  }, [applyFeedPayload, loadingMore, nextCursor]);

  useEffect(() => {
    void loadTasks({ silent: initial.hasCache });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && !isEarnFeedCacheFresh(EARN_CACHE_STALE_MS)) {
        void loadTasks({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadTasks]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (busy === null && document.visibilityState === "visible") {
        void refreshTasksFast().catch(() => undefined);
      }
    }, EARN_FEED_POLL_MS);
    return () => window.clearInterval(id);
  }, [busy, refreshTasksFast]);

  const taskGroups = useMemo(() => {
    const map = new Map<number, TaskRow[]>();
    const list = Array.isArray(tasks) ? tasks : [];
    for (const t of list) {
      const cid = t.campaign?.id ?? t.campaignId ?? 0;
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(t);
    }
    return [...map.entries()]
      .map(([campaignId, list]) => ({
        campaignId,
        campaign: list[0]?.campaign,
        tasks: [...list].sort((a, b) => b.id - a.id)
      }))
      .sort((a, b) => {
        const topA = a.tasks[0]?.id ?? 0;
        const topB = b.tasks[0]?.id ?? 0;
        return topB - topA;
      });
  }, [tasks]);

  const handleAction = async (
    campaignId: number,
    campaignTasks: TaskRow[],
    engagementType: string,
    action: "subscribe" | "like" | "comment" | "share"
  ) => {
    if (!bundleAllowsAction(engagementType, action)) return;
    if (!setup.loading) {
      if (!setup.telegram) return setSetupNeeded("telegram");
      if (!setup.phone && hasMtprotoSession !== true) return setSetupNeeded("phone");
      if (action === "share" && !setup.channel) return setSetupNeeded("channel");
    }
    try {
      if (action === "subscribe") {
        const subscribedAlready = hasEngagement(myEngagements, campaignId, "subscribe");
        const subscribedEarned = isEngagementEarned(myEngagements, campaignId, "subscribe", campaignTasks);
        if (subscribedAlready && !subscribedEarned) {
          toast.info("You are already subscribed on Telegram. This campaign only rewards a new subscribe.");
          return;
        }
        if (subscribedAlready && subscribedEarned) {
          await runWithBusy(`${campaignId}-unsubscribe`, async () => {
            const res = await api.revertEngagement({ campaignId, actionKind: "subscribe" });
            setMyEngagements((prev) => withoutEngagement(prev, campaignId, "subscribe"));
            if (res.fallback) {
              toast.success(res.message || "Saved subscription cleared.");
            } else {
              toast.success("Unsubscribed. The credits for this task were taken back.");
            }
          });
          refreshAfterEngagementChange();
          return;
        }
        const subscribeTask = firstOpenTask(campaignTasks);
        if (!subscribeTask) {
          toast.error("No open subscribe task right now — refresh and try again.");
          return;
        }
        if (hasMtprotoSession === false) {
          setSetupNeeded("phone");
          return;
        }
        await runWithBusy(`${campaignId}-subscribe`, async () => {
          await api.completeTask({
            taskId: subscribeTask.id,
            engagementType,
            actionKind: "subscribe",
          });
          toast.success(`Earned ${subscribeTask.rewardCredits} credits`, {
            description: "You joined the channel. Stay subscribed to keep the credits.",
          });
        });
        refreshAfterEngagementChange();
        return;
      }

      if (action !== "like" && hasEngagement(myEngagements, campaignId, action)) {
        toast.info("You already recorded this action.");
        return;
      }

      const task = firstOpenTask(campaignTasks);
      if (!task) {
        toast.error("No open task for this post — try refreshing.");
        return;
      }

      if (action === "comment") {
        const commentText = String(commentDraftByCampaign[campaignId] || "").trim();
        if (!commentText) {
          toast.error("Type your comment first.");
          return;
        }
        await runWithBusy(`${campaignId}-comment-submit`, async () => {
          await api.completeTask({
            taskId: task.id,
            engagementType,
            actionKind: "comment",
            proofText: commentText,
          });
          toast.success(`Earned ${task.rewardCredits} credits`, {
            description: "Your comment was posted.",
          });
        });
        setCommentDraftByCampaign((prev) => ({ ...prev, [campaignId]: "" }));
        setActiveCommentCampaignId(null);
        refreshAfterEngagementChange();
        return;
      }
      if (action === "like") {
        const likedAlready = hasEngagement(myEngagements, campaignId, "like");
        const likedEarned = isEngagementEarned(myEngagements, campaignId, "like", campaignTasks);
        if (likedAlready && !likedEarned) {
          toast.info("You already liked this post on Telegram. Remove the reaction there to earn on a new slot.");
          return;
        }
        if (likedAlready && likedEarned) {
          await runWithBusy(`${campaignId}-unlike`, async () => {
            const res = await api.revertEngagement({
              campaignId,
              actionKind: "like",
            });
            setMyEngagements((prev) => withoutEngagement(prev, campaignId, "like"));
            if (res.fallback) {
              toast.success(res.message || "Saved like cleared.");
            } else {
              toast.success("Reaction removed. The credits for this task were taken back.");
            }
          });
          refreshAfterEngagementChange();
          return;
        }
        if (hasMtprotoSession === false) {
          setSetupNeeded("phone");
          return;
        }
        const selectedReaction = selectedReactionByCampaign[campaignId] || "👍";
        await runWithBusy(`${campaignId}-like`, async () => {
          await api.completeTask({
            taskId: task.id,
            engagementType,
            actionKind: "like",
            reaction: selectedReaction,
          });
          toast.success(`Earned ${task.rewardCredits} credits`, {
            description: `You reacted ${selectedReaction} on the post.`,
          });
        });
        refreshAfterEngagementChange();
        return;
      }
      if (action === "share") {
        const sharedAlready = hasEngagement(myEngagements, campaignId, "share");
        if (sharedAlready) {
          await runWithBusy(`${campaignId}-share-delete`, async () => {
            const res = await api.revertEngagement({
              campaignId,
              actionKind: "share",
            });
            setMyEngagements((prev) => withoutEngagement(prev, campaignId, "share"));
            if (res.fallback) {
              toast.success(res.message || "Saved repost cleared.");
            } else {
              toast.success("Repost removed. The credits for this task were taken back.");
            }
          });
          refreshAfterEngagementChange();
          return;
        }
        if (hasMtprotoSession === false) {
          setSetupNeeded("phone");
          return;
        }
        await runWithBusy(`${campaignId}-share`, async () => {
          await api.completeTask({
            taskId: task.id,
            engagementType,
            actionKind: "share",
          });
          toast.success(`Earned ${task.rewardCredits} credits`, {
            description: "The post was shared to your channel.",
          });
        });
        refreshAfterEngagementChange();
        return;
      }
    } catch (error: unknown) {
      const fe = friendlyError(error, "Could not complete this action");
      if (fe.fixStep && fe.fixStep !== "goal") {
        setSetupNeeded(fe.fixStep);
      } else {
        toast.error(fe.message);
      }
    }
  };

  const handleDeleteComment = async (campaignId: number) => {
    try {
      await runWithBusy(`${campaignId}-comment-delete`, async () => {
        const res = await api.revertEngagement({ campaignId, actionKind: "comment" });
        setMyEngagements((prev) => withoutEngagement(prev, campaignId, "comment"));
        if (res.fallback) {
          toast.success(res.message || "Saved comment cleared.");
        } else {
          toast.success("Comment removed. The credits for this task were taken back.");
        }
      });
      refreshAfterEngagementChange();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not delete comment");
    }
  };

  const profileReady = hasTelegram !== null && hasMtprotoSession !== null;
  const earnSetupReady = hasTelegram === true && hasMtprotoSession === true;
  const showSetupHint = profileReady && !earnSetupReady;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      <PageHeader
        title="Earn credits"
        description="Pick a task, tap the button and the credits land in your wallet instantly. Each action pays once."
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={loading && tasks.length === 0}
            onClick={() => void loadTasks()}
          >
            <RefreshCw className={`h-4 w-4 ${loading || isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {!setup.loading && !setup.canEarn ? (
        <Callout
          tone="info"
          title={!setup.telegram ? "Connect Telegram to start earning" : "One quick step before you can earn"}
          action={
            <Button asChild size="sm">
              <Link to={setupHref(!setup.telegram ? "telegram" : "phone", "/earn")}>
                {!setup.telegram ? "Connect Telegram" : "Verify my phone"}
              </Link>
            </Button>
          }
        >
          {!setup.telegram
            ? "Link your Telegram account so we can check and reward your actions."
            : "Verify your phone once so we can subscribe, like, comment and repost for you when you tap a task. Takes about a minute."}
        </Callout>
      ) : null}

      <div className="space-y-6">
        {isRefreshing && tasks.length > 0 ? (
          <p className="text-xs text-muted-foreground">Updating…</p>
        ) : null}
        {loading && tasks.length === 0 ? <ListSkeleton rows={3} /> : null}
        {loadError ? (
          <Callout
            tone="danger"
            title={tasks.length > 0 ? "Showing your last loaded tasks" : "We couldn’t load tasks"}
            action={
              <Button type="button" size="sm" variant="outline" disabled={isRefreshing} onClick={() => void loadTasks()}>
                {isRefreshing ? "Retrying…" : "Try again"}
              </Button>
            }
          >
            {loadError}
          </Callout>
        ) : null}
        {!loading && !loadError && tasks.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No tasks right now"
            description="New tasks appear whenever other members launch campaigns. Check back soon, or launch your own campaign meanwhile."
            action={
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadTasks()}>
                  Refresh
                </Button>
                <Button asChild size="sm">
                  <Link to="/submit">Launch a campaign</Link>
                </Button>
              </>
            }
          />
        ) : null}

        {taskGroups.map(({ campaign, tasks: campaignTasks }) => {
          if (!campaign) return null;
          const et = String(campaignTasks[0]?.engagementType ?? "");
          const title = campaignDisplayTitle(campaign);
          const nextOpen = firstOpenTask(campaignTasks);
          const reward = nextOpen?.rewardCredits ?? campaignTasks[0]?.rewardCredits ?? 0;
          const postedAgo = relativeCampaignTime(campaign.createdAt);
          const cid = campaign.id;
          const likedEarned = isEngagementEarned(myEngagements, cid, "like", campaignTasks);
          const liked = hasEngagement(myEngagements, cid, "like") || likedEarned;
          const commentedEarned = isEngagementEarned(myEngagements, cid, "comment", campaignTasks);
          const commented = hasEngagement(myEngagements, cid, "comment") || commentedEarned;
          const sharedEarned = isEngagementEarned(myEngagements, cid, "share", campaignTasks);
          const shared =
            hasEngagement(myEngagements, cid, "share") ||
            sharedEarned ||
            (et === "share" && hasCompletedTask(campaignTasks));
          const subscribedEarned = isEngagementEarned(myEngagements, cid, "subscribe", campaignTasks);
          const subscribed = hasEngagement(myEngagements, cid, "subscribe") || subscribedEarned;
          const subscribePreExisting = Boolean(
            getEngagement(myEngagements, cid, "subscribe")?.preExisting
          );
          const likePreExisting = Boolean(getEngagement(myEngagements, cid, "like")?.preExisting);
          const commentPreExisting = Boolean(getEngagement(myEngagements, cid, "comment")?.preExisting);
          const isSubscribeCampaign = et === "subscribe";
          const actionsLocked = busy !== null;
          const ownerLabel = ownerExchangeDisplayName(campaign.owner);
          const avatarUrl = ownerAvatarUrl(campaign.owner, ownerLabel);
          const ownerInitials = ownerAvatarInitials(campaign.owner);

          return (
            <Card
              key={campaign.id}
              className="overflow-hidden border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex gap-3 p-4 pb-3">
                <Avatar className="h-11 w-11 shrink-0 border border-border">
                  <AvatarImage src={avatarUrl} alt={ownerLabel} />
                  <AvatarFallback delayMs={0} className="bg-primary/15 text-sm font-semibold text-foreground">
                    {ownerInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-bold leading-snug text-foreground md:text-lg">{title}</h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        By <span className="font-medium text-foreground/90">{ownerLabel}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{postedAgo}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-2 py-1">
                        <span className="text-xs text-muted-foreground">Task</span>
                        <Badge variant="outline" className={taskTypeBadgeClass}>
                          {isSubscribeCampaign ? "Subscribe" : getEngagementLabel(et)}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0" asChild>
                        <a
                          href={campaign.soundcloudPostUrl || campaign.messageUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open post"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-4 pb-3 pl-14">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start">
                  <TelegramMessageMedia
                    postUrl={campaign.soundcloudPostUrl || campaign.messageUrl || ""}
                    className="w-[170px] shrink-0 self-start"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border bg-secondary/10 px-4 py-3 pl-14">
                {isSubscribeCampaign ? (
                  <Button
                    type="button"
                    variant={subscribed ? "default" : "outline"}
                    size="sm"
                    className="rounded-full pr-3"
                    onClick={() => void handleAction(cid, campaignTasks, et, "subscribe")}
                    disabled={
                      actionsLocked ||
                      (subscribed && !subscribedEarned)
                    }
                  >
                    {busy === `${cid}-subscribe` || busy === `${cid}-unsubscribe` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <BellPlus className="mr-2 h-4 w-4" />
                    )}
                    {busy === `${cid}-subscribe`
                      ? "Subscribing..."
                      : busy === `${cid}-unsubscribe`
                        ? "Unsubscribing..."
                        : subscribed
                          ? subscribedEarned
                            ? "Unsubscribe"
                            : getEngagement(myEngagements, cid, "subscribe")?.preExisting
                              ? "Already subscribed"
                              : "Subscribed"
                          : "Subscribe"}
                    {subscribed && !subscribedEarned ? null : (
                      <Badge className={subscribed ? rewardBadgeOnFilled : rewardBadgeOnOutline}>
                        +{reward}
                      </Badge>
                    )}
                  </Button>
                ) : null}
                {!isSubscribeCampaign && bundleAllowsAction(et, "like") ? (
                <div className="inline-flex items-center gap-2">
                {!liked ? (
                  <Select
                    value={selectedReactionByCampaign[cid] || "👍"}
                    onValueChange={(value) =>
                      setSelectedReactionByCampaign((prev) => ({
                        ...prev,
                        [cid]: value,
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 w-[88px] rounded-full border-amber-500/25 bg-background/80 px-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REACTION_CHOICES.map((emoji) => (
                        <SelectItem key={emoji} value={emoji}>
                          {emoji}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <Button
                  type="button"
                  variant={liked ? "default" : "outline"}
                  size="sm"
                  className={
                    liked
                      ? "rounded-full pr-3"
                      : "rounded-full border-amber-500/25 bg-background/80 pr-3 hover:bg-amber-500/10"
                  }
                  onClick={() => void handleAction(cid, campaignTasks, et, "like")}
                  disabled={
                    !bundleAllowsAction(et, "like") ||
                    actionsLocked ||
                    (liked && !likedEarned)
                  }
                >
                  {busy === `${cid}-like` || busy === `${cid}-unlike` ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ThumbsUp className="mr-2 h-4 w-4" />
                  )}
                  {busy === `${cid}-like`
                    ? "Liking..."
                    : busy === `${cid}-unlike`
                      ? "Removing..."
                      : liked
                        ? likedEarned
                          ? "Unlike"
                          : likePreExisting
                            ? "Already liked"
                            : "Liked"
                        : "Like"}
                  {liked && !likedEarned ? null : (
                    <Badge className={liked ? rewardBadgeOnFilled : rewardBadgeOnOutline}>
                      +{reward}
                    </Badge>
                  )}
                </Button>
                </div>
                ) : null}
                {!isSubscribeCampaign && bundleAllowsAction(et, "share") ? (
                  shared ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-background/80 px-3 py-1.5">
                      <Repeat2 className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium text-foreground">Reposted</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-full"
                        onClick={() => void handleAction(cid, campaignTasks, et, "share")}
                        disabled={busy !== null}
                        aria-label="Delete repost action"
                      >
                        {busy === `${cid}-share-delete` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full border-border bg-background/80 pr-3 hover:bg-muted"
                      onClick={() => void handleAction(cid, campaignTasks, et, "share")}
                      disabled={busy !== null}
                    >
                      {busy === `${cid}-share` ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Repeat2 className="mr-2 h-4 w-4" />
                      )}
                      {busy === `${cid}-share` ? "Reposting..." : "Repost"}
                      <Badge className="ml-2 rounded-full bg-muted px-2 text-foreground hover:bg-muted">
                        +{reward}
                      </Badge>
                    </Button>
                  )
                ) : null}
                {!isSubscribeCampaign && bundleAllowsAction(et, "comment") ? (
                  commented ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-background/80 px-3 py-1.5">
                      <MessageCircle className="h-4 w-4 text-blue-500" />
                      <span className="max-w-[220px] truncate text-sm text-foreground">
                        {getCommentText(myEngagements, cid) ||
                          (commentPreExisting ? "Already commented" : "Comment sent")}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-full"
                        onClick={() => void handleDeleteComment(cid)}
                        disabled={busy !== null || !commentedEarned}
                      >
                        {busy === `${cid}-comment-delete` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  ) : activeCommentCampaignId === cid ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={commentDraftByCampaign[cid] || ""}
                        onChange={(e) =>
                          setCommentDraftByCampaign((prev) => ({ ...prev, [cid]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleAction(cid, campaignTasks, et, "comment");
                          }
                        }}
                        placeholder="Write comment…"
                        className="h-9 w-[220px] rounded-full border-blue-500/25 bg-background/80"
                      />
                      <Button
                        type="button"
                        size="icon"
                        className="h-9 w-9 rounded-full"
                        onClick={() => void handleAction(cid, campaignTasks, et, "comment")}
                        disabled={busy !== null}
                      >
                        {busy === `${cid}-comment-submit` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <SendHorizontal className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full border-blue-500/25 bg-background/80 pr-3 hover:bg-blue-500/10"
                      onClick={() => {
                        if (!setup.loading && !setup.telegram) return setSetupNeeded("telegram");
                        if (!setup.loading && !setup.phone) return setSetupNeeded("phone");
                        setActiveCommentCampaignId(cid);
                      }}
                      disabled={actionsLocked}
                    >
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Comment
                      <Badge className={rewardBadgeOnOutline}>
                        +{reward}
                      </Badge>
                    </Button>
                  )
                ) : null}
              </div>
            </Card>
          );
        })}
        {hasMore ? (
          <div className="flex justify-center pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingMore}
              onClick={() => void loadMoreTasks()}
            >
              {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loadingMore ? "Loading..." : "Load more"}
            </Button>
          </div>
        ) : null}
      </div>
      <FinishSetupDialog step={setupNeeded} onOpenChange={(open) => !open && setSetupNeeded(null)} returnTo="/earn" />
    </div>
  );
}
