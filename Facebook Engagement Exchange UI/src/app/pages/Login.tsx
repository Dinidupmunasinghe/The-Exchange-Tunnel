import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Send, Mail, Eye, EyeOff, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import {
  loginWithEmail,
  registerWithEmail,
  getToken,
  clearToken,
  isAccessTokenValid,
} from "../services/api";

export function Login() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        await loginWithEmail(email, password);
        toast.success("Signed in!");
        navigate("/dashboard", { replace: true });
      } else {
        await registerWithEmail(email, password, name || undefined);
        toast.success("Account created!");
        navigate("/connect-telegram?welcome=1", { replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Send className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl text-foreground">Exchange Tunnel</CardTitle>
          <CardDescription>
            {mode === "register"
              ? "Create your account to get started."
              : "Sign in to your Exchange Tunnel account."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {alreadySignedIn && (
            <div className="space-y-3 rounded-md border border-border bg-secondary/50 p-4 text-sm">
              <p className="font-medium text-foreground">You&apos;re already signed in</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" className="flex-1" onClick={() => navigate("/dashboard", { replace: true })}>
                  Continue
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={busy} className="w-full gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {mode === "login" ? "Log in" : "Create account"}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className="text-primary underline underline-offset-2"
                >
                  Create account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-primary underline underline-offset-2"
                >
                  Log in
                </button>
              </>
            )}
          </p>

          <p className="text-center text-xs text-muted-foreground">
            <Link to="/login/telegram" className="text-primary underline underline-offset-2">
              Sign in with Telegram instead
            </Link>
          </p>

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
