import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { EmptyTableRow, FormError, FormMessage, PageHeader, Paginator, StatusPill, Toolbar, formatDateTime } from "./_shared";

type Campaign = {
  id: number;
  name: string;
  engagementType: string;
  status: "pending" | "active" | "paused" | "completed";
  creditsPerEngagement: number;
  maxEngagements: number;
  completedTasks?: number;
  createdAt: string;
  owner?: { id: number; email: string; name: string | null; telegramUserId: string | null };
};

type Pag = { page: number; limit: number; total: number; totalPages: number };

export function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pagination, setPagination] = useState<Pag | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminListCampaigns({
        query: query.trim() || undefined,
        status: status || undefined,
        ownerId: ownerId.trim() ? Number(ownerId.trim()) : undefined,
        page,
        limit: 25
      });
      setCampaigns((res.campaigns || []) as Campaign[]);
      setPagination(res.pagination as Pag);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [page, query, status, ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function moderate(c: Campaign, action: "pause" | "resume" | "cancel") {
    setError(null);
    setMessage(null);
    try {
      const res = await api.adminUpdateCampaign(c.id, { action });
      setMessage(res.message || "Campaign updated");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update campaign");
    }
  }

  async function remove(c: Campaign) {
    if (
      !confirm(
        `Delete campaign "${c.name}"? Unused budget will be refunded to the owner. This cannot be undone.`
      )
    )
      return;
    setError(null);
    setMessage(null);
    try {
      const res = await api.adminDeleteCampaign(c.id);
      setMessage(`Campaign deleted. Refunded ${res.refundedCredits} credits to the owner.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete campaign");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Moderate every campaign — pause, resume, cancel, or delete with budget refund."
      />
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toolbar>
            <div className="min-w-[220px] flex-1">
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by campaign name"
              />
            </div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Any status</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
            <Input
              value={ownerId}
              onChange={(e) => {
                setOwnerId(e.target.value);
                setPage(1);
              }}
              placeholder="Owner user ID"
              className="w-32"
            />
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </Toolbar>
          <FormError error={error} />
          <FormMessage message={message} />
          <div className="max-h-[65vh] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border">
                <tr>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">Campaign</th>
                  <th className="px-3 py-2 text-left">Owner</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Slots</th>
                  <th className="px-3 py-2 text-left">Cost / slot</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs">{c.id}</td>
                    <td className="px-3 py-2">
                      <Link className="font-medium text-foreground hover:underline" to={`/admin/dashboard/campaigns/${c.id}`}>
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{c.owner?.email || "—"}</td>
                    <td className="px-3 py-2 text-xs">{c.engagementType}</td>
                    <td className="px-3 py-2">
                      <StatusPill value={c.status} />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {c.completedTasks ?? 0} / {c.maxEngagements}
                    </td>
                    <td className="px-3 py-2 text-xs">{c.creditsPerEngagement}</td>
                    <td className="px-3 py-2 text-xs">{formatDateTime(c.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {c.status !== "paused" && c.status !== "completed" && (
                          <Button size="sm" variant="outline" onClick={() => void moderate(c, "pause")}>
                            Pause
                          </Button>
                        )}
                        {c.status === "paused" && (
                          <Button size="sm" variant="outline" onClick={() => void moderate(c, "resume")}>
                            Resume
                          </Button>
                        )}
                        {c.status !== "completed" && (
                          <Button size="sm" variant="outline" onClick={() => void moderate(c, "cancel")}>
                            Cancel
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => void remove(c)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {campaigns.length === 0 && <EmptyTableRow message="No campaigns" colSpan={9} />}
              </tbody>
            </table>
          </div>
          <Paginator pagination={pagination} onChange={setPage} disabled={loading} />
        </CardContent>
      </Card>
    </div>
  );
}
