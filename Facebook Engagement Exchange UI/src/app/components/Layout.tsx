import { Outlet } from "react-router";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ChatWidget } from "./ChatWidget";
import { NotificationsPopover } from "./NotificationsPopover";
import { ThemeToggle } from "./theme/ThemeToggle";
import { Button } from "./ui/button";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Menu Button */}
        <div className="flex items-center gap-2 border-b border-border bg-sidebar px-3 py-2.5 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-center text-sm font-bold text-brand sm:text-base">
            Exchange Tunnel
          </h1>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationsPopover />
            <ThemeToggle />
          </div>
        </div>

        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}