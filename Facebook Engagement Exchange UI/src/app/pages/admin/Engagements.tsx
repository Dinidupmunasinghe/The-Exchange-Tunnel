import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { EmptyTableRow, FormError, FormMessage, PageHeader, Paginator, StatusPill, Toolbar, formatDateTime } from "./_shared";

type Engagement = {
  id: number;
  campaignId: number;
  taskId: number;
  userId: number;
  engagementType: string;
  actionKind: string | null;
  verificationStatus: string;
  createdAt: string;
  user?: { id: number; email: string; name: string | null };
  campaign?: { id: number; name: string; engagementType: string; status: string; userId: number };
  task?: { id: number; rewardCredits: number; status: string };
};

type Pag = { page: number; limit: number; total: number; totalPages: number };

export function AdminEngagements() {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [pagination, setPagination] = useState<Pag | null>(null);
  const [page, setPage] = useState(1);
  const [campaignId, setCampaignId] = useState("");
  const [userId, setUserId] = useState("");
  const [actionKind, setActionKind] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminListEngagements({
        campaignId: campaignId.trim() ? Number(campaignId.trim()) : undefined,
        userId: userId.trim() ? Number(userId.trim()) : undefined,
        actionKind: actionKind || undefined,
        page,
        limit: 50
      });
      setEngagements((res.engagements || []) as Engagement[]);
      setPagination(res.pagination as Pag);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load engagements");
    } finally {
      setLoading(false);
    }
  }, [page, campaignId, userId, actionKind]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reverse(e: Engagement) {
    if (
      !confirm(
        `Reverse engagement #${e.id}? Worker credits will be reclaimed and the slot reopened for someone else.`
      )
    )
      return;
    setError(null);
    setMessage(null);
    try {
      const res = await api.adminReverseEngagement(e.id);
      setMessage(`Engagement reversed. Reclaimed ${res.collectedCredits} credits.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Engagements"
        description="Audit every recorded engagement and reverse fraudulent ones."
      />
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toolbar>
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
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
              placeholder="Worker user ID"
              className="w-40"
            />
            <select
              value={actionKind}
              onChange={(e) => {
                setActionKind(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Any action</option>
              <option value="like">Like</option>
              <option value="comment">Comment</option>
              <option value="share">Share</option>
              <option value="subscribe">Subscribe</option>
            </select>
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
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Worker</th>
                  <th className="px-3 py-2 text-left">Campaign</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Reward</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {engagements.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs">{e.id}</td>
                    <td className="px-3 py-2 text-xs">{formatDateTime(e.createdAt)}</td>
                    <td className="px-3 py-2 text-xs">{e.user?.email || `User #${e.userId}`}</td>
                    <td className="px-3 py-2 text-xs">
                      <Link className="hover:underline" to={`/admin/dashboard/campaigns/${e.campaignId}`}>
                        #{e.campaignId} {e.campaign?.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{e.actionKind || e.engagementType}</td>
                    <td className="px-3 py-2 text-xs">{e.task?.rewardCredits ?? "—"}</td>
                    <td className="px-3 py-2">
                      <StatusPill value={e.verificationStatus} />
                    </td>
                    <td className="px-3 py-2">
                      <Button size="sm" variant="outline" onClick={() => void reverse(e)}>
                        Reverse
                      </Button>
                    </td>
                  </tr>
                ))}
                {engagements.length === 0 && <EmptyTableRow message="No engagements" colSpan={8} />}
              </tbody>
            </table>
          </div>
          <Paginator pagination={pagination} onChange={setPage} disabled={loading} />
        </CardContent>
      </Card>
    </div>
  );
}
