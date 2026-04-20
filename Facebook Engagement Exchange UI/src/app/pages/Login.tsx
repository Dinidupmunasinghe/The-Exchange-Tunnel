import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Send, Mail, Eye, EyeOff, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import {
  loginWithTelegram,
  loginWithEmail,
  registerWithEmail,
  startTelegramDeeplinkLogin,
  pollTelegramDeeplinkLogin,
  setToken,
  getToken,
  clearToken,
  isAccessTokenValid,
} from "../services/api";

const BOT = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "").trim();

declare global {
  interface Window {
    onTelegramAuth?: (u: Record<string, string | number | undefined>) => void;
  }
}

// ── Deep-link login panel ────────────────────────────────────────────────────

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

  const startLogin = async () => {
    setState("waiting");
    try {
      const { token, expiresInMs } = await startTelegramDeeplinkLogin();
      const url = `https://t.me/${BOT}?start=login_${token}`;
      setDeeplinkUrl(url);
      window.open(url, "_blank");

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
            setToken((result as { status: "ok"; token: string; user: unknown }).token);
            setState("done");
            toast.success("Signed in with Telegram!");
            navigate("/", { replace: true });
          } else if (result.status === "expired") {
            stopPolling();
            setState("error");
            toast.error(result.message ?? "Login link expired. Please try again.");
          }
        } catch {
          // network blip — keep polling
        }
      }, 2000);
    } catch (e) {
      setState("error");
      toast.error(e instanceof Error ? e.message : "Failed to start login");
    }
  };

  const cancel = () => {
    stopPolling();
    setState("idle");
    setDeeplinkUrl(null);
  };

  if (state === "waiting") {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Waiting for Telegram confirmation…</p>
          <p className="text-xs text-muted-foreground">
            Telegram should have opened. Tap <strong>START</strong> in the bot, then come back here.
          </p>
        </div>
        {deeplinkUrl && (
          <a
            href={deeplinkUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline underline-offset-2"
          >
            Open Telegram again
          </a>
        )}
        <Button variant="ghost" size="sm" onClick={cancel} className="text-muted-foreground">
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <p className="text-sm text-muted-foreground">
        No confirmation message? Use this instead — tap the button, then press <strong>START</strong> in Telegram.
      </p>
      <Button
        type="button"
        className="w-full gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
        onClick={startLogin}
        disabled={!BOT}
      >
        <Send className="h-4 w-4" />
        Open Telegram Bot to Sign In
      </Button>
      {state === "error" && (
        <p className="text-xs text-destructive">Something went wrong. Please try again.</p>
      )}
    </div>
  );
}

// ── Email / password panel ───────────────────────────────────────────────────

function EmailLogin() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        await loginWithEmail(email, password);
        toast.success("Signed in!");
      } else {
        await registerWithEmail(email, password, name || undefined);
        toast.success("Account created & signed in!");
      }
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {mode === "register" && (
        <div className="space-y-1">
          <Label htmlFor="em-name">Display name (optional)</Label>
          <Input
            id="em-name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="em-email">Email</Label>
        <Input
          id="em-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="em-password">Password</Label>
        <div className="relative">
          <Input
            id="em-password"
            type={showPw ? "text" : "password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Button type="submit" disabled={busy} className="w-full gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {mode === "login" ? "Sign In" : "Create Account"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {mode === "login" ? (
          <>
            No account?{" "}
            <button
              type="button"
              onClick={() => setMode("register")}
              className="text-primary underline underline-offset-2"
            >
              Register
            </button>
          </>
        ) : (
          <>
            Already have one?{" "}
            <button
              type="button"
              onClick={() => setMode("login")}
              className="text-primary underline underline-offset-2"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </form>
  );
}

// ── Main Login page ──────────────────────────────────────────────────────────

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
    toast("Signed out — you can sign in again.");
  }, [searchParams, setSearchParams]);

  // Telegram widget callback
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

  // Inject Telegram Login Widget script
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
    document.getElementById("tg-widget-mount")?.appendChild(s);
  }, [BOT]);

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

          <Tabs defaultValue="widget" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="widget">Widget</TabsTrigger>
              <TabsTrigger value="deeplink">Bot Link</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
            </TabsList>

            {/* Tab 1: Telegram official widget */}
            <TabsContent value="widget" className="space-y-3 pt-3">
              <p className="text-center text-xs text-muted-foreground">
                Click the button below and confirm in Telegram.
              </p>
              <div
                className="flex min-h-[44px] flex-col items-center justify-center gap-2"
                id="tg-widget-mount"
                aria-label="Telegram sign-in"
              />
              {busy && <p className="text-center text-sm text-muted-foreground">Signing in…</p>}
            </TabsContent>

            {/* Tab 2: Deep-link via bot */}
            <TabsContent value="deeplink" className="pt-3">
              <TelegramDeeplinkLogin />
            </TabsContent>

            {/* Tab 3: Email + password */}
            <TabsContent value="email" className="pt-3">
              <EmailLogin />
            </TabsContent>
          </Tabs>

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
