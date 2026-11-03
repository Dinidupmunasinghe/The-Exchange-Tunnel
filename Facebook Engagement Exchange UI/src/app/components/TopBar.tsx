import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { Coins, LogOut, Rocket, Search, Settings, Wallet } from "lucide-react";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { ThemeToggle } from "./theme/ThemeToggle";
import { NotificationsPopover } from "./NotificationsPopover";
import { clearToken } from "../services/api";
import { refreshSetup, resetSetup, setupHref, useSetupStatus } from "../lib/setupStatus";

export function TopBar() {
  const navigate = useNavigate();
  const setup = useSetupStatus();
  const profile = setup.profile;

  // Keep balance fresh while the tab is in use.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshSetup(true);
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshSetup(true);
    }, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const displayName = profile?.name || profile?.email?.split("@")[0] || "Account";
  const initials = (() => {
    const n = String(profile?.name || profile?.email || "U").replace(/^@/, "");
    const parts = n.split(/[\s@._]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  })();

  function logout() {
    clearToken();
    resetSetup();
    navigate("/login", { replace: true });
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card/80 px-6 backdrop-blur">
      <form
        role="search"
        className="relative w-full max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const q = String(new FormData(e.currentTarget).get("q") || "").trim();
          navigate(q ? `/campaigns?q=${encodeURIComponent(q)}` : "/campaigns");
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          type="search"
          aria-label="Search your campaigns"
          placeholder="Search your campaigns…"
          className="h-9 rounded-lg border-border bg-muted pl-9 text-sm"
        />
      </form>

      <div className="flex items-center gap-2">
        <Link
          to="/wallet"
          className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm transition-colors hover:bg-muted"
          title="Your credit balance"
        >
          <Coins className="h-4 w-4 text-primary" />
          <span className="font-semibold tabular-nums text-foreground">{Number(profile?.credits ?? 0).toLocaleString()}</span>
          <span className="hidden text-muted-foreground xl:inline">credits</span>
        </Link>
        <ThemeToggle />
        <NotificationsPopover />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-lg px-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              aria-label="Account menu"
            >
              <Avatar className="h-7 w-7">
                {profile?.profilePhotoUrl ? <AvatarImage src={profile.profilePhotoUrl} alt="" /> : null}
                <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[140px] truncate md:inline">{displayName}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {profile?.plan?.name || "Free"} plan · {Number(profile?.credits ?? 0).toLocaleString()} credits
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {!setup.complete ? (
              <DropdownMenuItem onClick={() => navigate(setupHref(setup.nextStep?.id))}>
                <Rocket className="h-4 w-4" /> Finish setup ({setup.doneCount}/{setup.total})
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => navigate(setupHref("goal"))}>
                <Rocket className="h-4 w-4" /> Setup guide
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate("/wallet")}>
              <Wallet className="h-4 w-4" /> Wallet & plans
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
