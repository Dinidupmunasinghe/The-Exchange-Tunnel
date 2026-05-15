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
import { LoginTelegram } from "./pages/LoginTelegram";
import { ConnectTelegram } from "./pages/ConnectTelegram";
import { TelegramRequiredRoute } from "./components/TelegramRequiredRoute";
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
import { Landing } from "./pages/Landing";

export const router = createBrowserRouter([
  { path: "/login", Component: Login },
  { path: "/login/telegram", Component: LoginTelegram },
  {
    path: "/admin",
    children: [
      { index: true, Component: AdminLogin },
      {
        Component: AdminProtectedRoute,
        children: [
          {
            path: "dashboard",
            Component: AdminLayout,
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
    children: [
      { index: true, Component: Landing },
      {
        Component: ProtectedRoute,
        children: [
          { path: "connect-telegram", Component: ConnectTelegram },
          {
            Component: TelegramRequiredRoute,
            children: [
          {
            Component: Layout,
            children: [
              { path: "dashboard", Component: Dashboard },
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
        ],
      },
    ],
  },
]);