import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ThumbsUp, MessageCircle, Share2, ExternalLink, Coins, RefreshCw, BellPlus } from "lucide-react";
import { TelegramMessageMedia } from "../components/TelegramMessageMedia";
import { formatDistanceToNow } from "date-fns";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { toast } from "sonner";
import { api } from "../services/api";
import {
  bundleAllowsAction,
  getEngagementLabel,
  type BaseEngagementKind
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
  };
  campaignId?: number;
};

type MyEngagementRow = { id: number; campaignId: number; taskId: number; actionKind: string };

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

function hasEngagement(rows: MyEngagementRow[], campaignId: number, kind: BaseEngagementKind): boolean {
  return rows.some((e) => e.campaignId === campaignId && e.actionKind === kind);
}

function firstOpenTask(tasks: TaskRow[]): TaskRow | undefined {
  const sorted = [...tasks].sort((a, b) => a.id - b.id);
  return sorted.find((t) => t.status === "open" || t.status === "assigned");
}

function hasCompletedTask(tasks: TaskRow[]): boolean {
  return tasks.some((t) => t.status === "completed");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function EarnCredits() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [myEngagements, setMyEngagements] = useState<MyEngagementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [hasTelegram, setHasTelegram] = useState<boolean | null>(null);

  const loadProfileStatus = useCallback(async () => {
    try {
      const res = await api.getProfile();
      setHasTelegram(Boolean((res.user as { telegramUserId?: string | null })?.telegramUserId));
    } catch {
      setHasTelegram(null);
    }
  }, []);

  const loadTasks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.getTasks();
      setTasks(res.tasks as TaskRow[]);
      setMyEngagements(res.myEngagements ?? []);
    } catch (error: unknown) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : "Could not load tasks");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks(false);
    void loadProfileStatus();
  }, [loadTasks, loadProfileStatus]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadTasks(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadTasks]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (busy === null) void loadTasks(true);
    }, 15000);
    return () => window.clearInterval(id);
  }, [busy, loadTasks]);

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
    action: "subscribe" | BaseEngagementKind
  ) => {
    if (!bundleAllowsAction(engagementType, action)) return;

    const key = `${campaignId}-${action}`;
    setBusy(key);
    try {
      if (action === "subscribe") {
        const subscribeTask = firstOpenTask(campaignTasks);
        if (!subscribeTask) {
          toast.error("No open subscribe task right now — refresh and try again.");
          return;
        }
        const campaignLink =
          subscribeTask.campaign?.messageUrl || subscribeTask.campaign?.soundcloudPostUrl || undefined;
        if (campaignLink) {
          window.open(campaignLink, "_blank", "noopener,noreferrer");
          toast.info("Opened Telegram channel", {
            description: "Subscribe there, come back, and we will auto-check for ~20 seconds.",
          });
        }

        const maxAttempts = 8;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          try {
            await api.completeTask({
              taskId: subscribeTask.id,
              engagementType,
              actionKind: "subscribe",
            });
            toast.success(`Earned ${subscribeTask.rewardCredits} credits`, {
              description: `Recorded · subscribe · task #${subscribeTask.id}`,
            });
            const refreshed = await api.getTasks();
            setTasks(refreshed.tasks as TaskRow[]);
            setMyEngagements(refreshed.myEngagements ?? []);
            return;
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Could not verify yet";
            const isTransient =
              msg.includes("Could not confirm your subscription") ||
              msg.includes("user not found") ||
              msg.includes("not subscribed");
            if (!isTransient) throw err;
          }
          await sleep(2500);
        }

        toast.error("Subscription not detected yet", {
          description: "After subscribing in Telegram, tap Subscribe again to retry verification.",
        });
        return;
      }

      if (action === "like" && hasEngagement(myEngagements, campaignId, "like")) {
        await api.revertEngagement({ campaignId, actionKind: "like" });
        toast.success("Reverted in app", { description: "Credits returned. Remove the reaction in Telegram if needed." });
        const refreshed = await api.getTasks();
        setTasks(refreshed.tasks as TaskRow[]);
        setMyEngagements(refreshed.myEngagements ?? []);
        return;
      }

      if (action !== "subscribe" && hasEngagement(myEngagements, campaignId, action)) {
        toast.info("You already recorded this action.");
        return;
      }

      const task = firstOpenTask(campaignTasks);
      if (!task) {
        toast.error("No open task for this post — try refreshing.");
        return;
      }

      const proofText =
        action === "subscribe"
          ? undefined
          : action === "like"
            ? undefined
            : "I completed the requested action on the Telegram public post in this channel, per campaign instructions.";

      await api.completeTask({
        taskId: task.id,
        engagementType,
        actionKind: action,
        ...(proofText ? { proofText } : {}),
      });
      toast.success(`Earned ${task.rewardCredits} credits`, {
          description: `Recorded · ${action} · task #${task.id}`
      });
      const refreshed = await api.getTasks();
      setTasks(refreshed.tasks as TaskRow[]);
      setMyEngagements(refreshed.myEngagements ?? []);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not update engagement");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Earn Credits</h1>
          <p className="mt-1 text-muted-foreground">One completion per button; subscribe in Telegram, then verify in app</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadTasks()}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh feed
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <Coins className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Log in with Telegram</span> so we can verify your subscription to
          the target channel. Like can be undone in-app. Comment/Share need a short proof (auto-filled) after you do the
          action in Telegram.
        </p>
      </div>
      {hasTelegram === false ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Sign in with Telegram on{" "}
          <Link to="/login" className="font-medium underline underline-offset-2">
            Login
          </Link>{" "}
          first. The app checks your Telegram user id and channel subscription.
        </div>
      ) : null}

      <div className="space-y-6">
        {loading && tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading feed…</p>
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
          const liked = hasEngagement(myEngagements, cid, "like");
          const commented = hasEngagement(myEngagements, cid, "comment");
          const shared = hasEngagement(myEngagements, cid, "share");
          const subscribed = hasCompletedTask(campaignTasks);
          const isSubscribeCampaign = et === "subscribe";

          return (
            <Card
              key={campaign.id}
              className="overflow-hidden border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex gap-3 p-4 pb-3">
                <Avatar className="h-11 w-11 shrink-0 border border-border">
                  <AvatarFallback className="bg-secondary text-sm font-semibold text-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-bold leading-snug text-foreground md:text-lg">{title}</h2>
                      <p className="text-sm text-muted-foreground">{postedAgo}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Associated tasks</span>
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          {isSubscribeCampaign ? "Subscribe" : getEngagementLabel(et)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
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
                    disabled={subscribed || busy !== null || hasTelegram === false}
                  >
                    <BellPlus className="mr-2 h-4 w-4" />
                    {subscribed ? "Subscribed" : busy === `${cid}-subscribe` ? "Checking..." : "Subscribe"}
                    <Badge className="ml-2 rounded-full bg-primary/15 px-2 text-primary hover:bg-primary/15">
                      +{reward}
                    </Badge>
                  </Button>
                ) : null}
                {!isSubscribeCampaign ? (
                <Button
                  type="button"
                  variant={liked ? "default" : "outline"}
                  size="sm"
                  className={
                    liked
                      ? "rounded-full pr-3"
                      : "rounded-full border-primary/25 bg-background/80 pr-3 hover:bg-primary/10"
                  }
                  onClick={() => void handleAction(cid, campaignTasks, et, "like")}
                  disabled={!bundleAllowsAction(et, "like") || busy !== null || hasTelegram === false}
                >
                  <ThumbsUp className={`mr-2 h-4 w-4 ${liked ? "fill-current" : ""}`} />
                  {liked ? "Liked" : "Like"}
                  <Badge
                    className={
                      liked
                        ? "ml-2 rounded-full bg-primary-foreground/20 px-2 text-primary-foreground hover:bg-primary-foreground/20"
                        : "ml-2 rounded-full bg-primary/15 px-2 text-primary hover:bg-primary/15"
                    }
                  >
                    {liked ? "tap to undo" : `+${reward}`}
                  </Badge>
                </Button>
                ) : null}
                {!isSubscribeCampaign ? (
                <Button
                  type="button"
                  variant={commented ? "default" : "outline"}
                  size="sm"
                  className={
                    commented
                      ? "rounded-full pr-3"
                      : "rounded-full border-blue-500/25 bg-background/80 pr-3 hover:bg-blue-500/10"
                  }
                  onClick={() => void handleAction(cid, campaignTasks, et, "comment")}
                  disabled={!bundleAllowsAction(et, "comment") || commented || busy !== null || hasTelegram === false}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Comment
                  <Badge className="ml-2 rounded-full bg-blue-500/15 px-2 text-blue-600 dark:text-blue-400 hover:bg-blue-500/15">
                    +{reward}
                  </Badge>
                </Button>
                ) : null}
                {!isSubscribeCampaign ? (
                <Button
                  type="button"
                  variant={shared ? "default" : "outline"}
                  size="sm"
                  className={
                    shared
                      ? "rounded-full pr-3"
                      : "rounded-full border-purple-500/25 bg-background/80 pr-3 hover:bg-purple-500/10"
                  }
                  onClick={() => void handleAction(cid, campaignTasks, et, "share")}
                  disabled={!bundleAllowsAction(et, "share") || shared || busy !== null || hasTelegram === false}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                  <Badge className="ml-2 rounded-full bg-purple-500/15 px-2 text-purple-600 dark:text-purple-400 hover:bg-purple-500/15">
                    +{reward}
                  </Badge>
                </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
