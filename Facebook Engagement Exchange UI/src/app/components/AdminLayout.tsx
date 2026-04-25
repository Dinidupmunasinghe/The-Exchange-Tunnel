import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { ShieldCheck } from "lucide-react";
import { AdminSidebar } from "./AdminSidebar";
import { api } from "../services/api";

export function AdminLayout() {
  const [adminEmail, setAdminEmail] = useState<string>("");

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

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full">
        <div className="hidden h-full md:block">
          <AdminSidebar />
        </div>
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-brand" />
              <h2 className="text-sm font-semibold text-foreground">Admin Console</h2>
            </div>
            <div className="text-xs text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{adminEmail || "admin"}</span>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
