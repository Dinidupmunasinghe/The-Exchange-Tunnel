import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { loginWithTelegram, getToken, clearToken, isAccessTokenValid } from "../services/api";

const BOT = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "").trim();

declare global {
  interface Window {
    onTelegramAuth?: (u: Record<string, string | number | undefined>) => void;
  }
}

export function Login() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [, setSessionTick] = useState(0);

  const alreadySignedIn = isAccessTokenValid(getToken());

  useEffect(() => {
    const wantOut = searchParams.get("logout") === "1" || searchParams.get("reauth") === "1";
    if (!wantOut) return;
    clearToken();
    setSessionTick((n) => n + 1);
    setSearchParams({}, { replace: true });
    toast("Signed out — you can sign in with Telegram again.");
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    window.onTelegramAuth = async (user) => {
      setBusy(true);
      try {
        await loginWithTelegram(user as Record<string, string | number | undefined>);
        toast.success("Signed in with Telegram");
        navigate("/", { replace: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Login failed";
        toast.error(msg);
      } finally {
        setBusy(false);
      }
    };
  }, [navigate]);

  useEffect(() => {
    if (!BOT) return;
    const id = "telegram-login-widget";
    if (document.getElementById(id)) return;
    const s = document.createElement("script");
    s.async = true;
    s.id = id;
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.setAttribute("data-telegram-login", BOT);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    s.setAttribute("data-userpic", "true");
    s.setAttribute("data-request-access", "write");
    const el = document.getElementById("tg-widget-mount");
    el?.appendChild(s);
  }, [BOT]);

  if (!BOT) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-border bg-card shadow-lg">
          <CardHeader>
            <CardTitle>Configuration required</CardTitle>
            <CardDescription>
              Set <code className="rounded bg-muted px-1 py-0.5 text-xs">VITE_TELEGRAM_BOT_NAME</code> in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code> (bot username, no @), then restart Vite.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-2 pl-5 text-left">
              <li>
                Open{" "}
                <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                  @BotFather
                </a>
                , run <code className="text-xs">/newbot</code> (or use an existing bot).
              </li>
              <li>
                Add to <code className="text-xs">.env</code>:{" "}
                <code className="text-xs">VITE_TELEGRAM_BOT_NAME=YourBotName</code>
              </li>
              <li>
                Add the same bot&apos;s token to <code className="text-xs">backend/.env</code> as{" "}
                <code className="text-xs">TELEGRAM_BOT_TOKEN</code>.
              </li>
              <li>In BotFather → your bot → Bot Settings → Domain, add your dev origin if required.</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-brand shadow-lg shadow-brand/30">
            <Send className="h-8 w-8 text-brand-foreground" />
          </div>
          <CardTitle className="text-2xl text-foreground">Exchange Tunnel</CardTitle>
          <CardDescription>Sign in with your Telegram account to use the platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {alreadySignedIn && (
            <div className="space-y-3 rounded-md border border-border bg-secondary/50 p-4 text-sm">
              <p className="font-medium text-foreground">You&apos;re already signed in</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="default" className="flex-1" onClick={() => navigate("/", { replace: true })}>
                  Go to dashboard
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    clearToken();
                    setSessionTick((n) => n + 1);
                    toast("Signed out.");
                  }}
                >
                  Sign out
                </Button>
              </div>
            </div>
          )}

          <div
            className="flex min-h-[44px] flex-col items-center justify-center gap-2"
            id="tg-widget-mount"
            aria-label="Telegram sign-in"
          />
          {busy ? <p className="text-center text-sm text-muted-foreground">Signing in…</p> : null}

          <p className="text-center text-xs text-muted-foreground">
            By continuing, you agree to our{" "}
            <Link to="/privacy-policy" className="text-primary underline underline-offset-2">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link to="/data-deletion" className="text-primary underline underline-offset-2">
              Data Deletion Instructions
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
