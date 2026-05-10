import { TrendingUp, TrendingDown, DollarSign, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const engagementData = [
  { date: "Jan 1", likes: 120, comments: 65, shares: 45, credits: 230 },
  { date: "Jan 8", likes: 145, comments: 78, shares: 52, credits: 275 },
  { date: "Jan 15", likes: 165, comments: 82, shares: 58, credits: 305 },
  { date: "Jan 22", likes: 185, comments: 95, shares: 68, credits: 348 },
  { date: "Jan 29", likes: 210, comments: 105, shares: 75, credits: 390 },
  { date: "Feb 5", likes: 235, comments: 115, shares: 82, credits: 432 },
  { date: "Feb 12", likes: 260, comments: 128, shares: 95, credits: 483 },
];

const campaignPerformance = [
  { name: "Product Launch", engagements: 412, credits: 300, roi: 137 },
  { name: "Summer Sale", engagements: 325, credits: 250, roi: 130 },
  { name: "Testimonials", engagements: 285, credits: 200, roi: 143 },
  { name: "Blog Promotion", engagements: 198, credits: 150, roi: 132 },
  { name: "Brand Awareness", engagements: 445, credits: 350, roi: 127 },
];

const engagementTypeData = [
  { name: "Likes", value: 45, color: "#10a37f" },
  { name: "Comments", value: 30, color: "#4444ff" },
  { name: "Shares", value: 25, color: "#f59e0b" },
];

const creditFlowData = [
  { month: "Sep", earned: 420, spent: 380 },
  { month: "Oct", earned: 450, spent: 410 },
  { month: "Nov", earned: 480, spent: 445 },
  { month: "Dec", earned: 520, spent: 480 },
  { month: "Jan", earned: 560, spent: 520 },
  { month: "Feb", earned: 590, spent: 555 },
  { month: "Mar", earned: 620, spent: 580 },
];

export function Analytics() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground mt-1">Track your performance and insights</p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Engagement</p>
                <p className="text-2xl font-bold text-foreground mt-1">3,847</p>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingUp className="h-3 w-3 text-primary" />
                  <span className="text-xs text-primary">+12.5%</span>
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Activity className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. ROI</p>
                <p className="text-2xl font-bold text-foreground mt-1">134%</p>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingUp className="h-3 w-3 text-primary" />
                  <span className="text-xs text-primary">+8.2%</span>
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10">
                <TrendingUp className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Credits Used</p>
                <p className="text-2xl font-bold text-foreground mt-1">2,380</p>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingUp className="h-3 w-3 text-orange-500" />
                  <span className="text-xs text-orange-500">+15.3%</span>
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/10">
                <DollarSign className="h-6 w-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Campaigns</p>
                <p className="text-2xl font-bold text-foreground mt-1">12</p>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingUp className="h-3 w-3 text-primary" />
                  <span className="text-xs text-primary">+2</span>
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
                <Activity className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="credits">Credits</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Engagement Growth */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Engagement Growth</CardTitle>
                <p className="text-sm text-muted-foreground">Weekly engagement trends</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={engagementData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                    <XAxis dataKey="date" stroke="#8e8ea0" />
                    <YAxis stroke="#8e8ea0" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1a1a1a",
                        border: "1px solid #2a2a2a",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "#ececec" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="likes"
                      stackId="1"
                      stroke="#10a37f"
                      fill="#10a37f"
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="comments"
                      stackId="1"
                      stroke="#4444ff"
                      fill="#4444ff"
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="shares"
                      stackId="1"
                      stroke="#f59e0b"
                      fill="#f59e0b"
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Engagement Distribution */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Engagement Distribution</CardTitle>
                <p className="text-sm text-muted-foreground">Breakdown by type</p>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={engagementTypeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {engagementTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1a1a1a",
                        border: "1px solid #2a2a2a",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Campaign Performance</CardTitle>
              <p className="text-sm text-muted-foreground">Compare campaign effectiveness</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={campaignPerformance}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                  <XAxis dataKey="name" stroke="#8e8ea0" />
                  <YAxis stroke="#8e8ea0" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a1a1a",
                      border: "1px solid #2a2a2a",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#ececec" }}
                  />
                  <Legend />
                  <Bar dataKey="engagements" fill="#10a37f" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="credits" fill="#4444ff" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Credits Tab */}
        <TabsContent value="credits">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Credits Flow</CardTitle>
              <p className="text-sm text-muted-foreground">Earned vs Spent over time</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={creditFlowData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                  <XAxis dataKey="month" stroke="#8e8ea0" />
                  <YAxis stroke="#8e8ea0" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a1a1a",
                      border: "1px solid #2a2a2a",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#ececec" }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="earned"
                    stroke="#10a37f"
                    strokeWidth={3}
                    dot={{ fill: "#10a37f", r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="spent"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ fill: "#ef4444", r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
