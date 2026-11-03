import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { api } from "../services/api";

const MAX_ATTEMPTS = 12;
const INTERVAL_MS = 2500;

/**
 * PayPal returns here with ?subscription_id=… . We confirm that exact subscription with the
 * server (which asks PayPal directly), so success never reflects an older plan and the plan
 * activates even if the webhook is late.
 */
export function CheckoutSuccess() {
  const [params] = useSearchParams();
  const subscriptionId = params.get("subscription_id") || params.get("subscriptionId") || "";
  const expectedPackageId = Number(params.get("packageId")) || null;
  const [status, setStatus] = useState<"waiting" | "active" | "error">("waiting");
  const [planName, setPlanName] = useState("");
  const [credits, setCredits] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        if (subscriptionId) {
          const res = await api.confirmSubscription(subscriptionId);
          if (cancelled) return;
          if (res.active) {
            setPlanName(res.subscription?.packageName || "your new plan");
            setCredits(res.creditsGranted);
            setStatus("active");
            return;
          }
        } else {
          const res = await api.getMySubscription();
          if (cancelled) return;
          const s = res.subscription;
          if (s?.isPaid && s.status === "active" && (!expectedPackageId || s.packageId === expectedPackageId)) {
            setPlanName(res.package?.name || s.packageName || "your plan");
            setStatus("active");
            return;
          }
        }
      } catch (e) {
        if (cancelled) return;
        setMessage(e instanceof Error ? e.message : null);
      }
      if (attempts < MAX_ATTEMPTS) {
        timer = window.setTimeout(poll, INTERVAL_MS);
      } else {
        setStatus("error");
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [subscriptionId, expectedPackageId]);

  return (
    <div className="mx-auto max-w-lg space-y-6 py-12 text-center">
      {status === "active" ? (
        <>
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <h1 className="text-2xl font-bold text-foreground">Subscription active</h1>
          <p className="text-muted-foreground">
            You are now on {planName}.{" "}
            {credits > 0
              ? `${credits.toLocaleString()} credits were added to your wallet.`
              : "Your plan credits are added as soon as PayPal confirms the payment."}
          </p>
          <div className="flex justify-center gap-2">
            <Button asChild>
              <Link to="/wallet">Go to wallet</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/submit">Launch a campaign</Link>
            </Button>
          </div>
        </>
      ) : status === "waiting" ? (
        <>
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Confirming your payment…</h1>
          <p className="text-muted-foreground">This usually takes a few seconds. Please keep this page open.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-foreground">Still processing</h1>
          <p className="text-muted-foreground">
            PayPal hasn&apos;t confirmed the payment yet. It can take a few minutes — your plan activates
            automatically once it does. {message ? `(${message})` : ""}
          </p>
          <Button asChild variant="outline">
            <Link to="/wallet">Open wallet</Link>
          </Button>
        </>
      )}
    </div>
  );
}
