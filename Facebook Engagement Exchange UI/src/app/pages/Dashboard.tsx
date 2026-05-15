import { useEffect, useMemo, useState } from "react";
import { Coins, ThumbsUp, MessageCircle, Share2, Activity, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { StatsCard, type StatsAccent } from "../components/StatsCard";
import { DashboardChannelHint } from "../components/ChannelConnectGuide";
import { useTheme } from "../components/theme/ThemeProvider";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TooltipProps } from "recharts";
import { api } from "../services/api";
import { cn } from "../components/ui/utils";

const dashboardCardClass =
  "border-border bg-card shadow-none ring-0 dark:bg-gradient-to-br dark:from-card dark:to-card/70 dark:shadow-sm dark:ring-1 dark:ring-white/[0.06]";

const engagementData = [
  { name: "Mon", likes: 45, comments: 25, shares: 15 },
  { name: "Tue", likes: 52, comments: 30, shares: 18 },
  { name: "Wed", likes: 48, comments: 28, shares: 16 },
  { name: "Thu", likes: 65, comments: 35, shares: 22 },
  { name: "Fri", likes: 78, comments: 42, shares: 28 },
  { name: "Sat", likes: 85, comments: 48, shares: 32 },
  { name: "Sun", likes: 72, comments: 38, shares: 25 },
];

const creditsData = [
  { name: "Jan", earned: 320, spent: 280 },
  { name: "Feb", earned: 380, spent: 320 },
  { name: "Mar", earned: 420, spent: 380 },
  { name: "Apr", earned: 460, spent: 410 },
  { name: "May", earned: 520, spent: 450 },
  { name: "Jun", earned: 580, spent: 520 },
];

const recentActivity = [
  { action: "Earned 10 credits", post: "t.me/launch/42", time: "2 min ago", type: "like" },
  { action: "Campaign started", post: "Product Launch Announcement", time: "15 min ago", type: "campaign" },
  { action: "Earned 15 credits", post: "Social Media Strategy Guide", time: "1 hour ago", type: "comment" },
  { action: "Earned 20 credits", post: "Growth Hacking Techniques", time: "2 hours ago", type: "share" },
];

const COLORS = {
  likes: "#059669",
  comments: "#2563eb",
  shares: "#d97706",
  earned: "#059669",
  spent: "#dc2626",
} as const;

function DashboardTooltip({ active, payload, label }: TooltipProps<number, string>) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  if (!active || !payload?.length) return null;
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-3 py-2.5 text-xs",
        isLight ? "shadow-none" : "shadow-lg",
      )}
    >
      <p className="mb-2 font-semibold tracking-tight text-foreground">{label}</p>
      <ul className="space-y-1.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center justify-between gap-6 tabular-nums">
            <span className="font-medium capitalize" style={{ color: entry.color }}>
              {entry.name}
            </span>
            <span className="font-semibold text-foreground">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Dashboard() {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const chartChrome = useMemo(
    () =>
      isLight
        ? {
            grid: "#e8edf5",
            axisLine: "#d7dfea",
            tick: "#526175",
            cursor: "rgba(15, 23, 42, 0.06)",
          }
        : {
            grid: "#2a2a2a",
            axisLine: "#3f3f46",
            tick: "#8e8ea0",
            cursor: "rgba(255,255,255,0.08)",
          },
    [isLight],
  );

  const [profile, setProfile] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const [profileRes, dashRes] = await Promise.all([api.getProfile(), api.getDashboard()]);
      setProfile(profileRes.user);
      setDashboard(dashRes.stats);
    }
    load().catch(() => undefined);
  }, []);

  const stats = useMemo(
    () => [
      {
        title: "Total Credits",
        value: String(profile?.credits ?? 0),
        change: "live",
        icon: Coins,
        trend: "up" as const,
        accent: "blue" as StatsAccent,
      },
      {
        title: "Credits Earned (30d)",
        value: String(dashboard?.creditsEarned30d ?? 0),
        change: "live",
        icon: TrendingUp,
        trend: "up" as const,
        accent: "emerald" as StatsAccent,
      },
      {
        title: "Active Campaigns",
        value: String(dashboard?.activeCampaigns ?? 0),
        change: "live",
        icon: Activity,
        trend: "up" as const,
        accent: "amber" as StatsAccent,
      },
      {
        title: "Credits Spent (30d)",
        value: String(dashboard?.creditsSpent30d ?? 0),
        change: "live",
        icon: Wallet,
        trend: "up" as const,
        accent: "rose" as StatsAccent,
      }
    ],
    [dashboard, profile]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back! Here's your overview</p>
      </div>

      <DashboardChannelHint
        hasChannel={Boolean(profile?.telegramActingChannelId)}
        telegramConnected={Boolean(profile?.telegramUserId)}
      />

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatsCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Engagement Trends */}
        <Card className={dashboardCardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground">Engagement Trends</CardTitle>
            <p className="text-sm text-muted-foreground">Last 7 days activity</p>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={engagementData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="4 6"
                  stroke={chartChrome.grid}
                  vertical={false}
                  strokeOpacity={isLight ? 1 : 0.9}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: chartChrome.tick, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: chartChrome.axisLine, strokeWidth: 1 }}
                  dy={6}
                />
                <YAxis
                  tick={{ fill: chartChrome.tick, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  content={<DashboardTooltip />}
                  cursor={{ stroke: chartChrome.cursor, strokeWidth: 1 }}
                  wrapperStyle={{ outline: "none" }}
                />
                <Line
                  type="monotone"
                  dataKey="likes"
                  name="likes"
                  stroke={COLORS.likes}
                  strokeWidth={isLight ? 2.25 : 2}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: isLight ? "#fff" : "#18191c", fill: COLORS.likes }}
                />
                <Line
                  type="monotone"
                  dataKey="comments"
                  name="comments"
                  stroke={COLORS.comments}
                  strokeWidth={isLight ? 2.25 : 2}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: isLight ? "#fff" : "#18191c", fill: COLORS.comments }}
                />
                <Line
                  type="monotone"
                  dataKey="shares"
                  name="shares"
                  stroke={COLORS.shares}
                  strokeWidth={isLight ? 2.25 : 2}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: isLight ? "#fff" : "#18191c", fill: COLORS.shares }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Credits Overview */}
        <Card className={dashboardCardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground">Credits Overview</CardTitle>
            <p className="text-sm text-muted-foreground">Earned vs Spent</p>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={creditsData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillEarned" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.earned} stopOpacity={isLight ? 0.35 : 0.45} />
                    <stop offset="100%" stopColor={COLORS.earned} stopOpacity={isLight ? 0.02 : 0.05} />
                  </linearGradient>
                  <linearGradient id="fillSpent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.spent} stopOpacity={isLight ? 0.32 : 0.42} />
                    <stop offset="100%" stopColor={COLORS.spent} stopOpacity={isLight ? 0.02 : 0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="4 6"
                  stroke={chartChrome.grid}
                  vertical={false}
                  strokeOpacity={isLight ? 1 : 0.9}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: chartChrome.tick, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: chartChrome.axisLine, strokeWidth: 1 }}
                  dy={6}
                />
                <YAxis
                  tick={{ fill: chartChrome.tick, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  content={<DashboardTooltip />}
                  cursor={{ stroke: chartChrome.cursor, strokeWidth: 1 }}
                  wrapperStyle={{ outline: "none" }}
                />
                <Area
                  type="monotone"
                  dataKey="earned"
                  name="earned"
                  stroke={COLORS.earned}
                  strokeWidth={isLight ? 1.75 : 2}
                  fill="url(#fillEarned)"
                  fillOpacity={1}
                />
                <Area
                  type="monotone"
                  dataKey="spent"
                  name="spent"
                  stroke={COLORS.spent}
                  strokeWidth={isLight ? 1.75 : 2}
                  fill="url(#fillSpent)"
                  fillOpacity={1}
                />
              </AreaChart>
            </ResponsiveContainer>
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
          <div className="space-y-4">
            {recentActivity.map((activity, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/35 dark:bg-card/40 dark:hover:bg-card/70"
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset ${
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
                  <div>
                    <p className="font-medium text-foreground">{activity.action}</p>
                    <p className="text-sm text-muted-foreground">{activity.post}</p>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">{activity.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}