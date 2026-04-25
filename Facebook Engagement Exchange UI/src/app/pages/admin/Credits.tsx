import { FormEvent, useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { EmptyTableRow, FormError, FormMessage, PageHeader, Toolbar } from "./_shared";

type User = { id: number; email: string; name: string | null; credits: number; isActive: boolean };

export function AdminCredits() {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminListUsers({ query: search || undefined, limit: 25 });
      setUsers((res.users || []) as User[]);
      if (!selected && res.users && res.users.length > 0) setSelected(res.users[0] as User);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [search, selected]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected) {
      setError("Select a user first");
      return;
    }
    const n = Number(amount);
    if (!Number.isInteger(n) || n === 0) {
      setError("Amount must be a non-zero integer");
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.adminAdjustCredits({ userId: selected.id, amount: n, reason: reason.trim() });
      setMessage(res.message || "Credits adjusted");
      setAmount("");
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to adjust credits");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Adjustments"
        description="Add or remove credits from any user with a reason for the audit trail."
      />
      <FormError error={error} />
      <FormMessage message={message} />

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Find user</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toolbar>
            <div className="min-w-[260px] flex-1">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by email, name or Telegram ID"
              />
            </div>
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Search"}
            </Button>
          </Toolbar>
          <div className="max-h-72 overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border">
                <tr>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Credits</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className={`cursor-pointer border-t border-border ${
                      selected?.id === u.id ? "bg-brand/10" : "hover:bg-secondary/30"
                    }`}
                    onClick={() => setSelected(u)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{u.name || "Unnamed"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-3 py-2">{u.credits}</td>
                    <td className="px-3 py-2 text-xs">{u.isActive ? "Active" : "Blocked"}</td>
                  </tr>
                ))}
                {users.length === 0 && <EmptyTableRow message="No users found" colSpan={3} />}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Adjust Credits</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={handleSubmit}>
            <Input value={selected?.email || ""} disabled />
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (e.g. 50 or -50)" />
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audit trail)" />
            <div className="md:col-span-3">
              <Button type="submit" disabled={submitting || !selected}>
                {submitting ? "Updating…" : "Apply Credit Adjustment"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
