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
    <aside className="flex h-full w-60 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground dark:shadow-[0_0_20px_-4px_rgba(59,130,246,0.55)]">
            <Waypoints className="h-4 w-4" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Exchange Tunnel
          </span>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-0.5">
          {navigation.map((item) => {
            const isActive = isLinkActive(item.href);
            const Icon = item.icon;

            return (
              <div key={item.name}>
                <Link
                  to={item.href}
                  onClick={onClose}
                  className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-foreground font-semibold dark:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)]"
                      : "text-muted-foreground font-medium hover:bg-sidebar-accent/60 hover:text-foreground"
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
                  <div className="mt-0.5 ml-4 space-y-0.5 border-l border-sidebar-border pl-3">
                    {item.children.map((child) => {
                      const childActive = isLinkActive(child.href);
                      return (
                        <Link
                          key={child.name}
                          to={child.href}
                          onClick={onClose}
                          className={`block rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors ${
                            childActive
                              ? "bg-sidebar-accent text-foreground font-semibold dark:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)]"
                              : "text-muted-foreground font-medium hover:bg-sidebar-accent/60 hover:text-foreground"
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
      <div className="border-t border-sidebar-border p-3">
        <Link
          to="/settings"
          onClick={onClose}
          className="flex items-center gap-3 rounded-md px-2.5 py-2 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          <LifeBuoy className="h-4 w-4" />
          <span>Help & support</span>
        </Link>
      </div>
    </aside>
  );
}
