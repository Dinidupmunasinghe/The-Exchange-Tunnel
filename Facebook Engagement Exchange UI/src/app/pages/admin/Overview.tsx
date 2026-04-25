import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { FormError, PageHeader, formatDateTime } from "./_shared";

type OverviewData = {
  users: { total: number; active: number; blocked: number };
  campaigns: { total: number; active: number; paused: number; completed: number };
  tasks: { total: number; open: number; completed: number };
  engagements: { total: number; last24h: number };
  pendingRefunds: { count: number; amountRemaining: number };
  credits: { circulating: number };
  packages: { total: number; active: number };
};

type AuditRow = {
  id: number;
  adminEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
};

function StatCard({ title, value, hint }: { title: string; value: string | number; hint?: string }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function AdminOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminGetOverview();
      setData((res as any).overview as OverviewData);
      setAudit(((res as any).recentAuditLogs || []) as AuditRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Platform-wide KPIs and the latest admin activity."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />
      <FormError error={error} />

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total Users" value={data.users.total} hint={`${data.users.active} active · ${data.users.blocked} blocked`} />
            <StatCard
              title="Campaigns"
              value={data.campaigns.total}
              hint={`${data.campaigns.active} active · ${data.campaigns.paused} paused · ${data.campaigns.completed} done`}
            />
            <StatCard title="Tasks" value={data.tasks.total} hint={`${data.tasks.open} open · ${data.tasks.completed} done`} />
            <StatCard title="Engagements" value={data.engagements.total} hint={`${data.engagements.last24h} in last 24h`} />
            <StatCard
              title="Credits in circulation"
              value={data.credits.circulating}
              hint="Sum of user balances"
            />
            <StatCard
              title="Pending Refund Debt"
              value={data.pendingRefunds.amountRemaining}
              hint={`${data.pendingRefunds.count} open record(s)`}
            />
            <StatCard title="Credit Packages" value={data.packages.total} hint={`${data.packages.active} active`} />
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Recent Admin Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[55vh] overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-card text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border">
                    <tr>
                      <th className="px-3 py-2 text-left">When</th>
                      <th className="px-3 py-2 text-left">Admin</th>
                      <th className="px-3 py-2 text-left">Action</th>
                      <th className="px-3 py-2 text-left">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((a) => (
                      <tr key={a.id} className="border-t border-border">
                        <td className="px-3 py-2">{formatDateTime(a.createdAt)}</td>
                        <td className="px-3 py-2">{a.adminEmail}</td>
                        <td className="px-3 py-2">{a.action}</td>
                        <td className="px-3 py-2">{a.targetType ? `${a.targetType}#${a.targetId || "?"}` : "—"}</td>
                      </tr>
                    ))}
                    {audit.length === 0 && (
                      <tr>
                        <td className="px-3 py-6 text-center text-sm text-muted-foreground" colSpan={4}>
                          No recent admin activity.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{loading ? "Loading overview…" : "No data"}</p>
      )}
    </div>
  );
}
