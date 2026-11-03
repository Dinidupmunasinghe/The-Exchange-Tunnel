import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { api } from "../services/api";
import { normalizePublicPackage, type PublicCreditPackage } from "../lib/creditPackages";

export function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const packageId = Number(params.get("packageId"));
  const [pkg, setPkg] = useState<PublicCreditPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(packageId) || packageId < 1) {
      setError("Invalid package");
      setLoading(false);
      return;
    }
    api
      .getPublicPackages()
      .then((res) => {
        const found = (res.packages || []).find((p) => p.id === packageId);
        setPkg(found ? normalizePublicPackage(found) : null);
        if (!found) setError("Package not found");
        else if (found.isFree) setError("This plan is free — no checkout needed");
      })
      .catch(() => setError("Could not load package"))
      .finally(() => setLoading(false));
  }, [packageId]);

  async function startPayPal() {
    if (!pkg) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createPayPalSubscription(pkg.id);
      if (res.approvalUrl) {
        window.location.href = res.approvalUrl;
        return;
      }
      setError("PayPal did not return an approval URL");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start PayPal checkout");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="p-6 text-muted-foreground">Loading checkout…</p>;
  }

  if (!pkg) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-destructive">{error || "Package unavailable"}</p>
        <Button type="button" variant="outline" onClick={() => navigate("/wallet")}>
          Back to wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Subscribe to {pkg.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{pkg.tagline}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <p className="text-3xl font-bold text-foreground">
              {pkg.priceLabel}
              <span className="text-base font-normal text-muted-foreground"> {pkg.pricePeriod}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pkg.credits.toLocaleString()} credits per billing period
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            You will be redirected to PayPal to approve a recurring subscription. Credits are added after
            each payment is confirmed. If you are switching plans, your previous paid plan is cancelled
            automatically. You can cancel anytime from your wallet.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            {pkg.isFree ? (
              <Button type="button" className="flex-1" onClick={() => navigate("/earn")}>
                Start earning
              </Button>
            ) : (
              <Button type="button" className="flex-1" disabled={submitting} onClick={() => void startPayPal()}>
                {submitting ? "Redirecting…" : "Continue to PayPal"}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => navigate("/wallet")}>
              Cancel
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/wallet" className="text-primary hover:underline">
              Back to wallet
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
