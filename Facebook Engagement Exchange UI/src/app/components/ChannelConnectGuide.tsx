import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Bot,
  CheckCircle2,
  Info,
  LayoutGrid,
  Megaphone,
  Shield,
  Smartphone,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";

const GOAL_KEY = "exchangeTunnel_userGoal";

export type UserGoal = "earn_only" | "channel_owner";

export function readUserGoal(): UserGoal | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(GOAL_KEY);
  if (v === "earn_only" || v === "channel_owner") return v;
  return null;
}

function writeUserGoal(goal: UserGoal) {
  localStorage.setItem(GOAL_KEY, goal);
}

type GoalPickerProps = {
  className?: string;
};

/** Lets users choose browse-only vs channel-owner — stored in localStorage. */
export function UserGoalPicker({ className }: GoalPickerProps) {
  const [goal, setGoal] = useState<UserGoal | null>(null);

  useEffect(() => {
    setGoal(readUserGoal());
  }, []);

  const select = (g: UserGoal) => {
    writeUserGoal(g);
    setGoal(g);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-sm font-medium text-foreground">How do you want to use Exchange Tunnel?</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => select("earn_only")}
          className={cn(
            "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
            goal === "earn_only"
              ? "border-brand bg-brand/10 ring-1 ring-brand/40"
              : "border-border bg-secondary/20 hover:bg-secondary/40"
          )}
        >
          <LayoutGrid className="h-5 w-5 text-brand" />
          <span className="font-semibold text-foreground">Earn & browse</span>
          <span className="text-xs text-muted-foreground">
            Complete tasks and use the feed. You do not need to add the bot to any channel.
          </span>
        </button>
        <button
          type="button"
          onClick={() => select("channel_owner")}
          className={cn(
            "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
            goal === "channel_owner"
              ? "border-brand bg-brand/10 ring-1 ring-brand/40"
              : "border-border bg-secondary/20 hover:bg-secondary/40"
          )}
        >
          <Megaphone className="h-5 w-5 text-brand" />
          <span className="font-semibold text-foreground">Run campaigns</span>
          <span className="text-xs text-muted-foreground">
            Promote your Telegram channel. You must add the platform bot as an admin first.
          </span>
        </button>
      </div>
      {!goal ? (
        <p className="text-xs text-muted-foreground">Pick one — we&apos;ll tailor hints on this page and the dashboard.</p>
      ) : null}
    </div>
  );
}

const BOT = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "").trim();
const BOT_AT = BOT ? `@${BOT}` : "@YourBot";

type PrerequisitesProps = {
  disabled?: boolean;
};

/** Shown before the connect form so users see requirements before an error. */
export function ChannelConnectPrerequisites({ disabled }: PrerequisitesProps) {
  if (!BOT) return null;
  return (
    <Alert className="border-amber-500/40 bg-amber-500/5">
      <Info className="text-amber-500" />
      <AlertTitle className="text-amber-100">Before you connect a channel</AlertTitle>
      <AlertDescription className="text-amber-100/90">
        <ul className="mt-2 list-inside list-decimal space-y-1.5 text-sm">
          <li>
            You must be a <strong>creator or admin</strong> of that Telegram channel (same account you used to log in).
          </li>
          <li>
            Add <strong>{BOT_AT}</strong> under <strong>Channel → Administrators</strong> so Telegram allows the bot to
            verify membership. Without this, connection will fail.
          </li>
          <li>Then enter <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-xs">@yourchannel</code> or a t.me link below.</li>
        </ul>
        {disabled ? (
          <p className="mt-2 text-xs text-muted-foreground">Log in with Telegram first to connect a channel.</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

type GuideProps = {
  defaultOpenAccordion?: boolean;
};

/** Accordion + visual step cards (illustrative — not literal Telegram screenshots). */
export function ChannelConnectVisualGuide({ defaultOpenAccordion = false }: GuideProps) {
  if (!BOT) return null;

  const steps = [
    {
      icon: Smartphone,
      title: "Open your channel",
      caption: "In Telegram: open the channel → menu (⋮) → Manage channel.",
      fig: "Channel header & menu",
    },
    {
      icon: Shield,
      title: "Administrators",
      caption: "Tap Administrators → Add admin → search for the bot username below.",
      fig: "Administrators list",
    },
    {
      icon: Bot,
      title: `Add ${BOT_AT}`,
      caption: "Confirm. The bot does not need to post; it only needs rights to read members for verification.",
      fig: "Add admin dialog",
    },
  ];

  return (
    <div className="space-y-4">
      <Accordion
        type="single"
        collapsible
        defaultValue={defaultOpenAccordion ? "why" : undefined}
        className="rounded-lg border border-border bg-card px-4"
      >
        <AccordionItem value="why" className="border-0">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            Why does the bot need to be an admin?
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground pb-4">
            Telegram only lets a bot call <code className="rounded bg-muted px-1 text-xs">getChatMember</code> on a channel
            if the bot is in that channel. We use that to confirm you manage the channel and to support tasks. Logging in
            with Telegram does <strong>not</strong> replace this — it&apos;s a separate rule from Telegram&apos;s API.
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick visual guide</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div
              key={s.title}
              className="flex flex-col overflow-hidden rounded-lg border border-border bg-secondary/20"
            >
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-muted/40 p-3">
                <s.icon className="h-8 w-8 text-muted-foreground" />
                <span className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Step {i + 1}
                </span>
              </div>
              <div className="space-y-1 border-t border-border p-3">
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.caption}</p>
                <p className="text-[10px] italic text-muted-foreground/80">Illustration: {s.fig}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          For official help, see{" "}
          <a
            href="https://telegram.org/faq/channels#q-how-do-i-add-more-administrators"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            Telegram — channel administrators
          </a>
          .
        </p>
      </div>

      <Button variant="outline" size="sm" className="gap-2" asChild>
        <a href={`https://t.me/${BOT}`} target="_blank" rel="noreferrer">
          <Bot className="h-4 w-4" />
          Open {BOT_AT} in Telegram
        </a>
      </Button>
    </div>
  );
}

type DashboardHintProps = {
  hasChannel: boolean;
  telegramConnected: boolean;
};

/** Callout on the dashboard — proactive, not only after errors. */
export function DashboardChannelHint({ hasChannel, telegramConnected }: DashboardHintProps) {
  const [goal, setGoal] = useState<UserGoal | null>(null);

  useEffect(() => {
    setGoal(readUserGoal());
  }, []);

  if (hasChannel) return null;
  if (!telegramConnected) return null;

  if (goal === "earn_only") {
    return (
      <Alert className="border-border bg-secondary/30">
        <CheckCircle2 className="text-brand" />
        <AlertTitle>Browse mode</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          You&apos;re set to earn and browse — no channel connection needed. To{" "}
          <strong>run campaigns</strong> for your own channel, open{" "}
          <Link to="/settings" className="font-medium text-primary underline underline-offset-2">
            Settings
          </Link>{" "}
          and switch to &quot;Run campaigns&quot;, then add {BOT_AT} as admin.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-brand/30 bg-brand/5">
      <Megaphone className="text-brand" />
      <AlertTitle>Connect your channel to run campaigns</AlertTitle>
      <AlertDescription className="text-muted-foreground">
        Add <strong>{BOT_AT}</strong> as a channel administrator, then link the channel in{" "}
        <Link to="/settings" className="font-medium text-primary underline underline-offset-2">
          Settings
        </Link>
        . That step is required by Telegram — not optional for promoters.
      </AlertDescription>
    </Alert>
  );
}
