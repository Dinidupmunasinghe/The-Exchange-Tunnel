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
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback } from "./ui/avatar";
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
    <header className="hidden h-16 items-center justify-between border-b border-border bg-card px-6 lg:flex">
      {/* Search */}
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search posts, campaigns..."
          className="border-0 bg-secondary pl-10"
        />
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-4">
        {/* Credits Balance */}
        <div className="flex items-center gap-2 rounded-lg bg-brand/10 px-4 py-2 transition-colors hover:bg-brand/15">
          <Coins className="h-5 w-5 text-brand" />
          <div>
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="font-bold text-foreground">{profile?.credits ?? "—"}</p>
          </div>
        </div>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => navigate("/repost?tab=received&pane=notifications")}
          aria-label="Open notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary"></span>
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-10 gap-2 rounded-full px-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-brand/40 hover:ring-offset-2"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-brand text-brand-foreground text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-foreground">Account</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div>
                <p className="font-medium">{profile?.name || "Account"}</p>
                <p className="text-xs text-muted-foreground">{profile?.email || ""}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings")}>Account Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
