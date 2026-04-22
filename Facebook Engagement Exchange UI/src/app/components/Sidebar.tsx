import { Link, useLocation } from "react-router";
import { 
  LayoutDashboard, 
  Sparkles, 
  Upload, 
  FolderOpen, 
  BarChart3, 
  Wallet, 
  Settings,
  Waypoints,
  X
} from "lucide-react";
import { Button } from "./ui/button";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Earn Credits", href: "/earn", icon: Sparkles },
  { name: "Launch Campaigns", href: "/submit", icon: Upload },
  { name: "My Campaigns", href: "/campaigns", icon: FolderOpen },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Wallet", href: "/wallet", icon: Wallet },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-border px-6">
        <div className="group/logo flex cursor-default items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand shadow-md shadow-brand/25 transition-transform group-hover/logo:scale-105">
            <Waypoints className="h-6 w-6 text-brand-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground transition-colors group-hover/logo:text-brand">
              Exchange Tunnel
            </h1>
            <p className="text-xs text-muted-foreground">Connect. Exchange. Grow.</p>
          </div>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="lg:hidden"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const current = `${location.pathname}${location.hash}`;
          const isActive = item.href.includes("#") ? current === item.href : location.pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              to={item.href}
              onClick={onClose}
              className={`
                group/nav flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all
                ${isActive 
                  ? 'bg-brand text-brand-foreground shadow-lg shadow-brand/25' 
                  : 'text-muted-foreground hover:bg-brand/10 hover:text-brand'
                }
              `}
            >
              <Icon
                className={`h-5 w-5 transition-colors ${isActive ? "text-brand-foreground" : "group-hover/nav:text-brand"}`}
              />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-4">
        <div className="rounded-lg bg-secondary/50 p-3">
          <p className="text-sm font-medium text-foreground">Need Help?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Chat with our support team
          </p>
        </div>
      </div>
    </aside>
  );
}