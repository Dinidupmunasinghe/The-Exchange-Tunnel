import { Link, Outlet, useLocation } from "react-router";
import { useEffect, useState } from "react";
import { Coins, Menu } from "lucide-react";
import { prefetchEarnFeed } from "../lib/prefetchEarnFeed";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { NotificationsPopover } from "./NotificationsPopover";
import { ThemeToggle } from "./theme/ThemeToggle";
import { Button } from "./ui/button";
import { LogoMark } from "./kit";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useSetupStatus } from "../lib/setupStatus";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const location = useLocation();
  const setup = useSetupStatus();

  useEffect(() => {
    void prefetchEarnFeed();
  }, []);

  // Close the mobile drawer whenever the page changes.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      ) : null}

      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!isDesktop ? (
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
            <Link to="/dashboard" className="flex min-w-0 flex-1 items-center gap-2" aria-label="Exchange Tunnel home">
              <LogoMark className="h-7 w-7" />
              <span className="truncate text-sm font-semibold text-foreground">Exchange Tunnel</span>
            </Link>
            <Link
              to="/wallet"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-semibold tabular-nums"
              aria-label="Credit balance"
            >
              <Coins className="h-4 w-4 text-primary" />
              {Number(setup.profile?.credits ?? 0).toLocaleString()}
            </Link>
            <NotificationsPopover />
            <ThemeToggle />
          </div>
        ) : (
          <TopBar />
        )}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
