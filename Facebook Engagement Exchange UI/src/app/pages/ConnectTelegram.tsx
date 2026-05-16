import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { TelegramLinkPanel } from "../components/TelegramLinkPanel";
import { TelegramBrandIcon } from "../components/TelegramBrandIcon";
import { api, clearToken } from "../services/api";

export function ConnectTelegram() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "1";
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getProfile()
      .then((res) => {
        if (cancelled) return;
        if (res.user?.telegramUserId) {
          navigate("/dashboard", { replace: true });
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto">
            <TelegramBrandIcon size={56} />
          </div>
          <CardTitle className="text-2xl text-foreground">
            {isWelcome ? "Welcome to Exchange Tunnel" : "Connect Telegram"}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {isWelcome
              ? "Your account is ready. Link your Telegram account to earn credits and use the platform."
              : "Link your Telegram account to continue. Use the same Telegram you use for channels and tasks."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <TelegramLinkPanel variant="connect" onLinked={() => navigate("/dashboard", { replace: true })} />
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={() => {
              clearToken();
              navigate("/login", { replace: true });
            }}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
