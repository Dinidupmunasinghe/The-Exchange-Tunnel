import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ThumbsUp, MessageCircle, Share2, ExternalLink, Coins, RefreshCw } from "lucide-react";
import { SoundCloudPostMedia } from "../components/SoundCloudPostMedia";
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
  getBundleActionHint,
  type BaseEngagementKind
} from "../lib/engagement";

type TaskRow = {
  id: number;
  engagementType: string;
  rewardCredits: number;
  status?: string;
  createdAt?: string;
  campaign?: {
    id: number;
    name?: string;
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

export function EarnCredits() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [myEngagements, setMyEngagements] = useState<MyEngagementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [hasSelectedPage, setHasSelectedPage] = useState<boolean | null>(null);

  const loadProfileStatus = useCallback(async () => {
    try {
      const res = await api.getProfile();
      setHasSelectedPage(Boolean(res.user?.soundcloudActingAccountId));
    } catch {
      setHasSelectedPage(null);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTasks();
      setTasks(res.tasks as TaskRow[]);
      setMyEngagements(res.myEngagements ?? []);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
    void loadProfileStatus();
  }, [loadTasks, loadProfileStatus]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadTasks();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadTasks]);

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
    action: BaseEngagementKind
  ) => {
    if (!bundleAllowsAction(engagementType, action)) return;

    const key = `${campaignId}-${action}`;
    setBusy(key);
    try {
      if (action === "like" && hasEngagement(myEngagements, campaignId, "like")) {
        await api.revertEngagement({ campaignId, actionKind: "like" });
        toast.success("Like removed on SoundCloud", { description: "Credits returned to the poster." });
        const refreshed = await api.getTasks();
        setTasks(refreshed.tasks as TaskRow[]);
        setMyEngagements(refreshed.myEngagements ?? []);
        return;
      }

      if (hasEngagement(myEngagements, campaignId, action)) {
        toast.info("You already recorded this action.");
        return;
      }

      const task = firstOpenTask(campaignTasks);
      if (!task) {
        toast.error("No open task for this post — try refreshing.");
        return;
      }

      const proofText =
        action === "comment"
          ? "Great post, thanks for sharing."
          : action === "share"
            ? undefined
            : undefined;

      await api.completeTask({
        taskId: task.id,
        engagementType,
        actionKind: action,
        ...(proofText ? { proofText } : {})
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
          <p className="mt-1 text-muted-foreground">Same actions as on SoundCloud - one completion per button per post</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadTasks()}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh feed
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <Coins className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Actions use your selected SoundCloud account</span> from
          Settings. Like can be tapped again to undo and refund the poster. Comment uses a short default comment,
          and share publishes the post URL from that acting account.
        </p>
      </div>
      {hasSelectedPage === false ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          No SoundCloud account selected.{" "}
          <Link to="/settings" className="font-medium underline underline-offset-2">
            Go to Settings
          </Link>{" "}
          to select a Page before earning credits.
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
          const hint = getBundleActionHint(et);
          const title = campaign.name ? campaign.name : `Campaign #${campaign.id}`;
          const nextOpen = firstOpenTask(campaignTasks);
          const reward = nextOpen?.rewardCredits ?? campaignTasks[0]?.rewardCredits ?? 0;
          const postedAgo = relativeCampaignTime(campaign.createdAt);
          const initials = campaignInitials(title);
          const cid = campaign.id;
          const liked = hasEngagement(myEngagements, cid, "like");
          const commented = hasEngagement(myEngagements, cid, "comment");
          const shared = hasEngagement(myEngagements, cid, "share");

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
                    <div className="min-w-0 flex-1 space-y-1">
                      <h2 className="text-base font-bold leading-snug text-foreground md:text-lg">{title}</h2>
                      <p className="text-sm text-muted-foreground">{postedAgo}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0" asChild>
                      <a href={campaign.soundcloudPostUrl} target="_blank" rel="noreferrer" aria-label="Open post">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>

              <div className="px-4 pb-3 pl-14">
                <p className="text-sm leading-relaxed text-foreground">
                  <span className="font-semibold">{getEngagementLabel(et)}</span>
                  {" — "}
                  {hint ??
                    "Each button runs once per post for your selected SoundCloud account. Use Settings to pick the acting account."}
                </p>
              </div>

              <div className="mx-4 mb-4 ml-14 mr-4">
                <SoundCloudPostMedia postUrl={campaign.soundcloudPostUrl} />
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border bg-secondary/10 px-4 py-3 pl-14">
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
                  disabled={!bundleAllowsAction(et, "like") || busy !== null || hasSelectedPage === false}
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
                  disabled={!bundleAllowsAction(et, "comment") || commented || busy !== null || hasSelectedPage === false}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Comment
                  <Badge className="ml-2 rounded-full bg-blue-500/15 px-2 text-blue-600 dark:text-blue-400 hover:bg-blue-500/15">
                    +{reward}
                  </Badge>
                </Button>
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
                  disabled={!bundleAllowsAction(et, "share") || shared || busy !== null || hasSelectedPage === false}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                  <Badge className="ml-2 rounded-full bg-purple-500/15 px-2 text-purple-600 dark:text-purple-400 hover:bg-purple-500/15">
                    +{reward}
                  </Badge>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
