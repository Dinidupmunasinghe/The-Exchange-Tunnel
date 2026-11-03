import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { api } from "../services/api";

export function CheckoutSuccess() {
  const [status, setStatus] = useState<"waiting" | "active" | "error">("waiting");
  const [planName, setPlanName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      try {
        const res = await api.getMySubscription();
        if (cancelled) return;
        if (res.subscription?.isPaid && res.subscription.status === "active") {
          setPlanName(res.package?.name || res.subscription.packageName || "your plan");
          setStatus("active");
          return;
        }
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }
      attempts += 1;
      if (attempts < 12) {
        window.setTimeout(poll, 2500);
      } else if (!cancelled) {
        setStatus("error");
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-6 py-12 text-center">
      {status === "active" ? (
        <>
          <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
          <h1 className="text-2xl font-bold text-foreground">Subscription active</h1>
          <p className="text-muted-foreground">
            You are now on {planName}. Credits will appear in your wallet shortly.
          </p>
          <Button asChild>
            <Link to="/wallet">Go to wallet</Link>
          </Button>
        </>
      ) : status === "waiting" ? (
        <>
          <h1 className="text-2xl font-bold text-foreground">Confirming payment…</h1>
          <p className="text-muted-foreground">Please wait while we activate your subscription.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-foreground">Still processing</h1>
          <p className="text-muted-foreground">
            PayPal may take a minute. Check your wallet or refresh in a moment.
          </p>
          <Button asChild variant="outline">
            <Link to="/wallet">Open wallet</Link>
          </Button>
        </>
      )}
    </div>
  );
}
