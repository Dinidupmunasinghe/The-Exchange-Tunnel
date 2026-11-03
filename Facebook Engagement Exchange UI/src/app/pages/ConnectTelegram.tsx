import { Navigate, useLocation, useSearchParams } from "react-router";
import { safeReturnPath } from "../lib/returnPath";

/** Kept for old links: Telegram linking now lives in the setup wizard. */
export function ConnectTelegram() {
  const [params] = useSearchParams();
  const location = useLocation();
  const fromState = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const returnTo =
    safeReturnPath(params.get("returnTo")) ??
    (fromState?.pathname ? safeReturnPath(`${fromState.pathname}${fromState.search || ""}`) : null);
  const qs = new URLSearchParams({ step: "telegram" });
  if (params.get("welcome") === "1") qs.set("welcome", "1");
  if (returnTo) qs.set("returnTo", returnTo);
  return <Navigate to={`/get-started?${qs.toString()}`} replace />;
}
