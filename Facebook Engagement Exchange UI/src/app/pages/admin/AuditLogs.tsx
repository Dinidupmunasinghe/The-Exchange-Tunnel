import { Fragment, useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { EmptyTableRow, FormError, PageHeader, Paginator, Toolbar, formatDateTime } from "./_shared";

type LogRow = {
  id: number;
  adminEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  payload: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

type Pag = { page: number; limit: number; total: number; totalPages: number };

export function AdminAuditLogs() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [pagination, setPagination] = useState<Pag | null>(null);
  const [page, setPage] = useState(1);
  const [adminEmail, setAdminEmail] = useState("");
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminListAuditLogs({
        adminEmail: adminEmail.trim() || undefined,
        action: action.trim() || undefined,
        page,
        limit: 50
      });
      setLogs((res.logs || []) as LogRow[]);
      setPagination(res.pagination as Pag);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [page, adminEmail, action]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Every admin write action is captured with who, what, when, and where."
      />
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toolbar>
            <Input
              value={adminEmail}
              onChange={(e) => {
                setAdminEmail(e.target.value);
                setPage(1);
              }}
              placeholder="Admin email"
              className="w-56"
            />
            <Input
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              placeholder="Action contains…"
              className="w-56"
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
                  <th className="px-3 py-2 text-left">Admin</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Target</th>
                  <th className="px-3 py-2 text-left">IP</th>
                  <th className="px-3 py-2 text-left">Payload</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr className="border-t border-border">
                      <td className="px-3 py-2 text-xs">{formatDateTime(log.createdAt)}</td>
                      <td className="px-3 py-2 text-xs">{log.adminEmail}</td>
                      <td className="px-3 py-2 text-xs">{log.action}</td>
                      <td className="px-3 py-2 text-xs">
                        {log.targetType ? `${log.targetType}#${log.targetId || "?"}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">{log.ip || "—"}</td>
                      <td className="px-3 py-2">
                        {log.payload ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenRow(openRow === log.id ? null : log.id)}
                          >
                            {openRow === log.id ? "Hide" : "Show"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                    {openRow === log.id && log.payload && (
                      <tr className="border-t border-border bg-secondary/20">
                        <td colSpan={6} className="px-3 py-3">
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background p-3 text-xs text-muted-foreground">
                            {log.payload}
                          </pre>
                          {log.userAgent && (
                            <p className="mt-2 text-xs text-muted-foreground">UA: {log.userAgent}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {logs.length === 0 && <EmptyTableRow message="No audit log entries" colSpan={6} />}
              </tbody>
            </table>
          </div>
          <Paginator pagination={pagination} onChange={setPage} disabled={loading} />
        </CardContent>
      </Card>
    </div>
  );
}
