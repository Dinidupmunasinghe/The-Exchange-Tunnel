import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { EmptyTableRow, FormError, FormMessage, PageHeader, Paginator, StatusPill, Toolbar, formatDateTime } from "./_shared";

type Refund = {
  id: number;
  workerUserId: number;
  ownerUserId: number;
  amountRemaining: number;
  amountInitial: number;
  status: "pending" | "settled";
  reason: string;
  createdAt: string;
  settledAt: string | null;
  worker?: { id: number; email: string; name: string | null };
  owner?: { id: number; email: string; name: string | null };
};

type Pag = { page: number; limit: number; total: number; totalPages: number };

export function AdminPendingRefunds() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [pagination, setPagination] = useState<Pag | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"pending" | "settled" | "">("pending");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminListPendingRefunds({
        status: status || undefined,
        page,
        limit: 50
      });
      setRefunds((res.refunds || []) as Refund[]);
      setPagination(res.pagination as Pag);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending refunds");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(id: number) {
    setError(null);
    setMessage(null);
    try {
      const res = await api.adminCancelPendingRefund(id);
      setMessage(res.message || "Pending refund cancelled");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel refund");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pending Refunds"
        description="Outstanding worker debt that gets repaid the next time they earn. Override only if you know what you are doing."
      />
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Refund queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toolbar>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as any);
                setPage(1);
              }}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">All</option>
              <option value="pending">Pending only</option>
              <option value="settled">Settled only</option>
            </select>
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
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Worker</th>
                  <th className="px-3 py-2 text-left">Owner</th>
                  <th className="px-3 py-2 text-left">Initial</th>
                  <th className="px-3 py-2 text-left">Remaining</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs">{formatDateTime(r.createdAt)}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.worker?.email || `User #${r.workerUserId}`}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.owner?.email || `User #${r.ownerUserId}`}
                    </td>
                    <td className="px-3 py-2">{r.amountInitial}</td>
                    <td className="px-3 py-2 font-medium text-amber-300">{r.amountRemaining}</td>
                    <td className="px-3 py-2">
                      <StatusPill value={r.status} />
                    </td>
                    <td className="px-3 py-2 text-xs">{r.reason}</td>
                    <td className="px-3 py-2">
                      {r.status === "pending" ? (
                        <Button size="sm" variant="outline" onClick={() => void cancel(r.id)}>
                          Cancel
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {refunds.length === 0 && <EmptyTableRow message="No refunds in this view" colSpan={8} />}
              </tbody>
            </table>
          </div>
          <Paginator pagination={pagination} onChange={setPage} disabled={loading} />
        </CardContent>
      </Card>
    </div>
  );
}
