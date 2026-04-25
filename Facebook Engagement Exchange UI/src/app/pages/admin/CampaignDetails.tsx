import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { EmptyTableRow, FormError, FormMessage, PageHeader, StatusPill, formatDateTime } from "./_shared";

type Detail = {
  campaign: any;
  engagements: any[];
};

export function AdminCampaignDetails() {
  const { id } = useParams();
  const cid = Number(id);
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(cid) || cid < 1) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminGetCampaignDetails(cid);
      setData(res as Detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [cid]);

  useEffect(() => {
    void load();
  }, [load]);

  async function moderate(action: "pause" | "resume" | "cancel") {
    setError(null);
    setMessage(null);
    try {
      const res = await api.adminUpdateCampaign(cid, { action });
      setMessage(res.message || "Campaign updated");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function cancelTask(taskId: number) {
    if (!confirm(`Cancel task #${taskId}? The slot will be refunded to the campaign owner if not yet completed.`))
      return;
    setError(null);
    setMessage(null);
    try {
      const res = await api.adminCancelTask(taskId);
      setMessage(`Task cancelled. Refunded ${res.refundedCredits} credits.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function reverseEngagement(eid: number) {
    if (!confirm(`Reverse engagement #${eid}? Worker credits will be reclaimed and slot reopened.`)) return;
    setError(null);
    setMessage(null);
    try {
      const res = await api.adminReverseEngagement(eid);
      setMessage(`Engagement reversed. Reclaimed ${res.collectedCredits} credits.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function remove() {
    if (!confirm("Delete this campaign? Unused budget will be refunded to the owner.")) return;
    setError(null);
    setMessage(null);
    try {
      const res = await api.adminDeleteCampaign(cid);
      setMessage(`Campaign deleted. Refunded ${res.refundedCredits} credits to the owner.`);
      setTimeout(() => {
        window.location.href = "/admin/dashboard/campaigns";
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!Number.isInteger(cid) || cid < 1) {
    return <p className="text-sm text-muted-foreground">Invalid campaign id.</p>;
  }

  const c = data?.campaign;

  return (
    <div className="space-y-6">
      <PageHeader
        title={c ? `Campaign #${c.id}` : "Campaign"}
        description={c ? c.name : ""}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/dashboard/campaigns">Back to campaigns</Link>
          </Button>
        }
      />
      <FormError error={error} />
      <FormMessage message={message} />

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-3 text-xs">
                  <span>
                    Status: <StatusPill value={c.status} />
                  </span>
                  <span>Type: {c.engagementType}</span>
                  <span>Cost / slot: {c.creditsPerEngagement}</span>
                  <span>Slots: {c.maxEngagements}</span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Owner</p>
                  <p className="font-medium">
                    {c.owner ? (
                      <Link className="hover:underline" to={`/admin/dashboard/users/${c.owner.id}`}>
                        {c.owner.email}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Channel / Post</p>
                  <p className="text-xs">{c.channelUrl || c.messageUrl || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-xs">{formatDateTime(c.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {c.status !== "paused" && c.status !== "completed" && (
                    <Button variant="outline" size="sm" onClick={() => void moderate("pause")}>
                      Pause
                    </Button>
                  )}
                  {c.status === "paused" && (
                    <Button variant="outline" size="sm" onClick={() => void moderate("resume")}>
                      Resume
                    </Button>
                  )}
                  {c.status !== "completed" && (
                    <Button variant="outline" size="sm" onClick={() => void moderate("cancel")}>
                      Cancel
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => void remove()}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>Tasks ({c.tasks?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">ID</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Assignee</th>
                        <th className="px-3 py-2 text-left">Reward</th>
                        <th className="px-3 py-2 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(c.tasks || []).map((t: any) => (
                        <tr key={t.id} className="border-t border-border">
                          <td className="px-3 py-2 text-xs">{t.id}</td>
                          <td className="px-3 py-2">
                            <StatusPill value={t.status} />
                          </td>
                          <td className="px-3 py-2 text-xs">{t.assignee?.email || "—"}</td>
                          <td className="px-3 py-2 text-xs">{t.rewardCredits}</td>
                          <td className="px-3 py-2">
                            {t.status !== "cancelled" && (
                              <Button size="sm" variant="outline" onClick={() => void cancelTask(t.id)}>
                                Cancel
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {(!c.tasks || c.tasks.length === 0) && (
                        <EmptyTableRow message="No tasks" colSpan={5} />
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Engagements ({data.engagements.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">ID</th>
                      <th className="px-3 py-2 text-left">When</th>
                      <th className="px-3 py-2 text-left">Worker</th>
                      <th className="px-3 py-2 text-left">Action</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.engagements.map((e: any) => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="px-3 py-2 text-xs">{e.id}</td>
                        <td className="px-3 py-2 text-xs">{formatDateTime(e.createdAt)}</td>
                        <td className="px-3 py-2 text-xs">{e.user?.email || `User #${e.userId}`}</td>
                        <td className="px-3 py-2 text-xs">{e.actionKind || e.engagementType}</td>
                        <td className="px-3 py-2">
                          <StatusPill value={e.verificationStatus} />
                        </td>
                        <td className="px-3 py-2">
                          <Button size="sm" variant="outline" onClick={() => void reverseEngagement(e.id)}>
                            Reverse
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {data.engagements.length === 0 && <EmptyTableRow message="No engagements" colSpan={6} />}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{loading ? "Loading…" : "No data"}</p>
      )}
    </div>
  );
}
