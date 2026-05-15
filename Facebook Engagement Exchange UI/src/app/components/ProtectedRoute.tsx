import { Navigate, Outlet } from "react-router";
import { getToken, isAccessTokenValid } from "../services/api";

/**
 * Wrapper for all authenticated app routes. Sends guests to /login.
 */
export function ProtectedRoute() {
  if (!isAccessTokenValid(getToken())) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
