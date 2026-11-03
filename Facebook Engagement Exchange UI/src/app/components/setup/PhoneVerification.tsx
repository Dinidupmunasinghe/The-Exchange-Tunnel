import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Lock, MessageSquareText, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../ui/input-otp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { api } from "../../services/api";
import { COUNTRIES, DEFAULT_COUNTRY } from "../../lib/countries";
import { friendlyError } from "../../lib/friendlyErrors";
import { refreshSetup } from "../../lib/setupStatus";
import { Callout } from "../kit";

type Stage = "phone" | "code" | "password" | "done";

/**
 * "Verify your phone" — signs the user's Telegram account in on our server (Telegram sends a
 * login code to the Telegram app) so the platform can do the actions they choose while earning.
 */
export function PhoneVerification({
  verified,
  onVerified,
  compact,
}: {
  verified: boolean;
  onVerified?: () => void;
  compact?: boolean;
}) {
  const [stage, setStage] = useState<Stage>(verified ? "done" : "phone");
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY.iso);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeHash, setCodeHash] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (verified) setStage("done");
  }, [verified]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const country = COUNTRIES.find((c) => c.iso === countryIso) || DEFAULT_COUNTRY;
  const fullPhone = phone.trim().startsWith("+")
    ? phone.trim().replace(/[^\d+]/g, "")
    : `${country.dial}${phone.replace(/[^\d]/g, "").replace(/^0+/, "")}`;

  async function sendCode() {
    setError(null);
    if (phone.replace(/[^\d]/g, "").length < 6) {
      setError("Enter the phone number of your Telegram account.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.mtprotoSendCode({ phone: fullPhone });
      setCodeHash(res.phoneCodeHash || "");
      setCode("");
      setStage("code");
      setCooldown(30);
      toast.success("Code sent — check your Telegram app");
    } catch (e) {
      setError(friendlyError(e, "Could not send the code").message);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    await refreshSetup(true);
    setStage("done");
    toast.success("Phone verified — you can now earn credits");
    onVerified?.();
  }

  async function submitCode(value = code) {
    setError(null);
    const digits = value.replace(/[^\d]/g, "");
    if (digits.length < 5) {
      setError("Enter the 5-digit code from Telegram.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.mtprotoSignIn({ phone: fullPhone, phoneCode: digits, phoneCodeHash: codeHash || undefined });
      if (res.requires2fa) {
        setStage("password");
      } else {
        await finish();
      }
    } catch (e) {
      setError(friendlyError(e, "That code didn’t work").message);
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword() {
    setError(null);
    if (!password) {
      setError("Enter your Telegram two-step verification password.");
      return;
    }
    setBusy(true);
    try {
      await api.mtprotoSignIn2fa({ password });
      setPassword("");
      await finish();
    } catch (e) {
      setError(friendlyError(e, "That password didn’t work").message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const res = await api.mtprotoDisconnect();
      toast.success(res.message);
      await refreshSetup(true);
      setStage("phone");
    } catch (e) {
      toast.error(friendlyError(e).message);
    } finally {
      setBusy(false);
    }
  }

  if (stage === "done") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-success-border bg-success-soft p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">Phone verified</p>
            <p className="text-muted-foreground">You can earn credits by subscribing, liking, commenting and reposting.</p>
          </div>
        </div>
        {!compact ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void disconnect()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Remove phone verification
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!compact ? (
        <ul className="grid gap-3 sm:grid-cols-3">
          {[
            { Icon: Smartphone, t: "Use your Telegram phone", d: "The number of the Telegram account you connected." },
            { Icon: MessageSquareText, t: "Code arrives in Telegram", d: "Telegram sends a login code to your Telegram app (not SMS)." },
            { Icon: ShieldCheck, t: "Only actions you pick", d: "We only join, react, comment or repost when you tap a task. Remove it any time." },
          ].map(({ Icon, t, d }) => (
            <li key={t} className="rounded-xl border border-border bg-muted/50 p-3">
              <Icon className="h-4 w-4 text-primary" />
              <p className="mt-2 text-sm font-medium text-foreground">{t}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{d}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {stage === "phone" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <Label htmlFor="pv-phone">Telegram phone number</Label>
          <div className="flex gap-2">
            <Select value={countryIso} onValueChange={setCountryIso}>
              <SelectTrigger className="w-[132px] shrink-0" aria-label="Country code">
                <SelectValue>
                  {country.iso} {country.dial}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.iso} value={c.iso}>
                    {c.name} <span className="text-muted-foreground">{c.dial}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="pv-phone"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="77 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1"
            />
          </div>
          <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
            Send me a code
          </Button>
        </form>
      ) : null}

      {stage === "code" ? (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Enter the code from Telegram</p>
            <p className="text-sm text-muted-foreground">
              We sent it to <span className="font-medium text-foreground">{fullPhone}</span> in your Telegram app (chat
              “Telegram”).{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setStage("phone")}>
                Change number
              </button>
            </p>
          </div>
          <InputOTP
            maxLength={5}
            value={code}
            onChange={(v) => {
              setCode(v);
              if (v.length === 5) void submitCode(v);
            }}
            disabled={busy}
            aria-label="Telegram login code"
          >
            <InputOTPGroup>
              {Array.from({ length: 5 }).map((_, i) => (
                <InputOTPSlot key={i} index={i} className="h-11 w-11 text-base" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={busy || code.length < 5} onClick={() => void submitCode()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Verify
            </Button>
            <Button type="button" variant="ghost" disabled={busy || cooldown > 0} onClick={() => void sendCode()}>
              {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
            </Button>
          </div>
        </div>
      ) : null}

      {stage === "password" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submitPassword();
          }}
        >
          <div>
            <p className="text-sm font-medium text-foreground">Your Telegram password</p>
            <p className="text-sm text-muted-foreground">
              Your account has two-step verification. Enter the password you set in Telegram → Settings → Privacy and
              Security.
            </p>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Two-step verification password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Finish verification
          </Button>
        </form>
      ) : null}

      {error ? <Callout tone="danger">{error}</Callout> : null}
    </div>
  );
}
