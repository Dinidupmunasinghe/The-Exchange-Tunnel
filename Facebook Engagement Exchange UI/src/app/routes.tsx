import { Navigate, createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminProtectedRoute } from "./components/AdminProtectedRoute";
import { AdminLayout } from "./components/AdminLayout";
import { Dashboard } from "./pages/Dashboard";
import { EarnCredits } from "./pages/EarnCredits";
import { SubmitPost } from "./pages/SubmitPost";
import { Campaigns } from "./pages/Campaigns";
import { RepostRequests } from "./pages/RepostRequests";
import { Analytics } from "./pages/Analytics";
import { Wallet } from "./pages/Wallet";
import { Settings } from "./pages/Settings";
import { AdminLogin } from "./pages/AdminLogin";
import { NotFound } from "./pages/NotFound";
import { Login } from "./pages/Login";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { DataDeletion } from "./pages/DataDeletion";
import { AdminOverview } from "./pages/admin/Overview";
import { AdminUsers } from "./pages/admin/Users";
import { AdminUserDetails } from "./pages/admin/UserDetails";
import { AdminCredits } from "./pages/admin/Credits";
import { AdminTransactions } from "./pages/admin/Transactions";
import { AdminPendingRefunds } from "./pages/admin/PendingRefunds";
import { AdminRewards } from "./pages/admin/Rewards";
import { AdminRepostPricing } from "./pages/admin/RepostPricing";
import { AdminPackages } from "./pages/admin/Packages";
import { AdminCampaigns } from "./pages/admin/Campaigns";
import { AdminCampaignDetails } from "./pages/admin/CampaignDetails";
import { AdminTasks } from "./pages/admin/Tasks";
import { AdminEngagements } from "./pages/admin/Engagements";
import { AdminTelegram } from "./pages/admin/Telegram";
import { AdminAuditLogs } from "./pages/admin/AuditLogs";

export const router = createBrowserRouter([
  { path: "/login", Component: Login },
  { path: "/admin", Component: AdminLogin },
  {
    path: "/admin",
    Component: AdminProtectedRoute,
    children: [
      {
        Component: AdminLayout,
        children: [
          {
            path: "dashboard",
            children: [
              { index: true, element: <Navigate to="overview" replace /> },
              { path: "overview", Component: AdminOverview },
              { path: "users", Component: AdminUsers },
              { path: "users/:id", Component: AdminUserDetails },
              { path: "credits", Component: AdminCredits },
              { path: "transactions", Component: AdminTransactions },
              { path: "pending-refunds", Component: AdminPendingRefunds },
              { path: "rewards", Component: AdminRewards },
              { path: "repost-pricing", Component: AdminRepostPricing },
              { path: "packages", Component: AdminPackages },
              { path: "campaigns", Component: AdminCampaigns },
              { path: "campaigns/:id", Component: AdminCampaignDetails },
              { path: "tasks", Component: AdminTasks },
              { path: "engagements", Component: AdminEngagements },
              { path: "telegram", Component: AdminTelegram },
              { path: "audit-logs", Component: AdminAuditLogs }
            ]
          }
        ]
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
          { path: "repost", Component: RepostRequests },
          { path: "analytics", Component: Analytics },
          { path: "wallet", Component: Wallet },
          { path: "settings", Component: Settings },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
]);