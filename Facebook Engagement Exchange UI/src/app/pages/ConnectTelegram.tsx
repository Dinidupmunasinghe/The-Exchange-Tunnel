import { useNavigate, useSearchParams } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { TelegramLinkPanel } from "../components/TelegramLinkPanel";
import { TelegramBrandIcon } from "../components/TelegramBrandIcon";
import { clearToken } from "../services/api";

export function ConnectTelegram() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "1";

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
