import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { Menu, ShieldCheck } from "lucide-react";
import { AdminSidebar } from "./AdminSidebar";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import { Button } from "./ui/button";
import { ThemeToggle } from "./theme/ThemeToggle";
import { api } from "../services/api";

export function AdminLayout() {
  const [adminEmail, setAdminEmail] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await api.adminMe();
        if (!cancelled) setAdminEmail((me as any)?.admin?.email || "");
      } catch {
        if (!cancelled) setAdminEmail("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full">
        <div className="hidden h-full md:block">
          <AdminSidebar />
        </div>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Admin navigation</SheetTitle>
            <AdminSidebar />
          </SheetContent>
        </Sheet>
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur md:px-6">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMenuOpen(true)} aria-label="Open admin menu">
                <Menu className="h-5 w-5" />
              </Button>
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">Admin console</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Signed in as <span className="font-medium text-foreground">{adminEmail || "admin"}</span>
              </span>
              <ThemeToggle />
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
