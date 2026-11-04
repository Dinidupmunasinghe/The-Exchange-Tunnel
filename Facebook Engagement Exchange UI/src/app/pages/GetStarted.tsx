import { useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  Loader2,
  Megaphone,
  Rocket,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { cn } from "../components/ui/utils";
import { Logo } from "../components/kit";
import { TelegramLinkPanel } from "../components/TelegramLinkPanel";
import { PhoneVerification } from "../components/setup/PhoneVerification";
import { ChannelSetup } from "../components/setup/ChannelSetup";
import { refreshSetup, useSetupStatus, type SetupStepId, type UserGoal } from "../lib/setupStatus";
import { safeReturnPath } from "../lib/returnPath";
import { clearToken } from "../services/api";

type WizardStep = SetupStepId | "done";

const GOALS: { id: UserGoal; title: string; body: string; needs: string; Icon: typeof Coins }[] = [
  {
    id: "earn",
    title: "Earn credits",
    body: "Join channels, like, comment and repost other people’s posts to collect credits.",
    needs: "Needs: Telegram account + phone verification",
    Icon: Coins,
  },
  {
    id: "grow",
    title: "Grow my channel",
    body: "Spend credits on campaigns that bring real subscribers and engagement to your channel.",
    needs: "Needs: Telegram account + your channel",
    Icon: TrendingUp,
  },
  {
    id: "both",
    title: "Both",
    body: "Earn credits by helping others, then use them to grow your own channel.",
    needs: "Needs: all three steps (recommended)",
    Icon: Sparkles,
  },
];

export function GetStarted() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const setup = useSetupStatus();
  const returnTo = safeReturnPath(params.get("returnTo"));
  const welcome = params.get("welcome") === "1";

  const order: WizardStep[] = useMemo(() => ["goal", ...setup.steps.map((s) => s.id), "done"], [setup.steps]);

  const requested = params.get("step") as WizardStep | null;
  const autoStep: WizardStep = !setup.hasGoal ? "goal" : setup.nextStep?.id || "done";
  const current: WizardStep = requested && order.includes(requested) ? requested : autoStep;

  const go = (step: WizardStep) => {
    const next = new URLSearchParams(params);
    next.set("step", step);
    setParams(next, { replace: false });
  };

  /** Move to the first unfinished step after `from` (or "done"). */
  const advance = (from: WizardStep) => {
    const idx = order.indexOf(from);
    const nextPending = setup.steps.find((s, i) => !s.done && order.indexOf(s.id) > idx && i >= 0);
    go(nextPending?.id || "done");
  };

  useEffect(() => {
    void refreshSetup(true);
  }, []);

  const stepIndex = Math.max(0, order.indexOf(current));
  const pct = Math.round((stepIndex / (order.length - 1)) * 100);
  const finishTarget = returnTo || (setup.goal === "grow" ? "/submit" : "/earn");

  if (setup.loading && !setup.profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <Logo />
          <div className="flex items-center gap-3">
            {setup.telegram ? (
              <Button variant="ghost" size="sm" onClick={() => navigate(returnTo || "/dashboard")}>
                Skip for now
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearToken();
                  navigate("/login", { replace: true });
                }}
              >
                Sign out
              </Button>
            )}
          </div>
        </div>
        <Progress value={pct} className="h-1 rounded-none" aria-label="Setup progress" />
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-[240px_1fr] md:py-12">
        {/* Step rail */}
        <nav aria-label="Setup steps" className="hidden md:block">
          <ol className="space-y-1">
            {order
              .filter((s) => s !== "done")
              .map((s, i) => {
                const meta = s === "goal" ? null : setup.steps.find((x) => x.id === s);
                const done = s === "goal" ? setup.hasGoal : Boolean(meta?.done);
                const active = s === current;
                const label =
                  s === "goal" ? "Your goal" : s === "telegram" ? "Telegram account" : s === "phone" ? "Phone verification" : "Your channel";
                return (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => (s === "goal" || setup.telegram || s === "telegram" ? go(s) : undefined)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                        active ? "bg-primary-soft font-semibold text-primary-soft-foreground" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          done ? "bg-success text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      {label}
                    </button>
                  </li>
                );
              })}
          </ol>
        </nav>

        <main className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary md:hidden">
            Step {Math.min(stepIndex + 1, order.length - 1)} of {order.length - 1}
          </p>

          {current === "goal" ? (
            <StepShell
              title={welcome ? "Welcome to Exchange Tunnel 👋" : "What would you like to do?"}
              description="Pick what you want to do first. You can do both later — this only decides which setup steps we show you."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {GOALS.map((g) => {
                  const selected = setup.hasGoal && setup.goal === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        setup.setGoal(g.id);
                        // compute next pending with the new goal on next render
                        const next = new URLSearchParams(params);
                        next.delete("step");
                        setParams(next);
                      }}
                      className={cn(
                        "group flex h-full flex-col rounded-2xl border-2 bg-card p-5 text-left transition-all hover:border-primary hover:shadow-md",
                        selected ? "border-primary shadow-md" : "border-border",
                      )}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                        <g.Icon className="h-5 w-5" />
                      </span>
                      <span className="mt-4 text-base font-semibold text-foreground">{g.title}</span>
                      <span className="mt-1 text-sm text-muted-foreground">{g.body}</span>
                      <span className="mt-auto pt-4 text-xs font-medium text-primary">{g.needs}</span>
                    </button>
                  );
                })}
              </div>
            </StepShell>
          ) : null}

          {current === "telegram" ? (
            <StepShell
              title="Connect your Telegram account"
              description="Exchange Tunnel works with Telegram. Connect the account you use for your channels and tasks."
              back={() => go("goal")}
            >
              {setup.telegram ? (
                <DoneRow text="Telegram account connected" onNext={() => advance("telegram")} />
              ) : (
                <div className="max-w-md">
                  <TelegramLinkPanel
                    variant="connect"
                    onLinked={() => {
                      void refreshSetup(true).then(() => advance("telegram"));
                    }}
                  />
                </div>
              )}
            </StepShell>
          ) : null}

          {current === "phone" ? (
            <StepShell
              title="Verify your phone"
              description="To earn credits, we subscribe, like, comment or repost on Telegram for you when you tap a task. Telegram asks for a one-time login code to allow this."
              back={() => go("telegram")}
            >
              <PhoneVerification verified={setup.phone} onVerified={() => advance("phone")} />
              {setup.phone ? <DoneRow text="" onNext={() => advance("phone")} /> : null}
            </StepShell>
          ) : null}

          {current === "channel" ? (
            <StepShell
              title="Connect your channel"
              description="Campaigns bring subscribers and engagement to this channel. You can also earn credits by reposting from it."
              back={() => go(setup.steps.some((s) => s.id === "phone") ? "phone" : "telegram")}
            >
              <ChannelSetup
                connected={setup.channel}
                channelTitle={setup.profile?.telegramActingChannelTitle}
                channelUsername={setup.profile?.telegramActingChannelUsername}
                channelVisibility={setup.profile?.channelVisibility}
                onConnected={() => advance("channel")}
              />
              {setup.channel ? <DoneRow text="" onNext={() => advance("channel")} /> : null}
            </StepShell>
          ) : null}

          {current === "done" ? (
            <StepShell title={setup.complete ? "You’re all set! 🎉" : "Almost there"}>
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-4">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft text-success">
                    <Rocket className="h-7 w-7" />
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-foreground">
                      You have {Number(setup.profile?.credits ?? 0).toLocaleString()} credits
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {setup.complete
                        ? "Everything is ready. Here’s what you can do next."
                        : "Some steps are still open — you can finish them any time from your dashboard."}
                    </p>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <NextCard
                    to="/earn"
                    Icon={Coins}
                    title="Earn credits"
                    body="Do quick actions on other channels’ posts."
                    disabled={!setup.canEarn}
                  />
                  <NextCard
                    to="/submit"
                    Icon={Megaphone}
                    title="Launch a campaign"
                    body="Get subscribers, likes, comments or reposts."
                    disabled={!setup.canLaunch}
                  />
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button onClick={() => navigate(finishTarget)}>
                    Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                  {!setup.complete && setup.nextStep ? (
                    <Button variant="outline" onClick={() => go(setup.nextStep!.id)}>
                      Finish: {setup.nextStep.title}
                    </Button>
                  ) : null}
                </div>
              </div>
            </StepShell>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function StepShell({
  title,
  description,
  back,
  children,
}: {
  title: string;
  description?: string;
  back?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        {back ? (
          <button type="button" onClick={back} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function DoneRow({ text, onNext }: { text: string; onNext: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {text ? (
        <span className="inline-flex items-center gap-2 text-sm font-medium text-success">
          <CheckCircle2 className="h-5 w-5" /> {text}
        </span>
      ) : null}
      <Button onClick={onNext}>
        Continue <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function NextCard({
  to,
  Icon,
  title,
  body,
  disabled,
}: {
  to: string;
  Icon: typeof Coins;
  title: string;
  body: string;
  disabled?: boolean;
}) {
  const inner = (
    <>
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      {disabled ? <p className="mt-2 text-xs font-medium text-warning">Finish setup to unlock</p> : null}
    </>
  );
  return disabled ? (
    <div className="rounded-xl border border-dashed border-border p-4 opacity-80">{inner}</div>
  ) : (
    <Link to={to} className="rounded-xl border border-border p-4 transition-colors hover:border-primary hover:bg-primary-soft/40">
      {inner}
    </Link>
  );
}
