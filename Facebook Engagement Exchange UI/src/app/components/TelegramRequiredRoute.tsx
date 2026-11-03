import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { Loader2 } from "lucide-react";
import { api } from "../services/api";

/**
 * After sign-in, users must link Telegram before using the main app.
 * Checks once on mount — does not refetch or block the whole UI on tab changes.
 */
export function TelegramRequiredRoute() {
  const location = useLocation();
  const [check, setCheck] = useState<"loading" | "linked" | "unlinked">("loading");

  useEffect(() => {
    let cancelled = false;
    api
      .getProfile()
      .then((res) => {
        if (cancelled) return;
        setCheck(res.user?.telegramUserId ? "linked" : "unlinked");
      })
      .catch(() => {
        // Do not send users to connect-telegram when /users/me fails (e.g. transient DB errors).
        if (!cancelled) setCheck("linked");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (check === "unlinked") {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/get-started?step=telegram&returnTo=${returnTo}`} replace state={{ from: location }} />;
  }
  if (check === "loading") {
    // Do not render (and fetch data for) app pages before we know Telegram is linked.
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  return <Outlet />;
}
