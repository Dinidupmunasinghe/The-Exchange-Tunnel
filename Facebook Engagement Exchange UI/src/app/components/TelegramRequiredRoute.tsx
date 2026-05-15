import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { Loader2 } from "lucide-react";
import { api } from "../services/api";

/**
 * After sign-in, users with an Exchange Tunnel account must link Telegram
 * before using the main app (dashboard, earn, etc.).
 */
export function TelegramRequiredRoute() {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [hasTelegram, setHasTelegram] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getProfile()
      .then((res) => {
        if (!cancelled) setHasTelegram(Boolean(res.user?.telegramUserId));
      })
      .catch(() => {
        if (!cancelled) setHasTelegram(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasTelegram) {
    return <Navigate to="/connect-telegram" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
