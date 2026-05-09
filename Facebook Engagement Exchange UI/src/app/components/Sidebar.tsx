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
  X,
  Repeat2,
  LifeBuoy
} from "lucide-react";
import { Button } from "./ui/button";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Earn Credits", href: "/earn", icon: Sparkles },
  { name: "Launch Campaigns", href: "/submit", icon: Upload },
  { name: "My Campaigns", href: "/campaigns", icon: FolderOpen },
  {
    name: "Request Repost",
    href: "/repost",
    icon: Repeat2,
    children: [
      { name: "Send Request", href: "/repost?tab=send" },
      { name: "Received Requests", href: "/repost?tab=received" },
      { name: "Sent Requests", href: "/repost?tab=sent" }
    ]
  },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Wallet", href: "/wallet", icon: Wallet },
  { name: "Settings", href: "/settings", icon: Settings }
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation();
  const current = `${location.pathname}${location.search}${location.hash}`;

  function isLinkActive(href: string): boolean {
    if (href.includes("?")) return current === href;
    return location.pathname === href;
  }

  return (
    <aside className="flex h-full w-64 flex-col overflow-hidden border-r border-border bg-sidebar">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Waypoints className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Exchange Tunnel
          </span>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        <div className="space-y-0.5">
          {navigation.map((item) => {
            const isActive = isLinkActive(item.href);
            const Icon = item.icon;

            return (
              <div key={item.name}>
                <Link
                  to={item.href}
                  onClick={onClose}
                  className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  />
                  <span className="truncate">{item.name}</span>
                </Link>

                {item.children && location.pathname === "/repost" ? (
                  <div className="mt-0.5 space-y-0.5 border-l border-border/80 pl-3 ml-4">
                    {item.children.map((child) => {
                      const childActive = isLinkActive(child.href);
                      return (
                        <Link
                          key={child.name}
                          to={child.href}
                          onClick={onClose}
                          className={`block rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                            childActive
                              ? "bg-accent text-foreground font-medium"
                              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                          }`}
                        >
                          {child.name}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <Link
          to="/settings"
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <LifeBuoy className="h-4 w-4" />
          <span>Help & support</span>
        </Link>
      </div>
    </aside>
  );
}
