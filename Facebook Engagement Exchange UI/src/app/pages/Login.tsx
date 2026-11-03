import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Coins, Eye, EyeOff, Link2, Loader2, Megaphone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { TelegramBrandIcon } from "../components/TelegramBrandIcon";
import { Callout, Logo } from "../components/kit";
import { loginWithEmail, registerWithEmail, getToken, clearToken, isAccessTokenValid } from "../services/api";
import { safeReturnPath } from "../lib/returnPath";
import { resetSetup } from "../lib/setupStatus";

const VALUE_STEPS = [
  { Icon: Link2, title: "Connect Telegram", body: "Link your account and (optionally) your channel in about two minutes." },
  { Icon: Coins, title: "Earn credits", body: "Join channels, like, comment and repost posts from other members." },
  { Icon: Megaphone, title: "Grow your channel", body: "Spend credits on campaigns that bring real subscribers and engagement." },
];

export function Login() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(
    searchParams.get("mode") === "register" || searchParams.get("intent") === "free" ? "register" : "login"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, setSessionTick] = useState(0);
  const sessionExpired = searchParams.get("session") === "expired";

  const alreadySignedIn = isAccessTokenValid(getToken());
  const returnTo = safeReturnPath(searchParams.get("returnTo"));

  function afterAuthPath() {
    if (returnTo) return returnTo;
    const intent = searchParams.get("intent");
    const packageId = searchParams.get("packageId");
    if (intent === "subscribe" && packageId) return `/checkout?packageId=${packageId}`;
    return "/dashboard";
  }

  useEffect(() => {
    const wantOut = searchParams.get("logout") === "1" || searchParams.get("reauth") === "1";
    if (!wantOut) return;
    clearToken();
    resetSetup();
    setSessionTick((n) => n + 1);
    setSearchParams({}, { replace: true });
    toast("Signed out — you can sign in again.");
  }, [searchParams, setSearchParams]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        await loginWithEmail(email, password);
        toast.success("Welcome back!");
        navigate(afterAuthPath(), { replace: true });
      } else {
        await registerWithEmail(email, password, name || undefined);
        toast.success("Account created — let’s get you set up");
        const next = afterAuthPath();
        navigate(next === "/dashboard" ? "/get-started?welcome=1" : `/get-started?welcome=1&returnTo=${encodeURIComponent(next)}`, {
          replace: true,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const telegramHref = `/login/telegram${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      {/* Value panel */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#0b78c4] via-[#1590dc] to-[#2aabee] p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10 blur-2xl" />
        <Link to="/" className="relative inline-flex items-center gap-2.5 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/15 ring-1 ring-white/25">
            <TelegramBrandIcon size={20} />
          </span>
          <span className="text-lg font-semibold">Exchange Tunnel</span>
        </Link>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-white">Grow your Telegram channel with real people.</h2>
          <p className="mt-3 text-white/80">
            Help other channel owners and they help you back. Every action is checked on Telegram before credits move.
          </p>
          <ol className="mt-8 space-y-4">
            {VALUE_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                  <s.Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-white">
                    {i + 1}. {s.title}
                  </p>
                  <p className="text-sm text-white/75">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-10 flex items-center gap-2 text-sm text-white/75">
            <ShieldCheck className="h-4 w-4" /> 50 free credits when you sign up · no card needed
          </p>
        </div>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 inline-flex lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {mode === "register" ? "Create your free account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "register" ? "Start with 50 free credits. Setup takes about two minutes." : "Sign in to continue to Exchange Tunnel."}
          </p>

          {sessionExpired ? (
            <Callout tone="info" className="mt-5">
              Your session ended. Please sign in again.
            </Callout>
          ) : null}

          {alreadySignedIn ? (
            <div className="mt-5 rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-medium text-foreground">You’re already signed in</p>
              <div className="mt-3 flex gap-2">
                <Button type="button" className="flex-1" onClick={() => navigate(afterAuthPath(), { replace: true })}>
                  Continue
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    clearToken();
                    resetSetup();
                    setSessionTick((n) => n + 1);
                    toast("Signed out.");
                  }}
                >
                  Sign out
                </Button>
              </div>
            </div>
          ) : null}

          <Button asChild variant="outline" size="lg" className="mt-6 w-full">
            <Link to={telegramHref}>
              <TelegramBrandIcon size={20} />
              Continue with Telegram
            </Link>
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" ? (
              <div className="space-y-1.5">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Perera" />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  required
                  minLength={mode === "register" ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === "register" ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "register" ? "Already have an account?" : "New to Exchange Tunnel?"}{" "}
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={() => setMode(mode === "register" ? "login" : "register")}
            >
              {mode === "register" ? "Sign in" : "Create a free account"}
            </button>
          </p>
          <p className="mt-8 text-center text-xs text-muted-foreground">
            By continuing you agree to our{" "}
            <Link to="/privacy-policy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .{" "}
            <Link to="/data-deletion" className="underline hover:text-foreground">
              Data deletion
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
