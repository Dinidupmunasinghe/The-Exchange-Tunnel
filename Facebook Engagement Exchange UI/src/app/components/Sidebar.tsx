import { Link, useLocation, useNavigate } from "react-router";
import {
  BarChart3,
  Coins,
  FolderOpen,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Repeat2,
  Rocket,
  Settings,
  Sparkles,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { cn } from "./ui/utils";
import { Logo } from "./kit";
import { clearToken } from "../services/api";
import { prefetchEarnFeed } from "../lib/prefetchEarnFeed";
import { resetSetup, setupHref, useSetupStatus } from "../lib/setupStatus";

type NavItem = { name: string; href: string; icon: LucideIcon; hint?: string };

const GROUPS: { label?: string; items: NavItem[] }[] = [
  { items: [{ name: "Home", href: "/dashboard", icon: LayoutDashboard }] },
  {
    label: "Earn",
    items: [{ name: "Earn credits", href: "/earn", icon: Sparkles }],
  },
  {
    label: "Grow your channel",
    items: [
      { name: "New campaign", href: "/submit", icon: Megaphone },
      { name: "My campaigns", href: "/campaigns", icon: FolderOpen },
      { name: "Repost requests", href: "/repost", icon: Repeat2 },
    ],
  },
  {
    label: "Account",
    items: [
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Wallet & plans", href: "/wallet", icon: Wallet },
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

const BOT = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "").trim().replace(/^@/, "");

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const setup = useSetupStatus();
  const credits = Number(setup.profile?.credits ?? 0);
  const planName = setup.profile?.plan?.name || "Free";

  function handleLogout() {
    clearToken();
    resetSetup();
    onClose?.();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex h-full w-64 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center justify-between px-5">
        <Link to="/dashboard" onClick={onClose} aria-label="Exchange Tunnel home">
          <Logo />
        </Link>
        {onClose ? (
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground lg:hidden" aria-label="Close menu">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Main">
        {GROUPS.map((group, gi) => (
          <div key={gi}>
            {group.label ? (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{group.label}</p>
            ) : null}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = location.pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={onClose}
                    onMouseEnter={item.href === "/earn" ? () => void prefetchEarnFeed() : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                    <span className="truncate">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-sidebar-border p-3">
        {!setup.loading && !setup.complete ? (
          <Link
            to={setupHref(setup.nextStep?.id)}
            onClick={onClose}
            className="block rounded-xl border border-info-border bg-info-soft p-3 transition-colors hover:bg-primary-soft"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Rocket className="h-4 w-4 text-primary" />
              Finish setup
              <span className="ml-auto text-xs font-medium text-muted-foreground">
                {setup.doneCount}/{setup.total}
              </span>
            </div>
            <Progress value={(setup.doneCount / Math.max(1, setup.total)) * 100} className="mt-2 h-1.5" />
            {setup.nextStep ? <p className="mt-2 text-xs text-muted-foreground">Next: {setup.nextStep.title}</p> : null}
          </Link>
        ) : (
          <div className="rounded-xl border border-border bg-muted/60 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Coins className="h-3.5 w-3.5" /> {planName} plan
              </span>
              <Link to="/wallet" onClick={onClose} className="text-xs font-semibold text-primary hover:underline">
                Upgrade
              </Link>
            </div>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
              {credits.toLocaleString()} <span className="text-xs font-medium text-muted-foreground">credits</span>
            </p>
          </div>
        )}

        <div className="space-y-0.5">
          <a
            href={BOT ? `https://t.me/${BOT}` : "/settings"}
            target={BOT ? "_blank" : undefined}
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LifeBuoy className="h-[18px] w-[18px]" />
            Help & support
          </a>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Log out
          </button>
        </div>
      </div>
    </aside>
  );
}
