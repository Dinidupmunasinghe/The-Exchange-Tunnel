import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { TelegramBrandIcon } from "../components/TelegramBrandIcon";
import { toast } from "sonner";
import {
  loginWithTelegram,
  startTelegramDeeplinkLogin,
  pollTelegramDeeplinkLogin,
  setToken,
} from "../services/api";

const BOT = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "").trim();

declare global {
  interface Window {
    onTelegramAuth?: (u: Record<string, string | number | undefined>) => void;
  }
}

function TelegramDeeplinkLogin() {
  const navigate = useNavigate();
  const [state, setState] = useState<"idle" | "waiting" | "done" | "error">("idle");
  const [deeplinkUrl, setDeeplinkUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  const openTelegramBotUrl = (url: string) => {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      toast.info("Pop-up blocked. Tap «Open Telegram again» below to continue.", { duration: 8000 });
    }
  };

  const startLogin = async () => {
    setState("waiting");
    setDeeplinkUrl(null);

    try {
      const { token, expiresInMs } = await startTelegramDeeplinkLogin();
      const url = `https://t.me/${BOT}?start=login_${token}`;
      setDeeplinkUrl(url);
      openTelegramBotUrl(url);

      const deadline = Date.now() + expiresInMs;
      pollRef.current = setInterval(async () => {
        if (Date.now() > deadline) {
          stopPolling();
          setState("error");
          toast.error("Login link expired. Please try again.");
          return;
        }
        try {
          const result = await pollTelegramDeeplinkLogin(token);
          if (result.status === "ok") {
            stopPolling();
            setToken((result as { status: "ok"; token: string }).token);
            setState("done");
            toast.success("Signed in with Telegram!");
            navigate("/dashboard", { replace: true });
          } else if (result.status === "expired") {
            stopPolling();
            setState("error");
            toast.error(result.message ?? "Login link expired.");
          }
        } catch {
          // keep polling
        }
      }, 2000);
    } catch (e) {
      stopPolling();
      setState("idle");
      setDeeplinkUrl(null);
      toast.error(e instanceof Error ? e.message : "Failed to start login");
    }
  };

  if (state === "waiting") {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Confirm in Telegram, then return here.</p>
        {deeplinkUrl ? (
          <a href={deeplinkUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
            Open Telegram again
          </a>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => { stopPolling(); setState("idle"); }}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-3 border-[#229ED9]/35 bg-[#2AABEE]/10 py-2.5 font-semibold hover:bg-[#2AABEE]/18 hover:border-[#229ED9]/55"
      onClick={startLogin}
      disabled={!BOT}
    >
      <TelegramBrandIcon size={22} />
      Open Telegram Bot to Sign In
    </Button>
  );
}

export function LoginTelegram() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.onTelegramAuth = async (user) => {
      setBusy(true);
      try {
        await loginWithTelegram(user as Record<string, string | number | undefined>);
        toast.success("Signed in with Telegram");
        navigate("/dashboard", { replace: true });
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Login failed");
      } finally {
        setBusy(false);
      }
    };
    return () => {
      delete window.onTelegramAuth;
    };
  }, [navigate]);

  useEffect(() => {
    if (!BOT) return;
    const mount = document.getElementById("tg-login-legacy-mount");
    if (!mount) return;
    mount.innerHTML = "";
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.setAttribute("data-telegram-login", BOT);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    s.setAttribute("data-userpic", "true");
    s.setAttribute("data-request-access", "write");
    mount.appendChild(s);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto">
            <TelegramBrandIcon size={56} />
          </div>
          <CardTitle className="text-2xl">Sign in with Telegram</CardTitle>
          <CardDescription>For accounts created with Telegram only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div id="tg-login-legacy-mount" className="flex justify-center" />
          {busy ? <p className="text-center text-sm text-muted-foreground">Signing in…</p> : null}
          <TelegramDeeplinkLogin />
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/login" className="text-primary underline underline-offset-2">
              Back to email sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
