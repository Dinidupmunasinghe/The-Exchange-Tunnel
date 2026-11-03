import { useState } from "react";
import { Bot, CheckCircle2, ExternalLink, Loader2, Megaphone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { api } from "../../services/api";
import { friendlyError } from "../../lib/friendlyErrors";
import { refreshSetup } from "../../lib/setupStatus";
import { Callout } from "../kit";
import { cn } from "../ui/utils";

const BOT = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "ExchangeTunnelApp_bot").trim().replace(/^@/, "");

/**
 * "Connect your channel" — the bot has to be an admin of the channel BEFORE connecting
 * (the server checks it), so the steps are shown in that order.
 */
export function ChannelSetup({
  channelTitle,
  channelUsername,
  connected,
  onConnected,
}: {
  channelTitle?: string | null;
  channelUsername?: string | null;
  connected: boolean;
  onConnected?: () => void;
}) {
  const [editing, setEditing] = useState(!connected);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botOpened, setBotOpened] = useState(false);

  async function connect() {
    setError(null);
    const v = value.trim();
    if (!v) {
      setError("Enter your channel’s @username or link.");
      return;
    }
    setBusy(true);
    try {
      await api.connectTelegramChannel(v);
      await refreshSetup(true);
      toast.success("Channel connected");
      setValue("");
      setEditing(false);
      onConnected?.();
    } catch (e) {
      setError(friendlyError(e, "Could not connect this channel").message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      await api.clearSelectedManagedPage();
      await refreshSetup(true);
      toast.success("Channel removed");
      setEditing(true);
    } catch (e) {
      toast.error(friendlyError(e).message);
    } finally {
      setRemoving(false);
    }
  }

  if (connected && !editing) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success-border bg-success-soft p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div className="text-sm">
              <p className="font-semibold text-foreground">{channelTitle || "Your channel"}</p>
              <p className="text-muted-foreground">
                {channelUsername ? `@${channelUsername} · ` : ""}Connected — campaigns will promote this channel.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Change
            </Button>
            <Button variant="ghost" size="sm" disabled={removing} onClick={() => void remove()}>
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Remove
            </Button>
          </div>
        </div>
        {!channelUsername ? (
          <Callout tone="warning" title="Your channel is private">
            Subscriber campaigns need a public channel with an @username. Likes, comments and reposts work for private
            channels too.
          </Callout>
        ) : null}
      </div>
    );
  }

  const steps = [
    {
      n: 1,
      Icon: Bot,
      title: "Add our bot to your channel as an admin",
      body: (
        <>
          Tap the button, pick your channel and confirm. Telegram adds <span className="font-medium">@{BOT}</span> as
          an administrator — it only reads members to confirm subscriptions and never posts.
        </>
      ),
      action: (
        <Button asChild variant={botOpened ? "outline" : "default"} size="sm" onClick={() => setBotOpened(true)}>
          <a href={`https://t.me/${BOT}?startchannel=true`} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            Add bot to my channel
          </a>
        </Button>
      ),
    },
    {
      n: 2,
      Icon: ShieldCheck,
      title: "Make sure you are an admin too",
      body: "You must be the owner or an admin of the channel you connect.",
    },
    {
      n: 3,
      Icon: Megaphone,
      title: "Connect it here",
      body: "Enter the channel’s @username or link (for private channels, paste a link to any post in it).",
    },
  ];

  return (
    <div className="space-y-5">
      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3 rounded-xl border border-border bg-card p-4">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                s.n === 1 && botOpened ? "bg-success text-white" : "bg-primary-soft text-primary-soft-foreground",
              )}
            >
              {s.n === 1 && botOpened ? <CheckCircle2 className="h-4 w-4" /> : s.n}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{s.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{s.body}</p>
              {s.action ? <div className="mt-3">{s.action}</div> : null}
            </div>
          </li>
        ))}
      </ol>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void connect();
        }}
      >
        <Label htmlFor="cs-channel">Your channel</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="cs-channel"
            placeholder="@mychannel or https://t.me/mychannel"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Connect channel
          </Button>
          {connected ? (
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Tip: subscriber campaigns need a public channel (with an @username).
        </p>
      </form>

      {error ? <Callout tone="danger">{error}</Callout> : null}
    </div>
  );
}
