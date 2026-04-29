import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { FormError, FormMessage, PageHeader, formatDateTime } from "./_shared";

type Health = {
  botConfigured: boolean;
  botName: string | null;
  mtprotoConfigured: boolean;
  mtprotoApiIdConfigured: boolean;
  mtprotoApiHashConfigured: boolean;
  pythonBinary: string;
  webhookSecretConfigured: boolean;
  lastAuditRuns: Record<string, { ranAt: string; result: any } | null>;
};

const AUDIT_KINDS: {
  kind: "all" | "subscribe" | "subscribeMemory" | "like" | "comment" | "commentMembership" | "share";
  label: string;
}[] = [
  { kind: "all", label: "Run all audits" },
  { kind: "subscribe", label: "Subscribe audit" },
  { kind: "subscribeMemory", label: "Subscription memory cleanup" },
  { kind: "like", label: "Like audit" },
  { kind: "comment", label: "Comment deletion audit" },
  { kind: "commentMembership", label: "Comment membership audit" },
  { kind: "share", label: "Repost deletion audit" }
];

function YesNo({ value }: { value: boolean }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${value ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-rose-500/40 bg-rose-500/10 text-rose-300"}`}>
      {value ? "Yes" : "No"}
    </span>
  );
}

export function AdminTelegram() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminGetTelegramHealth();
      setHealth(res as Health);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Telegram health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(
    kind: "all" | "subscribe" | "subscribeMemory" | "like" | "comment" | "commentMembership" | "share"
  ) {
    setRunning(kind);
    setError(null);
    setMessage(null);
    try {
      const res = await api.adminRunTelegramAudits(kind);
      setMessage(res.message || `Audit ${kind} complete`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Telegram Health & Audits"
        description="Verify Telegram integration configuration and trigger audit jobs on demand."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />
      <FormError error={error} />
      <FormMessage message={message} />

      {health ? (
        <>
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Bot configured</p>
                <YesNo value={health.botConfigured} />
                {health.botName ? (
                  <p className="mt-1 text-xs text-muted-foreground">@{health.botName}</p>
                ) : null}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Webhook secret</p>
                <YesNo value={health.webhookSecretConfigured} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">MTProto user-bridge</p>
                <YesNo value={health.mtprotoConfigured} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">MTProto API ID</p>
                <YesNo value={health.mtprotoApiIdConfigured} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">MTProto API Hash</p>
                <YesNo value={health.mtprotoApiHashConfigured} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Python binary</p>
                <p className="font-medium">{health.pythonBinary || "python"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Run audits manually</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {AUDIT_KINDS.map((a) => (
                  <Button
                    key={a.kind}
                    size="sm"
                    variant={a.kind === "all" ? "default" : "outline"}
                    disabled={running !== null}
                    onClick={() => void run(a.kind)}
                  >
                    {running === a.kind ? `Running ${a.label}…` : a.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Audits scan Telegram for unsubscribed users, deleted comments, removed reactions, etc., and reverse
                rewards or refund campaign budgets accordingly. Last run timestamps shown below.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Last audit runs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[55vh] overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-card text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border">
                    <tr>
                      <th className="px-3 py-2 text-left">Audit</th>
                      <th className="px-3 py-2 text-left">Last run</th>
                      <th className="px-3 py-2 text-left">Result summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(health.lastAuditRuns).map(([kind, run]) => (
                      <tr key={kind} className="border-t border-border">
                        <td className="px-3 py-2 text-xs">{kind}</td>
                        <td className="px-3 py-2 text-xs">{run ? formatDateTime(run.ranAt) : "Never"}</td>
                        <td className="px-3 py-2 text-xs">
                          <code className="rounded bg-secondary/40 px-1 py-0.5">{run ? JSON.stringify(run.result) : "—"}</code>
                        </td>
                      </tr>
                    ))}
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
