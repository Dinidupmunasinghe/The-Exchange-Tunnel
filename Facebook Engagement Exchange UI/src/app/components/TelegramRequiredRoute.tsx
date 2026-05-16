import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
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
    return <Navigate to="/connect-telegram" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
