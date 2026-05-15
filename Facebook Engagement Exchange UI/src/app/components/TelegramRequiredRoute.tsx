import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { api } from "../services/api";

/**
 * After sign-in, users must link Telegram before using the main app.
 * Checks once on mount — does not refetch or block the whole UI on tab changes.
 */
export function TelegramRequiredRoute() {
  const location = useLocation();
  const [checked, setChecked] = useState(false);
  const [hasTelegram, setHasTelegram] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getProfile()
      .then((res) => {
        if (!cancelled) setHasTelegram(Boolean(res.user?.telegramUserId));
      })
      .catch(() => {
        if (!cancelled) setHasTelegram(false);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (checked && !hasTelegram) {
    return <Navigate to="/connect-telegram" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
