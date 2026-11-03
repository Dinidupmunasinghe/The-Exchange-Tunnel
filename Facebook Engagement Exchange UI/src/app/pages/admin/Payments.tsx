import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { api } from "../../services/api";
import { FormError, PageHeader } from "./_shared";

export function AdminPayments() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.adminListPayments>> | null>(null);
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof api.adminGetPaymentSettings>> | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [payments, paymentSettings] = await Promise.all([
        api.adminListPayments(),
        api.adminGetPaymentSettings()
      ]);
      setData(payments);
      setSettings(paymentSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="PayPal subscriptions, webhook events, and connection status."
      />
      <FormError error={error} />

      {settings ? (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>PayPal configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Mode: <span className="font-medium">{settings.paypalMode}</span> · Configured:{" "}
              {settings.paypalConfigured ? "Yes" : "No"}
            </p>
            <p className="text-muted-foreground">Return URL base: {settings.frontendUrl}</p>
            <p className="text-muted-foreground">
              Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID on the backend (Render).
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {data?.subscriptions?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4">User</th>
                  <th className="pb-2 pr-4">Plan</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">PayPal sub</th>
                </tr>
              </thead>
              <tbody>
                {data.subscriptions.map((s) => (
                  <tr key={s.id} className="border-b border-border/60">
                    <td className="py-2 pr-4">{s.userEmail || s.userId}</td>
                    <td className="py-2 pr-4">{s.packageName}</td>
                    <td className="py-2 pr-4">{s.status}</td>
                    <td className="py-2 font-mono text-xs">{s.paypalSubscriptionId || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Recent webhook events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data?.recentEvents?.length ? (
            data.recentEvents.map((e) => (
              <div key={e.id} className="rounded border border-border px-3 py-2 text-xs">
                <span className="font-medium">{e.eventType}</span>
                {e.processedAt ? " · processed" : " · pending"}
                {e.error ? <span className="text-destructive"> · {e.error}</span> : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
