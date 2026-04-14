import { useEffect, useMemo, useState } from "react";
import { TrendingUp, ThumbsUp, MessageCircle, Share2, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { StatsCard } from "../components/StatsCard";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../services/api";

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
  { action: "Earned 10 credits", post: "SoundCloud Promotion Tips 2024", time: "2 min ago", type: "like" },
  { action: "Campaign started", post: "Product Launch Announcement", time: "15 min ago", type: "campaign" },
  { action: "Earned 15 credits", post: "Social Media Strategy Guide", time: "1 hour ago", type: "comment" },
  { action: "Earned 20 credits", post: "Growth Hacking Techniques", time: "2 hours ago", type: "share" },
];

export function Dashboard() {
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
        icon: TrendingUp,
        trend: "up" as const
      },
      {
        title: "Credits Earned (30d)",
        value: String(dashboard?.creditsEarned30d ?? 0),
        change: "live",
        icon: Activity,
        trend: "up" as const
      },
      {
        title: "Active Campaigns",
        value: String(dashboard?.activeCampaigns ?? 0),
        change: "live",
        icon: ThumbsUp,
        trend: "up" as const
      },
      {
        title: "Credits Spent (30d)",
        value: String(dashboard?.creditsSpent30d ?? 0),
        change: "live",
        icon: MessageCircle,
        trend: "up" as const
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

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatsCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Engagement Trends */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Engagement Trends</CardTitle>
            <p className="text-sm text-muted-foreground">Last 7 days activity</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={engagementData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="name" stroke="#8e8ea0" />
                <YAxis stroke="#8e8ea0" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px' }}
                  labelStyle={{ color: '#ececec' }}
                />
                <Line type="monotone" dataKey="likes" stroke="#10a37f" strokeWidth={2} />
                <Line type="monotone" dataKey="comments" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="shares" stroke="#8b5cf6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Credits Overview */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Credits Overview</CardTitle>
            <p className="text-sm text-muted-foreground">Earned vs Spent</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={creditsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="name" stroke="#8e8ea0" />
                <YAxis stroke="#8e8ea0" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px' }}
                  labelStyle={{ color: '#ececec' }}
                />
                <Area type="monotone" dataKey="earned" stroke="#10a37f" fill="#10a37f" fillOpacity={0.2} />
                <Area type="monotone" dataKey="spent" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Recent Activity</CardTitle>
          <p className="text-sm text-muted-foreground">Your latest interactions</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentActivity.map((activity, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4 transition-colors hover:bg-secondary/50"
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    activity.type === 'like' ? 'bg-primary/10' :
                    activity.type === 'comment' ? 'bg-blue-500/10' :
                    activity.type === 'share' ? 'bg-purple-500/10' :
                    'bg-orange-500/10'
                  }`}>
                    {activity.type === 'like' && <ThumbsUp className="h-5 w-5 text-primary" />}
                    {activity.type === 'comment' && <MessageCircle className="h-5 w-5 text-blue-500" />}
                    {activity.type === 'share' && <Share2 className="h-5 w-5 text-purple-500" />}
                    {activity.type === 'campaign' && <Activity className="h-5 w-5 text-orange-500" />}
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