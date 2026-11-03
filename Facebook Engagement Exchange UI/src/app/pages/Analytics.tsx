import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Activity, Coins, Megaphone, RefreshCw, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { StatsCard } from "../components/StatsCard";
import { CreditsFlowChart, EngagementActivityChart, useChartTheme } from "../components/charts";
import { api, type UserAnalytics } from "../services/api";
import { cn } from "../components/ui/utils";
import { Callout, PageHeader, SegmentedControl, StatusBadge } from "../components/kit";

const PERIODS = [7, 30, 90] as const;

const cardClass = "";

const TYPE_LABELS: Record<string, string> = {
  subscribe: "Subscribes",
  like: "Likes",
  comment: "Comments",
  share: "Reposts",
};


function EngagementMix({ byType }: { byType: UserAnalytics["engagementsByType"] }) {
  const t = useChartTheme();
  const entries = (["subscribe", "like", "comment", "share"] as const).map((k, i) => ({
    key: k,
    label: TYPE_LABELS[k],
    value: byType[k] || 0,
    color: t.series[i],
  }));
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        You haven&apos;t completed any engagements yet.{" "}
        <Link to="/earn" className="font-medium text-primary underline-offset-2 hover:underline">
          Start earning
        </Link>
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {/* One stacked bar with a 2px gap between segments, then labelled rows (no color-only identity). */}
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {entries
          .filter((e) => e.value > 0)
          .map((e) => (
            <div key={e.key} style={{ width: `${(e.value / total) * 100}%`, background: e.color }} title={`${e.label}: ${e.value}`} />
          ))}
      </div>
      <ul className="space-y-2.5">
        {entries.map((e) => (
          <li key={e.key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: e.color }} />
              {e.label}
            </span>
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{e.value.toLocaleString()}</span>
              <span className="ml-2 text-muted-foreground">{Math.round((e.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Analytics() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [data, setData] = useState<UserAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (period: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getAnalytics(period));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const totals = data?.totals;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Your credit flow, the actions you completed and how your campaigns perform."
        actions={
          <SegmentedControl
            ariaLabel="Time range"
            value={days}
            onChange={(v) => setDays(v)}
            options={PERIODS.map((p) => ({ value: p, label: `${p} days` }))}
          />
        }
      />

      {error ? (
        <Callout
          tone="danger"
          title="Couldn’t load analytics"
          action={
            <Button variant="outline" size="sm" onClick={() => void load(days)} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Try again
            </Button>
          }
        >
          {error}
        </Callout>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Credits earned" value={loading && !totals ? "…" : (totals?.creditsEarned ?? 0).toLocaleString()} change="All time" icon={Coins} accent="emerald" />
        <StatsCard title="Credits spent" value={loading && !totals ? "…" : (totals?.creditsSpent ?? 0).toLocaleString()} change="Net of refunds" icon={Megaphone} accent="rose" />
        <StatsCard title="Engagements received" value={loading && !totals ? "…" : (totals?.engagementsReceived ?? 0).toLocaleString()} change={totals?.costPerEngagement ? `${totals.costPerEngagement} cr each` : "On your campaigns"} icon={Users} accent="blue" />
        <StatsCard title="Engagements done" value={loading && !totals ? "…" : (totals?.engagementsDone ?? 0).toLocaleString()} change="By you" icon={Activity} accent="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className={cardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground">Credit flow</CardTitle>
            <p className="text-sm text-muted-foreground">Credits earned from tasks vs. locked into campaigns, per day</p>
          </CardHeader>
          <CardContent className="pt-0">{data ? <CreditsFlowChart daily={data.daily} /> : <div className="h-[300px]" />}</CardContent>
        </Card>
        <Card className={cardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground">Engagement activity</CardTitle>
            <p className="text-sm text-muted-foreground">Actions you completed vs. actions your campaigns received</p>
          </CardHeader>
          <CardContent className="pt-0">{data ? <EngagementActivityChart daily={data.daily} /> : <div className="h-[300px]" />}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className={cardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground">What you engage with</CardTitle>
            <p className="text-sm text-muted-foreground">All-time engagements by type</p>
          </CardHeader>
          <CardContent>{data ? <EngagementMix byType={data.engagementsByType} /> : null}</CardContent>
        </Card>

        <Card className={cn(cardClass, "lg:col-span-2")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground">Campaign performance</CardTitle>
            <p className="text-sm text-muted-foreground">Progress and spend of your latest campaigns</p>
          </CardHeader>
          <CardContent>
            {!data || data.campaigns.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No campaigns yet.{" "}
                <Link to="/submit" className="font-medium text-primary underline-offset-2 hover:underline">
                  Launch your first campaign
                </Link>
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 font-medium">Campaign</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Progress</th>
                      <th className="pb-2 text-right font-medium">Spent / budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaigns.slice(0, 10).map((c) => (
                      <tr key={c.id} className="border-b border-border/60 last:border-0">
                        <td className="py-3 pr-3">
                          <p className="max-w-[220px] truncate font-medium text-foreground">{c.name}</p>
                          <p className="text-xs capitalize text-muted-foreground">{c.engagementType.replace("_", " + ")}</p>
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <Progress value={c.progress} className="h-1.5 w-28" />
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {c.completed}/{c.maxEngagements}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-right tabular-nums text-foreground">
                          {c.creditsSpent.toLocaleString()} <span className="text-muted-foreground">/ {c.budget.toLocaleString()}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
