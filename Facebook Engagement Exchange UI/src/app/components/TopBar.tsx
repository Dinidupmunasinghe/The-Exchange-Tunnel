import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Search, Coins } from "lucide-react";
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
import { NotificationsPopover } from "./NotificationsPopover";
import { api, clearToken, getToken, isAccessTokenValid } from "../services/api";
import { readProfileCache, writeProfileCache } from "../lib/profileCache";
import { cn } from "./ui/utils";

type ProfileState = { name?: string; email?: string; credits?: number };

function profileFromCache(): ProfileState | null {
  const cached = readProfileCache();
  if (!cached) return null;
  return { name: cached.name, email: cached.email, credits: cached.credits };
}

export function TopBar() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileState | null>(() => profileFromCache());
  const [sessionHint, setSessionHint] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!isAccessTokenValid(getToken())) {
      setSessionHint("Session expired. Please sign in again.");
      return;
    }
    try {
      const res = await api.getProfile({ skipSessionRedirect: true });
      const user = res.user as ProfileState;
      setProfile(user);
      writeProfileCache(user);
      setSessionHint(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not load profile";
      if (!getToken() || !isAccessTokenValid(getToken())) {
        setSessionHint("Session expired. Please sign in again.");
        return;
      }
      setSessionHint(message);
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
    }, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadProfile]);

  const displayName = profile?.name || profile?.email?.split("@")[0] || "Account";

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

  function handleSignInAgain() {
    clearToken();
    navigate("/login?session=expired", { replace: true });
  }

  return (
    <header className="hidden h-14 items-center justify-between border-b border-border bg-sidebar px-6 lg:flex">
      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search posts, campaigns…"
          className="h-9 rounded-full border border-border bg-card pl-10 text-sm placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-card pl-1 pr-3 dark:bg-card/90">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
              "bg-amber-500/15 ring-1 ring-inset ring-amber-600/25",
              "dark:bg-brand/15 dark:ring-brand/30"
            )}
            aria-hidden
          >
            <Coins className="h-4 w-4 text-amber-700 dark:text-brand" strokeWidth={2.25} />
          </span>
          <span className="text-xs text-muted-foreground">Balance</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {profile?.credits ?? "—"}
          </span>
        </div>

        <ThemeToggle />
        <NotificationsPopover />

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
              <span className="hidden max-w-[140px] truncate md:inline">{displayName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div>
                <p className="text-sm font-semibold text-foreground">{displayName}</p>
                <p className="text-xs text-muted-foreground">{profile?.email || ""}</p>
                {sessionHint ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{sessionHint}</p>
                ) : null}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sessionHint && (!getToken() || !isAccessTokenValid(getToken())) ? (
              <DropdownMenuItem onClick={handleSignInAgain}>Sign in again</DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => navigate("/settings")}>Account Settings</DropdownMenuItem>
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
