import { Navigate, Outlet, useLocation } from "react-router";
import { getToken, isAccessTokenValid } from "../services/api";

/**
 * Wrapper for all authenticated app routes. Sends guests to /login and remembers where they
 * were going so they land there after signing in.
 */
export function ProtectedRoute() {
  const location = useLocation();
  if (!isAccessTokenValid(getToken())) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }
  return <Outlet />;
}
