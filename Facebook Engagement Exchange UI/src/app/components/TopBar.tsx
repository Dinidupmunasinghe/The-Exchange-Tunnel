import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Search, Bell, Coins } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { ThemeToggle } from "./theme/ThemeToggle";
import { api, clearToken } from "../services/api";

export function TopBar() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ name?: string; email?: string; credits?: number } | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const res = await api.getProfile();
      setProfile(res.user);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadProfile();
    };
    const timer = window.setInterval(() => {
      void loadProfile();
    }, 15000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadProfile]);

  const initials = (() => {
    const n = profile?.name || profile?.email || "U";
    const parts = n.split(/[\s@]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  })();

  function handleLogout() {
    clearToken();
    navigate("/login", { replace: true });
  }

  return (
    <header className="hidden h-14 items-center justify-between border-b border-transparent bg-background px-6 dark:border-cyan-400/15 dark:bg-background/40 dark:backdrop-blur-xl dark:shadow-[0_12px_48px_-12px_rgba(0,0,0,0.5),0_0_40px_-14px_rgba(96,165,250,0.12)] lg:flex">
      {/* Search */}
      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search posts, campaigns…"
          className="h-9 rounded-full border-transparent bg-card pl-10 text-sm placeholder:text-muted-foreground dark:border-white/10 dark:bg-card/40 dark:backdrop-blur-md dark:shadow-[0_0_32px_-10px_rgba(96,165,250,0.28)]"
        />
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-2">
        {/* Credits Balance */}
        <div className="flex h-9 items-center gap-2 rounded-full border border-transparent bg-card px-4 dark:border-white/10 dark:bg-card/40 dark:backdrop-blur-md dark:shadow-[0_0_28px_-10px_rgba(34,211,238,0.22)]">
          <Coins className="h-4 w-4 text-foreground" />
          <span className="text-xs text-muted-foreground">Balance</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {profile?.credits ?? "—"}
          </span>
        </div>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full border border-transparent bg-card text-muted-foreground hover:bg-accent hover:text-foreground dark:border-white/10 dark:bg-card/40 dark:backdrop-blur-md dark:hover:bg-card/55"
          onClick={() => navigate("/repost?tab=received&pane=notifications")}
          aria-label="Open notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-destructive"></span>
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 gap-2 rounded-md px-1.5 text-sm font-medium text-foreground hover:bg-accent"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-[11px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:inline">Account</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {profile?.name || "Account"}
                </p>
                <p className="text-xs text-muted-foreground">{profile?.email || ""}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              Account Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
