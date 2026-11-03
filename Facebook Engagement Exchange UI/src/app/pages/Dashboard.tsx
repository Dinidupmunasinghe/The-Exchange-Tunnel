import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Coins, ThumbsUp, MessageCircle, Share2, Activity, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { StatsCard, type StatsAccent } from "../components/StatsCard";
import { DashboardChannelHint } from "../components/ChannelConnectGuide";
import { CreditsFlowChart, EngagementActivityChart } from "../components/charts";
import { api, type UserAnalytics } from "../services/api";

const dashboardCardClass =
  "border-border bg-card shadow-none ring-0 dark:bg-gradient-to-br dark:from-card dark:to-card/70 dark:shadow-sm dark:ring-1 dark:ring-white/[0.06]";

type ActivityType = "like" | "comment" | "share" | "campaign";

type RecentActivityItem = {
  id: string;
  action: string;
  post: string;
  at: string;
  type: ActivityType;
};

function formatActivityTime(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export function Dashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [hasConnectedChannel, setHasConnectedChannel] = useState(false);
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [profileRes, dashRes, pagesRes] = await Promise.all([
        api.getProfile(),
        api.getDashboard(),
        api.getManagedPages().catch(() => ({ pages: [] as { selected?: boolean }[] })),
      ]);
      setProfile(profileRes.user);
      setDashboard(dashRes.stats);
      const pages = pagesRes.pages || [];
      setHasConnectedChannel(
        Boolean(profileRes.user?.telegramActingChannelId) || pages.some((p) => p.selected),
      );
    }
    load().catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load your dashboard"));
    api.getAnalytics(14).then(setAnalytics).catch(() => undefined);
  }, []);

  const stats = useMemo(
    () => [
      {
        title: "Total Credits",
        value: String(profile?.credits ?? 0),
        change: "Available",
        icon: Coins,
        trend: "neutral" as const,
        accent: "blue" as StatsAccent,
      },
      {
        title: "Credits Earned (30d)",
        value: String(dashboard?.creditsEarned30d ?? 0),
        change: "Last 30 days",
        icon: TrendingUp,
        trend: "neutral" as const,
        accent: "emerald" as StatsAccent,
      },
      {
        title: "Active Campaigns",
        value: String(dashboard?.activeCampaigns ?? 0),
        change: "Open",
        icon: Activity,
        trend: "neutral" as const,
        accent: "amber" as StatsAccent,
      },
      {
        title: "Credits Spent (30d)",
        value: String(dashboard?.creditsSpent30d ?? 0),
        change: "Last 30 days",
        icon: Wallet,
        trend: "neutral" as const,
        accent: "rose" as StatsAccent,
      },
    ],
    [dashboard, profile],
  );

  const recentActivity = useMemo(
    () => (dashboard?.recentActivity as RecentActivityItem[] | undefined) ?? [],
    [dashboard],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back! Here's your overview</p>
      </div>

      <DashboardChannelHint
        hasChannel={hasConnectedChannel}
        telegramConnected={Boolean(profile?.telegramUserId)}
      />

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatsCard key={stat.title} {...stat} />
        ))}
      </div>

      {loadError ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {loadError}
        </div>
      ) : null}

      {/* Charts (real data, last 14 days) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className={dashboardCardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground">Engagement activity</CardTitle>
            <p className="text-sm text-muted-foreground">Last 14 days</p>
          </CardHeader>
          <CardContent className="pt-0">
            {analytics ? <EngagementActivityChart daily={analytics.daily} height={260} /> : <div className="h-[290px]" />}
          </CardContent>
        </Card>
        <Card className={dashboardCardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground">Credit flow</CardTitle>
            <p className="text-sm text-muted-foreground">Earned vs. spent, last 14 days</p>
          </CardHeader>
          <CardContent className="pt-0">
            {analytics ? <CreditsFlowChart daily={analytics.daily} height={260} /> : <div className="h-[290px]" />}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className={dashboardCardClass}>
        <CardHeader>
          <CardTitle className="text-foreground">Recent Activity</CardTitle>
          <p className="text-sm text-muted-foreground">Your latest interactions</p>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/15 px-6 py-12 text-center">
              <Activity className="mb-3 h-10 w-10 text-muted-foreground/45" strokeWidth={1.75} />
              <p className="font-medium text-foreground">No recent activity</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Earn credits on tasks or start a campaign — your latest actions will show up here.
              </p>
            </div>
          ) : (
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/35 dark:bg-card/40 dark:hover:bg-card/70"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
                    activity.type === 'like' ? 'bg-blue-500/10 ring-blue-600/22 dark:bg-blue-500/15 dark:ring-blue-400/25' :
                    activity.type === 'comment' ? 'bg-violet-500/10 ring-violet-600/22 dark:bg-violet-500/15 dark:ring-violet-400/25' :
                    activity.type === 'share' ? 'bg-emerald-500/10 ring-emerald-600/22 dark:bg-emerald-500/15 dark:ring-emerald-400/25' :
                    'bg-amber-500/10 ring-amber-600/24 dark:bg-amber-500/15 dark:ring-amber-400/25'
                  }`}>
                    {activity.type === 'like' && <ThumbsUp className="h-5 w-5 text-blue-600 dark:text-blue-400" strokeWidth={2.25} />}
                    {activity.type === 'comment' && <MessageCircle className="h-5 w-5 text-violet-600 dark:text-violet-400" strokeWidth={2.25} />}
                    {activity.type === 'share' && <Share2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" strokeWidth={2.25} />}
                    {activity.type === 'campaign' && <Activity className="h-5 w-5 text-amber-600 dark:text-amber-400" strokeWidth={2.25} />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{activity.action}</p>
                    <p className="truncate text-sm text-muted-foreground">{activity.post}</p>
                  </div>
                </div>
                <span className="shrink-0 pl-3 text-sm text-muted-foreground tabular-nums">
                  {formatActivityTime(activity.at)}
                </span>
              </div>
            ))}
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}