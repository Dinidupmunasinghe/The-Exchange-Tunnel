import { useNavigate, useSearchParams } from "react-router";
import { Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { TelegramLinkPanel } from "../components/TelegramLinkPanel";
import { clearToken } from "../services/api";

export function ConnectTelegram() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Send className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl text-foreground">
            {isWelcome ? "Welcome to Exchange Tunnel" : "Connect Telegram"}
          </CardTitle>
          <CardDescription>
            {isWelcome
              ? "Your account is ready. Link your Telegram account to earn credits and use the platform."
              : "Link your Telegram account to continue. Use the same Telegram you use for channels and tasks."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TelegramLinkPanel compact onLinked={() => navigate("/dashboard", { replace: true })} />
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
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

