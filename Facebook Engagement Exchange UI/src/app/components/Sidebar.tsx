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
  Repeat2
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
  { name: "Settings", href: "/settings", icon: Settings },
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
    <aside className="flex h-full w-64 flex-col overflow-hidden border-r border-border bg-card">
      {/* Logo */}
      <div className="mx-4 mt-4 flex items-center justify-between rounded-xl border border-border bg-background/60 px-4 py-3">
        <div className="group/logo flex cursor-default items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand shadow-md shadow-brand/25 transition-transform group-hover/logo:scale-105">
            <Waypoints className="h-6 w-6 text-brand-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate whitespace-nowrap text-base font-semibold tracking-tight text-foreground transition-colors group-hover/logo:text-brand">
              Exchange Tunnel
            </h1>
            <p className="truncate text-[11px] font-medium text-muted-foreground">Connect. Exchange. Grow.</p>
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
      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-3 [scrollbar-color:#52525b_#09090b] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-600 [&::-webkit-scrollbar-thumb:hover]:bg-zinc-500 [&::-webkit-scrollbar-track]:bg-zinc-950/80 [&::-webkit-scrollbar]:w-2">
        {navigation.map((item) => {
          const isActive = isLinkActive(item.href);
          const Icon = item.icon;

          return (
            <div key={item.name}>
              <Link
                to={item.href}
                onClick={onClose}
                className={`
                  group/nav flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all
                  ${isActive
                    ? "bg-brand text-brand-foreground shadow-lg shadow-brand/25"
                    : "text-muted-foreground hover:bg-brand/10 hover:text-brand"
                  }
                `}
              >
                <Icon
                  className={`h-5 w-5 transition-colors ${isActive ? "text-brand-foreground" : "group-hover/nav:text-brand"}`}
                />
                <span className="font-medium">{item.name}</span>
              </Link>
              {item.children && location.pathname === "/repost" ? (
                <div className="mt-1 space-y-1 pl-10">
                  {item.children.map((child) => {
                    const childActive = isLinkActive(child.href);
                    return (
                      <Link
                        key={child.name}
                        to={child.href}
                        onClick={onClose}
                        className={`block rounded-md px-2 py-1.5 text-xs transition ${
                          childActive
                            ? "bg-brand/20 text-brand"
                            : "text-muted-foreground hover:bg-brand/10 hover:text-brand"
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