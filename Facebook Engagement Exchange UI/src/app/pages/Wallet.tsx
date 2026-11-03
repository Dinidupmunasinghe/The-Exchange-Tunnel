import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { TrendingUp, TrendingDown, Clock, Sparkles, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { api } from "../services/api";
import { WalletPackageCard } from "../components/WalletPackageCard";
import type { PublicCreditPackage } from "../lib/creditPackages";
import { packageCta } from "../lib/packageCheckout";

type Subscription = Awaited<ReturnType<typeof api.getMySubscription>>;

function txLabel(t: { reason?: string; referenceType?: string }) {
  const reason = String(t.reason || "").trim();
  if (reason) return reason;
  return t.referenceType === "campaign" ? "Campaign" : "Credit activity";
}

export function Wallet() {
  const navigate = useNavigate();
  const plansRef = useRef<HTMLDivElement | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [packages, setPackages] = useState<PublicCreditPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [totals, setTotals] = useState<{ earned: number; spent: number } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const loadAccount = useCallback(async () => {
    const [tx, profile, subscription, analytics] = await Promise.all([
      api.getTransactions(),
      api.getProfile(),
      api.getMySubscription().catch(() => null),
      api.getAnalytics(7).catch(() => null),
    ]);
    setTransactions(Array.isArray(tx.transactions) ? tx.transactions : []);
    setBalance(profile.user.credits || 0);
    setSub(subscription);
    if (analytics) {
      setTotals({ earned: analytics.totals.creditsEarned, spent: analytics.totals.creditsSpent });
    }
  }, []);

  useEffect(() => {
    loadAccount().catch((e) => toast.error(e instanceof Error ? e.message : "Could not load your wallet"));
    api
      .getPublicPackages()
      .then((res) => setPackages(Array.isArray(res.packages) ? res.packages : []))
      .catch(() => setPackages([]))
      .finally(() => setPackagesLoading(false));
  }, [loadAccount]);

  const current = sub?.subscription;
  const isPaid = Boolean(current?.isPaid);
  const currentPackageId = sub?.package?.id ?? current?.packageId ?? null;
  const planName = sub?.package?.name || sub?.usage?.planName || "Free";
  const periodEnd = current?.currentPeriodEnd ? new Date(current.currentPeriodEnd) : null;

  async function cancelPlan() {
    setCancelling(true);
    try {
      const res = await api.cancelMySubscription();
      toast.success(res.message);
      setConfirmCancel(false);
      await loadAccount();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel subscription");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Wallet</h1>
          <p className="mt-1 text-muted-foreground">Your credits, plan and transaction history</p>
        </div>
        <Button type="button" onClick={() => plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          <Sparkles className="mr-2 h-4 w-4" />
          {isPaid ? "Change plan" : "Upgrade plan"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-gradient-to-br from-primary/20 to-primary/5">
          <CardContent className="p-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Available balance</p>
              <p className="text-4xl font-bold text-primary tabular-nums">{balance.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">credits</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm text-muted-foreground">Earned from tasks</p>
              </div>
              <p className="text-3xl font-bold text-foreground tabular-nums">{totals ? totals.earned.toLocaleString() : "…"}</p>
              <p className="text-xs text-muted-foreground">All time</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-orange-500" />
                <p className="text-sm text-muted-foreground">Spent on campaigns</p>
              </div>
              <p className="text-3xl font-bold text-foreground tabular-nums">{totals ? totals.spent.toLocaleString() : "…"}</p>
              <p className="text-xs text-muted-foreground">All time, net of refunds</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current plan */}
      <Card className="border-border bg-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Current plan</p>
            <p className="text-xl font-semibold text-foreground">{planName}</p>
            {isPaid && periodEnd ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                {current?.cancelAtPeriodEnd
                  ? `Cancelled — active until ${periodEnd.toLocaleDateString()}`
                  : `Renews on ${periodEnd.toLocaleDateString()}`}
              </p>
            ) : sub?.usage?.isOnFreePlan && sub.usage.freeCreditCap != null ? (
              <p className="text-sm text-muted-foreground">
                {sub.usage.lifetimeCreditsSpent.toLocaleString()} of {sub.usage.freeCreditCap.toLocaleString()} free-plan
                campaign credits used
              </p>
            ) : null}
          </div>
          {isPaid && !current?.cancelAtPeriodEnd ? (
            <Button variant="outline" onClick={() => setConfirmCancel(true)}>
              Cancel subscription
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div ref={plansRef} className="scroll-mt-24">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Plans</CardTitle>
            <p className="text-sm text-muted-foreground">
              Paid plans add credits every billing period. Payments are handled securely by PayPal.
            </p>
          </CardHeader>
          <CardContent>
            {packagesLoading ? (
              <p className="text-sm text-muted-foreground">Loading plans…</p>
            ) : packages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No plans available right now.</p>
            ) : (
              <div
                className={`grid gap-4 pt-3 ${
                  packages.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : packages.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"
                }`}
              >
                {packages.map((pkg) => {
                  const cta = packageCta(pkg, { currentPackageId, currentIsPaid: isPaid, signedIn: true });
                  return (
                    <WalletPackageCard
                      key={pkg.id}
                      pkg={pkg}
                      isCurrent={currentPackageId === pkg.id}
                      ctaLabel={cta.label}
                      ctaDisabled={cta.disabled}
                      onBuy={() => navigate(cta.href)}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Transaction history</CardTitle>
          <p className="text-sm text-muted-foreground">Your latest 100 credit movements</p>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction) => {
                const earn = transaction.type === "earn";
                return (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-4 transition-colors hover:bg-secondary/50"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${earn ? "bg-primary/10" : "bg-orange-500/10"}`}>
                        {earn ? <TrendingUp className="h-5 w-5 text-primary" /> : <TrendingDown className="h-5 w-5 text-orange-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{txLabel(transaction)}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(transaction.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-lg font-bold tabular-nums ${earn ? "text-primary" : "text-orange-500"}`}>
                        {transaction.amount > 0 ? "+" : ""}
                        {transaction.amount}
                      </p>
                      <p className="text-xs text-muted-foreground">credits</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your {planName} plan?</AlertDialogTitle>
            <AlertDialogDescription>
              PayPal will stop billing you.{" "}
              {periodEnd ? `You keep your plan until ${periodEnd.toLocaleDateString()}, then` : "You"} move to the free plan.
              Credits you already have stay in your wallet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep plan</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                void cancelPlan();
              }}
            >
              {cancelling ? "Cancelling…" : "Cancel subscription"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
