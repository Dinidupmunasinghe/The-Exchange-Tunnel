import { Navigate, Outlet } from "react-router";
import { getAdminToken, isAccessTokenValid } from "../services/api";

export function AdminProtectedRoute() {
  const token = getAdminToken();
  if (!token || !isAccessTokenValid(token)) {
    return <Navigate to="/admin" replace />;
  }
  return <Outlet />;
}
