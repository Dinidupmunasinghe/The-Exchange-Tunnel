import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import {
  linkTelegramToAccount,
  pollTelegramLinkDeeplink,
  startTelegramLinkDeeplink,
} from "../services/api";

const BOT = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "").trim();

type Props = {
  onLinked?: () => void;
  /** Hide outer card title when parent page already explains the step. */
  compact?: boolean;
};

declare global {
  interface Window {
    onTelegramLink?: (u: Record<string, string | number | undefined>) => void;
  }
}

export function TelegramLinkPanel({ onLinked, compact }: Props) {
  const [widgetBusy, setWidgetBusy] = useState(false);
  const [deeplinkState, setDeeplinkState] = useState<"idle" | "waiting" | "done" | "error">("idle");
  const [deeplinkUrl, setDeeplinkUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    window.onTelegramLink = async (user) => {
      setWidgetBusy(true);
      try {
        await linkTelegramToAccount(user as Record<string, string | number | undefined>);
        toast.success("Telegram connected to your account");
        onLinked?.();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Could not connect Telegram");
      } finally {
        setWidgetBusy(false);
      }
    };
    return () => {
      delete window.onTelegramLink;
    };
  }, [onLinked]);

  useEffect(() => {
    if (!BOT) return;
    const mountId = "telegram-link-widget-mount";
    const el = document.getElementById(mountId);
    if (!el) return;
    el.innerHTML = "";
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.setAttribute("data-telegram-login", BOT);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-onauth", "onTelegramLink(user)");
    s.setAttribute("data-userpic", "true");
    s.setAttribute("data-request-access", "write");
    el.appendChild(s);
    return () => {
      el.innerHTML = "";
    };
  }, []);

  const startBotLink = async () => {
    setDeeplinkState("waiting");
    let popup: Window | null = null;
    try {
      popup = window.open("about:blank", "_blank");
    } catch {
      popup = null;
    }

    try {
      const { token } = await startTelegramLinkDeeplink();
      const url = `https://t.me/${BOT}?start=login_${token}`;
      setDeeplinkUrl(url);

      if (popup && !popup.closed) {
        try {
          popup.location.href = url;
        } catch {
          try {
            popup.close();
          } catch {
            // ignore
          }
          window.open(url, "_blank");
        }
      } else {
        window.open(url, "_blank");
      }

      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const result = await pollTelegramLinkDeeplink(token);
          if (result.status === "pending") return;
          stopPolling();
          if (result.status === "ok") {
            setDeeplinkState("done");
            toast.success("Telegram connected to your account");
            onLinked?.();
            return;
          }
          setDeeplinkState("error");
          toast.error("message" in result && result.message ? result.message : "Link expired");
        } catch (e: unknown) {
          stopPolling();
          setDeeplinkState("error");
          toast.error(e instanceof Error ? e.message : "Could not connect Telegram");
        }
      }, 2000);
    } catch (e: unknown) {
      setDeeplinkState("error");
      toast.error(e instanceof Error ? e.message : "Could not start Telegram link");
    }
  };

  if (!BOT) {
    return (
      <p className="text-sm text-muted-foreground">
        Telegram bot is not configured. Set <code className="text-xs">VITE_TELEGRAM_BOT_NAME</code> on the
        frontend and <code className="text-xs">TELEGRAM_BOT_NAME</code> on the server.
      </p>
    );
  }

  const content = (
    <>
      {!compact ? (
        <div>
          <p className="font-medium text-foreground">Connect Telegram</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Required to complete tasks and run campaigns. Use the same Telegram account you manage channels with.
          </p>
        </div>
      ) : null}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Option 1 — Telegram button</p>
        <div
          id="telegram-link-widget-mount"
          className="flex min-h-[44px] flex-col items-center justify-center"
          aria-label="Connect Telegram"
        />
        {widgetBusy ? (
          <p className="text-center text-sm text-muted-foreground">
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
            Connecting…
          </p>
        ) : null}
      </div>
      <div className={compact ? "space-y-2" : "space-y-2 border-t border-border pt-4"}>
        <p className="text-xs text-muted-foreground">Option 2 — Open our bot in Telegram</p>
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          disabled={deeplinkState === "waiting"}
          onClick={() => void startBotLink()}
        >
          {deeplinkState === "waiting" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {deeplinkState === "waiting" ? "Waiting for Telegram…" : "Connect via bot"}
        </Button>
        {deeplinkUrl && deeplinkState === "waiting" ? (
          <Button type="button" variant="ghost" size="sm" className="w-full" asChild>
            <a href={deeplinkUrl} target="_blank" rel="noreferrer">
              Open Telegram again
            </a>
          </Button>
        ) : null}
      </div>
    </>
  );

  if (compact) {
    return <div className="space-y-4">{content}</div>;
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">{content}</div>
  );
}
