import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { EmptyTableRow, FormError, FormMessage, PageHeader, Paginator, StatusPill, Toolbar, formatDateTime } from "./_shared";

type User = {
  id: number;
  email: string;
  name: string | null;
  telegramUserId: string | null;
  telegramActingChannelTitle: string | null;
  credits: number;
  isActive: boolean;
  createdAt: string;
};

type Pagination = { page: number; limit: number; total: number; totalPages: number };

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminListUsers({ query: query || undefined, page, limit: 25 });
      setUsers(res.users || []);
      setPagination(res.pagination as Pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = status
    ? users.filter((u) => (status === "active" ? u.isActive : !u.isActive))
    : users;

  async function toggleBlock(u: User) {
    setMessage(null);
    setError(null);
    try {
      if (u.isActive) await api.adminBlockUser(u.id);
      else await api.adminUnblockUser(u.id);
      setMessage(u.isActive ? "User blocked" : "User unblocked");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function clearSession(u: User) {
    setMessage(null);
    setError(null);
    try {
      await api.adminClearMtprotoSession(u.id);
      setMessage("Telegram user session cleared");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Search, edit, block/unblock and manage user sessions."
      />
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Search & filter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toolbar>
            <div className="min-w-[260px] flex-1">
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by email, name or Telegram ID"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Any status</option>
              <option value="active">Active only</option>
              <option value="blocked">Blocked only</option>
            </select>
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </Button>
          </Toolbar>
          <FormError error={error} />
          <FormMessage message={message} />
          <div className="max-h-[65vh] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border">
                <tr>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Telegram</th>
                  <th className="px-3 py-2 text-left">Channel</th>
                  <th className="px-3 py-2 text-left">Credits</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Joined</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{u.name || "Unnamed"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{u.telegramUserId || "—"}</td>
                    <td className="px-3 py-2 text-xs">{u.telegramActingChannelTitle || "—"}</td>
                    <td className="px-3 py-2">{u.credits}</td>
                    <td className="px-3 py-2">
                      <StatusPill value={u.isActive ? "active" : "blocked"} />
                    </td>
                    <td className="px-3 py-2 text-xs">{formatDateTime(u.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/admin/dashboard/users/${u.id}`}>Open</Link>
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void toggleBlock(u)}>
                          {u.isActive ? "Block" : "Unblock"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void clearSession(u)}>
                          Clear TG session
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <EmptyTableRow message="No users match this filter" colSpan={7} />}
              </tbody>
            </table>
          </div>
          <Paginator pagination={pagination} onChange={setPage} disabled={loading} />
        </CardContent>
      </Card>
    </div>
  );
}
