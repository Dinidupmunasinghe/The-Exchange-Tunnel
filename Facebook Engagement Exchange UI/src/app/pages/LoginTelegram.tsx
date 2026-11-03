import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { safeReturnPath } from "../lib/returnPath";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { TelegramBrandIcon } from "../components/TelegramBrandIcon";
import { toast } from "sonner";
import {
  ApiError,
  completeTokenLogin,
  loginWithTelegram,
  startTelegramDeeplinkLogin,
  pollTelegramDeeplinkLogin,
} from "../services/api";

const BOT = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "").trim();

declare global {
  interface Window {
    onTelegramAuth?: (u: Record<string, string | number | undefined>) => void;
  }
}

function TelegramDeeplinkLogin({ afterLoginPath }: { afterLoginPath: string }) {
  const navigate = useNavigate();
  const [state, setState] = useState<"idle" | "waiting" | "done" | "error">("idle");
  const [deeplinkUrl, setDeeplinkUrl] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const stopPolling = () => {
    activeRef.current = false;
    if (pollRef.current) {
      clearTimeout(pollRef.current);
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
    stopPolling();
    setState("waiting");
    setDeeplinkUrl(null);
    setConfirmCode(null);

    try {
      const { token, code, expiresInMs } = await startTelegramDeeplinkLogin();
      const url = `https://t.me/${BOT}?start=login_${token}`;
      setDeeplinkUrl(url);
      setConfirmCode(code || null);
      openTelegramBotUrl(url);

      const deadline = Date.now() + expiresInMs;
      activeRef.current = true;
      // Sequential polling (next poll is scheduled only after the previous one finished),
      // so slow responses can never overlap and navigate twice.
      const pollOnce = async () => {
        if (!activeRef.current) return;
        if (Date.now() > deadline) {
          stopPolling();
          setState("error");
          toast.error("Login link expired. Please try again.");
          return;
        }
        try {
          const result = await pollTelegramDeeplinkLogin(token);
          if (!activeRef.current) return;
          if (result.status === "ok") {
            stopPolling();
            completeTokenLogin(result.token, result.user);
            setState("done");
            toast.success("Signed in with Telegram!");
            navigate(afterLoginPath, { replace: true });
            return;
          }
          if (result.status === "expired") {
            stopPolling();
            setState("error");
            toast.error(result.message ?? "Login link expired.");
            return;
          }
        } catch (e) {
          if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
            // 410 expired / 400 invalid: polling again cannot succeed.
            stopPolling();
            setState("error");
            toast.error(e.message || "Login link expired. Please try again.");
            return;
          }
          // network / 5xx: keep polling
        }
        if (activeRef.current) pollRef.current = setTimeout(pollOnce, 2000);
      };
      pollRef.current = setTimeout(pollOnce, 2000);
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
        <p className="text-sm text-muted-foreground">
          The bot will ask you to confirm. Tap <strong>Confirm</strong> in Telegram, then return here.
        </p>
        {confirmCode ? (
          <div className="rounded-lg border border-border px-4 py-2">
            <p className="text-xs text-muted-foreground">Check that Telegram shows this code</p>
            <p className="font-mono text-2xl font-semibold tracking-widest">{confirmCode}</p>
          </div>
        ) : null}
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
  const [searchParams] = useSearchParams();
  const afterLoginPath = safeReturnPath(searchParams.get("returnTo")) ?? "/dashboard";
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.onTelegramAuth = async (user) => {
      setBusy(true);
      try {
        await loginWithTelegram(user as Record<string, string | number | undefined>);
        toast.success("Signed in with Telegram");
        navigate(afterLoginPath, { replace: true });
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Login failed");
      } finally {
        setBusy(false);
      }
    };
    return () => {
      delete window.onTelegramAuth;
    };
  }, [navigate, afterLoginPath]);

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
          <TelegramDeeplinkLogin afterLoginPath={afterLoginPath} />
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
