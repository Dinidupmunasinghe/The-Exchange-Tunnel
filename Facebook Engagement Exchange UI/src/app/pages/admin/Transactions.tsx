import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { EmptyTableRow, FormError, PageHeader, Paginator, StatusPill, Toolbar, formatDateTime } from "./_shared";

type Tx = {
  id: number;
  userId: number;
  type: "earn" | "spend";
  amount: number;
  reason: string;
  createdAt: string;
  referenceType?: string | null;
  referenceId?: number | string | null;
  user?: { id: number; email: string; name?: string | null };
};

type Pag = { page: number; limit: number; total: number; totalPages: number };

export function AdminTransactions() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [pagination, setPagination] = useState<Pag | null>(null);
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState("");
  const [type, setType] = useState<"" | "earn" | "spend">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminListTransactions({
        page,
        limit: 50,
        userId: userId.trim() ? Number(userId.trim()) : undefined,
        type: type || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined
      });
      setTransactions((res.transactions || []) as Tx[]);
      setPagination(res.pagination as Pag);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [page, userId, type, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" description="Filter every credit movement on the platform." />
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toolbar>
            <Input
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
              placeholder="User ID"
              className="w-32"
            />
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as "" | "earn" | "spend");
                setPage(1);
              }}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Any type</option>
              <option value="earn">Earn</option>
              <option value="spend">Spend</option>
            </select>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="w-40"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="w-40"
            />
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </Toolbar>
          <FormError error={error} />
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Amount</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Ref</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-border">
                    <td className="px-3 py-2 text-xs">{formatDateTime(tx.createdAt)}</td>
                    <td className="px-3 py-2">{tx.user?.email || `User #${tx.userId}`}</td>
                    <td className="px-3 py-2">
                      <StatusPill value={tx.type === "earn" ? "active" : "cancelled"} />
                    </td>
                    <td className={`px-3 py-2 font-medium ${tx.amount < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                      {tx.amount}
                    </td>
                    <td className="px-3 py-2 text-xs">{tx.reason}</td>
                    <td className="px-3 py-2 text-xs">
                      {tx.referenceType ? `${tx.referenceType}#${tx.referenceId ?? ""}` : "—"}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && <EmptyTableRow message="No transactions found" colSpan={6} />}
              </tbody>
            </table>
          </div>
          <Paginator pagination={pagination} onChange={setPage} disabled={loading} />
        </CardContent>
      </Card>
    </div>
  );
}
