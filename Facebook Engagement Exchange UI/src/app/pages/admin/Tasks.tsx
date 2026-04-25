import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { EmptyTableRow, FormError, FormMessage, PageHeader, Paginator, StatusPill, Toolbar, formatDateTime } from "./_shared";

type Task = {
  id: number;
  campaignId: number;
  status: "open" | "assigned" | "completed" | "cancelled";
  rewardCredits: number;
  assignedAt: string | null;
  completedAt: string | null;
  campaign?: { id: number; name: string; engagementType: string; status: string };
  assignee?: { id: number; email: string; name: string | null } | null;
};

type Pag = { page: number; limit: number; total: number; totalPages: number };

export function AdminTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pagination, setPagination] = useState<Pag | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminListTasks({
        status: status || undefined,
        campaignId: campaignId.trim() ? Number(campaignId.trim()) : undefined,
        assignedUserId: assignedUserId.trim() ? Number(assignedUserId.trim()) : undefined,
        page,
        limit: 50
      });
      setTasks((res.tasks || []) as Task[]);
      setPagination(res.pagination as Pag);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [page, status, campaignId, assignedUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(t: Task) {
    if (!confirm(`Cancel task #${t.id}? Refund the slot to the campaign owner if it is still open.`)) return;
    setError(null);
    setMessage(null);
    try {
      const res = await api.adminCancelTask(t.id);
      setMessage(`Task cancelled. Refunded ${res.refundedCredits} credits to owner.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Tasks" description="Cancel stuck tasks and inspect assignment history." />
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toolbar>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Any status</option>
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <Input
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                setPage(1);
              }}
              placeholder="Campaign ID"
              className="w-32"
            />
            <Input
              value={assignedUserId}
              onChange={(e) => {
                setAssignedUserId(e.target.value);
                setPage(1);
              }}
              placeholder="Assignee user ID"
              className="w-40"
            />
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </Toolbar>
          <FormError error={error} />
          <FormMessage message={message} />
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">Campaign</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Assignee</th>
                  <th className="px-3 py-2 text-left">Reward</th>
                  <th className="px-3 py-2 text-left">Assigned</th>
                  <th className="px-3 py-2 text-left">Completed</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs">{t.id}</td>
                    <td className="px-3 py-2 text-xs">
                      <Link className="hover:underline" to={`/admin/dashboard/campaigns/${t.campaignId}`}>
                        #{t.campaignId} {t.campaign?.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill value={t.status} />
                    </td>
                    <td className="px-3 py-2 text-xs">{t.assignee?.email || "—"}</td>
                    <td className="px-3 py-2 text-xs">{t.rewardCredits}</td>
                    <td className="px-3 py-2 text-xs">{formatDateTime(t.assignedAt)}</td>
                    <td className="px-3 py-2 text-xs">{formatDateTime(t.completedAt)}</td>
                    <td className="px-3 py-2">
                      {t.status !== "cancelled" && (
                        <Button size="sm" variant="outline" onClick={() => void cancel(t)}>
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {tasks.length === 0 && <EmptyTableRow message="No tasks" colSpan={8} />}
              </tbody>
            </table>
          </div>
          <Paginator pagination={pagination} onChange={setPage} disabled={loading} />
        </CardContent>
      </Card>
    </div>
  );
}
