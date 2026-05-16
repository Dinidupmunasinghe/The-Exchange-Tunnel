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
    owner?: {
      id?: number;
      name?: string | null;
      telegramUserId?: string | null;
      profilePhotoUrl?: string | null;
      avatarUrl?: string | null;
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
function campaignInitials(title: string): string {
  const t = title.trim();
  if (/^campaign\s*#\d+$/i.test(t)) return "CP";
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words[0]?.length >= 2) return words[0].slice(0, 2).toUpperCase();
  return (words[0]?.[0] ?? "P").toUpperCase() + (words[0]?.[1] ?? "O").toUpperCase();
}

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

function extractTelegramUsernameFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = (u.hostname || "").toLowerCase().replace(/^www\./, "");
    if (host !== "t.me") return null;
    const parts = (u.pathname || "/").split("/").filter(Boolean);
    if (!parts[0] || parts[0] === "c") return null;
    return parts[0].replace(/^@/, "");
  } catch {
    return null;
  }
}

function telegramUserpicUrlFromUsername(username: string | null): string | null {
  if (!username) return null;
  return `https://t.me/i/userpic/320/${encodeURIComponent(username)}.jpg`;
}

function usernameFromOwnerName(ownerName: string): string | null {
  const raw = String(ownerName || "").trim();
  if (!raw.startsWith("@")) return null;
  const u = raw.slice(1).trim();
  return u || null;
}

function telegramProfileLink(owner: { name?: string | null; telegramUserId?: string | null } | undefined): string | null {
  if (!owner) return null;
  const name = String(owner.name || "").trim();
  const maybeAt = name.startsWith("@") ? name.slice(1) : "";
  if (maybeAt) return `https://t.me/${encodeURIComponent(maybeAt)}`;
  const tgId = String(owner.telegramUserId || "").trim();
  if (!tgId) return null;
  return `tg://user?id=${encodeURIComponent(tgId)}`;
}

function ownerDisplayHandle(ownerName: string): string {
  const raw = String(ownerName || "").trim();
  if (!raw) return "@unknown";
  if (raw.startsWith("@")) return raw;
  const handle = raw
    .toLowerCase()
    .replace(/[^a-z0-9_ ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return `@${handle || "unknown"}`;
}

function fallbackAvatarUrl(seed: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(seed || "ET")}&background=2a2a2a&color=ffffff&size=128&bold=true`;
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

const EARN_TELEGRAM_SYNC_KEY = "et_earn_telegram_sync_at";
const EARN_TELEGRAM_SYNC_TTL_MS = 5 * 60 * 1000;
const EARN_FEED_POLL_MS = 60_000;

function shouldRunTelegramSync(force = false): boolean {
  if (force) return true;
  try {
    const at = Number(sessionStorage.getItem(EARN_TELEGRAM_SYNC_KEY) || 0);
    return Date.now() - at > EARN_TELEGRAM_SYNC_TTL_MS;
  } catch {
    return true;
  }
}

function markTelegramSyncDone(): void {
  try {
    sessionStorage.setItem(EARN_TELEGRAM_SYNC_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [myEngagements, setMyEngagements] = useState<MyEngagementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [hasTelegram, setHasTelegram] = useState<boolean | null>(null);
  const [hasMtprotoSession, setHasMtprotoSession] = useState<boolean | null>(null);
  const [selectedReactionByCampaign, setSelectedReactionByCampaign] = useState<Record<number, string>>({});
  const [commentDraftByCampaign, setCommentDraftByCampaign] = useState<Record<number, string>>({});
  const [activeCommentCampaignId, setActiveCommentCampaignId] = useState<number | null>(null);
  const [avatarLoadedByCampaign, setAvatarLoadedByCampaign] = useState<Record<number, boolean>>({});
  const [syncingTelegram, setSyncingTelegram] = useState(false);

  const loadProfileStatus = useCallback(async () => {
    try {
      const res = await api.getProfile();
      const u = res.user as { telegramUserId?: string | null; hasMtprotoSession?: boolean };
      setHasTelegram(Boolean(u?.telegramUserId));
      setHasMtprotoSession(Boolean(u?.hasMtprotoSession));
    } catch {
      setHasTelegram(null);
      setHasMtprotoSession(null);
    }
  }, []);

  const refreshTasksFast = useCallback(async () => {
    const res = await api.getTasks({ fast: true });
    setTasks(res.tasks as TaskRow[]);
    setMyEngagements(res.myEngagements ?? []);
    return res;
  }, []);

  const syncTelegramState = useCallback(async (opts?: { force?: boolean; quiet?: boolean }) => {
    if (!shouldRunTelegramSync(opts?.force)) return;
    setSyncingTelegram(true);
    try {
      const sync = await api.syncTelegramEngagementState();
      if (sync?.myEngagements) setMyEngagements(sync.myEngagements);
      markTelegramSyncDone();
    } catch (error: unknown) {
      if (!opts?.quiet) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not verify your existing Telegram actions. Check Settings → User Session."
        );
      }
    } finally {
      setSyncingTelegram(false);
    }
  }, []);

  const refreshFeed = useCallback(
    async (opts?: { forceSync?: boolean }) => {
      await refreshTasksFast();
      void syncTelegramState({ force: opts?.forceSync, quiet: true });
    },
    [refreshTasksFast, syncTelegramState]
  );

  const loadTasks = useCallback(
    async (opts?: { silent?: boolean; forceSync?: boolean }) => {
      const silent = opts?.silent ?? false;
      const forceSync = opts?.forceSync ?? false;
      if (!silent) setLoading(true);
      try {
        await refreshTasksFast();
        if (!silent) setLoading(false);
        void syncTelegramState({ force: forceSync, quiet: !forceSync });
      } catch (error: unknown) {
        if (!silent) {
          toast.error(error instanceof Error ? error.message : "Could not load tasks");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [refreshTasksFast, syncTelegramState]
  );

  useEffect(() => {
    void loadProfileStatus();
    void loadTasks({ silent: false, forceSync: true });
  }, [loadTasks, loadProfileStatus]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshTasksFast();
        void loadProfileStatus();
        void syncTelegramState({ quiet: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshTasksFast, loadProfileStatus, syncTelegramState]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (busy === null) void refreshTasksFast();
    }, EARN_FEED_POLL_MS);
    return () => window.clearInterval(id);
  }, [busy, refreshTasksFast]);

  const taskGroups = useMemo(() => {
    const map = new Map<number, TaskRow[]>();
    for (const t of tasks) {
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
    try {
      if (action === "subscribe") {
        const subscribedAlready = hasEngagement(myEngagements, campaignId, "subscribe");
        const subscribedEarned = isEngagementEarned(myEngagements, campaignId, "subscribe", campaignTasks);
        if (subscribedAlready && !subscribedEarned) {
          toast.info("You are already subscribed on Telegram. This campaign only rewards a new subscribe.");
          return;
        }
        if (subscribedAlready && subscribedEarned) {
          const key = `${campaignId}-unsubscribe`;
          setBusy(key);
          const res = await api.revertEngagement({ campaignId, actionKind: "subscribe" });
          if (res.fallback) {
            toast.success(res.message || "Saved subscription cleared.");
          } else {
            toast.success("Unsubscribed and credits refunded.");
          }
          await refreshFeed();
          setBusy(null);
          return;
        }
        const subscribeTask = firstOpenTask(campaignTasks);
        if (!subscribeTask) {
          toast.error("No open subscribe task right now — refresh and try again.");
          return;
        }
        const key = `${campaignId}-subscribe`;
        setBusy(key);
        if (hasMtprotoSession !== true) {
          toast.error("Subscribe requires Telegram user session auth first.", {
            description: "Opening Settings now. Complete User Session setup and try again.",
          });
          setBusy(null);
          window.location.href = "/settings#user-session";
          return;
        }
        await api.completeTask({
          taskId: subscribeTask.id,
          engagementType,
          actionKind: "subscribe",
        });
        toast.success(`Earned ${subscribeTask.rewardCredits} credits`, {
          description: `Recorded · subscribe · task #${subscribeTask.id}`,
        });
        await refreshFeed();
        setBusy(null);
        return;
      }

      if (action !== "subscribe" && action !== "like" && hasEngagement(myEngagements, campaignId, action)) {
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
        const key = `${campaignId}-comment-submit`;
        setBusy(key);
        await api.completeTask({
          taskId: task.id,
          engagementType,
          actionKind: "comment",
          proofText: commentText,
        });
        toast.success(`Earned ${task.rewardCredits} credits`, {
          description: `Recorded · comment · task #${task.id}`,
        });
        await refreshFeed();
        setCommentDraftByCampaign((prev) => ({ ...prev, [campaignId]: "" }));
        setActiveCommentCampaignId(null);
        setBusy(null);
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
          const key = `${campaignId}-unlike`;
          setBusy(key);
          const res = await api.revertEngagement({
            campaignId,
            actionKind: "like",
          });
          if (res.fallback) {
            toast.success(res.message || "Saved like cleared.");
          } else {
            toast.success("Like removed and credits refunded.");
          }
          await refreshFeed();
          setBusy(null);
          return;
        }
        const key = `${campaignId}-like`;
        setBusy(key);
        if (hasMtprotoSession !== true) {
          toast.error("Engagement requires Telegram user session auth first.", {
            description: "Opening Settings now. Complete User Session setup and try again.",
          });
          setBusy(null);
          window.location.href = "/settings#user-session";
          return;
        }
        const selectedReaction = selectedReactionByCampaign[campaignId] || "👍";
        await api.completeTask({
          taskId: task.id,
          engagementType,
          actionKind: "like",
          reaction: selectedReaction,
        });
        toast.success(`Earned ${task.rewardCredits} credits`, {
          description: `Recorded · reaction ${selectedReaction} · task #${task.id}`,
        });
        await refreshFeed();
        setBusy(null);
        return;
      }
      if (action === "share") {
        const sharedAlready = hasEngagement(myEngagements, campaignId, "share");
        if (sharedAlready) {
          const key = `${campaignId}-share-delete`;
          setBusy(key);
          const res = await api.revertEngagement({
            campaignId,
            actionKind: "share"
          });
          if (res.fallback) {
            toast.success(res.message || "Saved repost cleared.");
          } else {
            toast.success("Repost removed and credits refunded.");
          }
          await refreshFeed();
          setBusy(null);
          return;
        }
        const key = `${campaignId}-share`;
        setBusy(key);
        if (hasMtprotoSession !== true) {
          toast.error("Share requires Telegram user session auth first.", {
            description: "Opening Settings now. Complete User Session setup and try again."
          });
          setBusy(null);
          window.location.href = "/settings#user-session";
          return;
        }
        await api.completeTask({
          taskId: task.id,
          engagementType,
          actionKind: "share"
        });
        toast.success(`Earned ${task.rewardCredits} credits`, {
          description: `Recorded · repost · task #${task.id}`
        });
        await refreshFeed();
        setBusy(null);
        return;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Could not update engagement";
      toast.error(msg);
      if (
        msg.includes("requires Telegram user session") ||
        msg.includes("Like requires Telegram user session auth first")
      ) {
        toast.info("Open Settings to connect Telegram User Session for engagement.");
        window.location.href = "/settings#user-session";
      }
      setBusy(null);
    }
  };

  const handleDeleteComment = async (campaignId: number) => {
    try {
      const key = `${campaignId}-comment-delete`;
      setBusy(key);
      const res = await api.revertEngagement({ campaignId, actionKind: "comment" });
      if (res.fallback) {
        toast.success(res.message || "Saved comment cleared.");
      } else {
        toast.success("Comment removed and credits refunded.");
      }
      await refreshFeed();
      setBusy(null);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not delete comment");
      setBusy(null);
    }
  };

  const profileReady = hasTelegram !== null && hasMtprotoSession !== null;
  const earnSetupReady = hasTelegram === true && hasMtprotoSession === true;
  const showSetupHint = profileReady && !earnSetupReady;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Earn Credits</h1>
          <p className="mt-1 text-muted-foreground">One completion per button; subscribe in Telegram, then verify in app</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || syncingTelegram}
          onClick={() => void loadTasks({ forceSync: true })}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading || syncingTelegram ? "animate-spin" : ""}`} />
          Refresh feed
        </Button>
      </div>

      {showSetupHint ? (
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <Coins className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Connect Telegram</span> in Settings and connect a user session
            so we can act on your behalf. For post campaigns, Telegram usually requires you to join the channel before you
            can like or comment; if you are not a member yet, the app will try to join the channel automatically when you
            tap Like or Comment (same as subscribe campaigns).
          </p>
        </div>
      ) : null}
      {profileReady && hasTelegram === false ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
          Sign in with Telegram on{" "}
          <Link to="/login" className="font-medium underline underline-offset-2">
            Login
          </Link>{" "}
          first. The app checks your Telegram user id and channel subscription.
        </div>
      ) : null}
      {profileReady && hasTelegram && hasMtprotoSession === false ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
          Earn engagements (subscribe, like, comment, repost) require Telegram user session connection. Go to{" "}
          <Link to="/settings" className="font-medium underline underline-offset-2">
            Settings
          </Link>{" "}
          and complete Telegram User Session setup.
        </div>
      ) : null}

      <div className="space-y-6">
        {loading && tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading feed…</p>
        ) : null}
        {!loading && syncingTelegram ? (
          <p className="text-xs text-muted-foreground/80">
            Updating button states from Telegram in the background…
          </p>
        ) : null}
        {!loading && tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tasks in your feed. Try Refresh, or wait for an active campaign from another member.
          </p>
        ) : null}

        {taskGroups.map(({ campaign, tasks: campaignTasks }) => {
          if (!campaign) return null;
          const et = String(campaignTasks[0]?.engagementType ?? "");
          const title = campaign.name ? campaign.name : `Campaign #${campaign.id}`;
          const nextOpen = firstOpenTask(campaignTasks);
          const reward = nextOpen?.rewardCredits ?? campaignTasks[0]?.rewardCredits ?? 0;
          const postedAgo = relativeCampaignTime(campaign.createdAt);
          const initials = campaignInitials(title);
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
          const avatarUsername = extractTelegramUsernameFromUrl(campaign.messageUrl || campaign.soundcloudPostUrl);
          const ownerName = String(campaign.owner?.name || "").trim() || "Unknown";
          const ownerUsername = usernameFromOwnerName(ownerName);
          const avatarUrl =
            campaign.owner?.profilePhotoUrl ||
            campaign.owner?.avatarUrl ||
            telegramUserpicUrlFromUsername(ownerUsername || avatarUsername) ||
            fallbackAvatarUrl(ownerName || initials);
          const ownerDisplay = ownerDisplayHandle(ownerName);
          const ownerLink = telegramProfileLink(campaign.owner);

          return (
            <Card
              key={campaign.id}
              className="overflow-hidden border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex gap-3 p-4 pb-3">
                <Avatar className="h-11 w-11 shrink-0 border border-border">
                  <AvatarImage
                    src={avatarUrl}
                    alt={title}
                    className={avatarLoadedByCampaign[cid] ? "opacity-100" : "opacity-0"}
                    onLoad={(e) => {
                      const img = e.currentTarget as HTMLImageElement;
                      const ok = img.naturalWidth > 8 && img.naturalHeight > 8;
                      setAvatarLoadedByCampaign((prev) => ({ ...prev, [cid]: ok }));
                    }}
                    onError={() => setAvatarLoadedByCampaign((prev) => ({ ...prev, [cid]: false }))}
                  />
                  <AvatarFallback delayMs={0} className="bg-secondary text-sm font-semibold text-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-bold leading-snug text-foreground md:text-lg">{title}</h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        By{" "}
                        {ownerLink ? (
                          <a
                            href={ownerLink}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2 hover:text-foreground"
                          >
                            "{ownerDisplay}"
                          </a>
                        ) : (
                          <span>"{ownerDisplay}"</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{postedAgo}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-2 py-1">
                        <span className="text-xs text-muted-foreground">Associated tasks</span>
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
                      hasTelegram === false ||
                      hasMtprotoSession !== true ||
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
                {!isSubscribeCampaign ? (
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
                    hasTelegram === false ||
                    hasMtprotoSession !== true ||
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
                      disabled={busy !== null || hasTelegram === false || hasMtprotoSession !== true}
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
                        disabled={busy !== null || hasTelegram === false || hasMtprotoSession !== true}
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
                      onClick={() => setActiveCommentCampaignId(cid)}
                      disabled={actionsLocked || hasTelegram === false || hasMtprotoSession !== true}
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
      </div>
    </div>
  );
}
