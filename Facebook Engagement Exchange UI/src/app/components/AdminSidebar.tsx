import { Link, useLocation } from "react-router";
import { LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { api } from "../services/api";

const navigation = [{ name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard }];

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
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                active ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-brand/10 hover:text-brand"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
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
