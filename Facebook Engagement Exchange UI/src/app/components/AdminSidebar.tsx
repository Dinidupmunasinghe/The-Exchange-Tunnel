import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Users,
  Coins,
  Receipt,
  Undo2,
  Sparkles,
  Package,
  Megaphone,
  ListChecks,
  Activity,
  Send,
  History
} from "lucide-react";
import { Button } from "./ui/button";
import { api } from "../services/api";

type NavItem = { name: string; href: string; icon: typeof LayoutDashboard };
type NavGroup = { title: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    title: "Operations",
    items: [
      { name: "Overview", href: "/admin/dashboard/overview", icon: LayoutDashboard },
      { name: "Campaigns", href: "/admin/dashboard/campaigns", icon: Megaphone },
      { name: "Tasks", href: "/admin/dashboard/tasks", icon: ListChecks },
      { name: "Engagements", href: "/admin/dashboard/engagements", icon: Activity }
    ]
  },
  {
    title: "Finance",
    items: [
      { name: "Credit Adjust", href: "/admin/dashboard/credits", icon: Coins },
      { name: "Transactions", href: "/admin/dashboard/transactions", icon: Receipt },
      { name: "Pending Refunds", href: "/admin/dashboard/pending-refunds", icon: Undo2 },
      { name: "Rewards", href: "/admin/dashboard/rewards", icon: Sparkles },
      { name: "Packages", href: "/admin/dashboard/packages", icon: Package }
    ]
  },
  {
    title: "Users",
    items: [{ name: "Users", href: "/admin/dashboard/users", icon: Users }]
  },
  {
    title: "System",
    items: [
      { name: "Telegram", href: "/admin/dashboard/telegram", icon: Send },
      { name: "Audit Logs", href: "/admin/dashboard/audit-logs", icon: History }
    ]
  }
];

export function AdminSidebar() {
  const location = useLocation();

  async function handleLogout() {
    try {
      await api.adminLogout();
    } catch {
      // ignore network errors and force logout UX.
    }
    window.location.href = "/admin";
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-brand-foreground">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Exchange Admin</h1>
          <p className="text-xs text-muted-foreground">Control Center</p>
        </div>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto p-4">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active =
                location.pathname === item.href ||
                (item.href !== "/admin/dashboard" && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-brand text-brand-foreground"
                      : "text-muted-foreground hover:bg-brand/10 hover:text-brand"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-4">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={() => void handleLogout()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </div>
    </aside>
  );
}
