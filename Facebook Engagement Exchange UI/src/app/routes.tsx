import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminProtectedRoute } from "./components/AdminProtectedRoute";
import { AdminLayout } from "./components/AdminLayout";
import { Dashboard } from "./pages/Dashboard";
import { EarnCredits } from "./pages/EarnCredits";
import { SubmitPost } from "./pages/SubmitPost";
import { Campaigns } from "./pages/Campaigns";
import { Analytics } from "./pages/Analytics";
import { Wallet } from "./pages/Wallet";
import { Settings } from "./pages/Settings";
import { Admin } from "./pages/Admin";
import { AdminLogin } from "./pages/AdminLogin";
import { NotFound } from "./pages/NotFound";
import { Login } from "./pages/Login";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { DataDeletion } from "./pages/DataDeletion";

export const router = createBrowserRouter([
  { path: "/login", Component: Login },
  { path: "/admin", Component: AdminLogin },
  {
    path: "/admin",
    Component: AdminProtectedRoute,
    children: [
      {
        Component: AdminLayout,
        children: [{ path: "dashboard", Component: Admin }]
      }
    ]
  },
  { path: "/privacy-policy", Component: PrivacyPolicy },
  { path: "/data-deletion", Component: DataDeletion },
  {
    path: "/",
    Component: ProtectedRoute,
    children: [
      {
        Component: Layout,
        children: [
          { index: true, Component: Dashboard },
          { path: "earn", Component: EarnCredits },
          { path: "submit", Component: SubmitPost },
          { path: "campaigns", Component: Campaigns },
          { path: "analytics", Component: Analytics },
          { path: "wallet", Component: Wallet },
          { path: "settings", Component: Settings },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
]);