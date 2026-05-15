import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { TelegramBrandIcon, TelegramPlaneWhite } from "./TelegramBrandIcon";
import {
  linkTelegramToAccount,
  pollTelegramLinkDeeplink,
  startTelegramLinkDeeplink,
} from "../services/api";

const BOT = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "").trim();

const CONNECT_PILL =
  "flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[#37AEE2] to-[#1E96C8] text-sm font-semibold text-white shadow-lg shadow-[#2AABEE]/25 transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-70";

type Props = {
  onLinked?: () => void;
  variant?: "default" | "connect";
};

declare global {
  interface Window {
    onTelegramLink?: (u: Record<string, string | number | undefined>) => void;
  }
}

export function TelegramLinkPanel({ onLinked, variant = "default" }: Props) {
  const isConnect = variant === "connect";
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
    s.setAttribute("data-userpic", "false");
    s.setAttribute("data-request-access", "write");
    if (isConnect) {
      s.setAttribute("data-radius", "20");
    }
    el.appendChild(s);
    return () => {
      el.innerHTML = "";
    };
  }, [isConnect]);

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

  const widgetButton = (
    <div className="relative h-12 w-full">
      <div
        id="telegram-link-widget-mount"
        className={
          isConnect
            ? "absolute inset-0 z-20 overflow-hidden rounded-full opacity-[0.02] [&_iframe]:!h-12 [&_iframe]:!min-h-[48px] [&_iframe]:!w-full"
            : "flex min-h-[44px] flex-col items-center justify-center"
        }
        aria-label="Log in with Telegram"
      />
      {isConnect ? (
        <>
          <div className={`pointer-events-none relative z-10 ${CONNECT_PILL}`} aria-hidden>
            <TelegramPlaneWhite size={20} />
            Log in with Telegram
          </div>
          {widgetBusy ? (
            <div className={`absolute inset-0 z-30 ${CONNECT_PILL}`}>
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          ) : null}
        </>
      ) : null}
      {!isConnect && widgetBusy ? (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
          Connecting…
        </p>
      ) : null}
    </div>
  );

  const botButton = isConnect ? (
    deeplinkState === "waiting" ? (
      <div className={`${CONNECT_PILL} h-auto min-h-12 flex-col gap-2 py-3`}>
        <Loader2 className="h-5 w-5 animate-spin text-white" />
        <p className="text-xs font-normal text-white/90">Tap START in Telegram, then return here</p>
        {deeplinkUrl ? (
          <a
            href={deeplinkUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-white underline underline-offset-2"
          >
            Open Telegram again
          </a>
        ) : null}
        <button
          type="button"
          className="text-xs text-white/80 underline underline-offset-2"
          onClick={() => {
            stopPolling();
            setDeeplinkState("idle");
            setDeeplinkUrl(null);
          }}
        >
          Cancel
        </button>
      </div>
    ) : (
      <button type="button" className={CONNECT_PILL} onClick={() => void startBotLink()}>
        <TelegramBrandIcon size={22} />
        Connect via bot
      </button>
    )
  ) : deeplinkState === "waiting" ? (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card/50 py-4 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-[#2AABEE]" />
      <p className="text-sm text-muted-foreground">Confirm in Telegram, then return here.</p>
      {deeplinkUrl ? (
        <a href={deeplinkUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-[#2AABEE] underline">
          Open Telegram again
        </a>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          stopPolling();
          setDeeplinkState("idle");
          setDeeplinkUrl(null);
        }}
      >
        Cancel
      </Button>
    </div>
  ) : (
    <Button type="button" variant="outline" className="w-full gap-2" onClick={() => void startBotLink()}>
      <TelegramBrandIcon size={20} />
      Connect via bot
    </Button>
  );

  if (isConnect) {
    return (
      <div className="space-y-3">
        {botButton}
        <div className="flex items-center gap-3 px-1">
          <div className="h-px flex-1 bg-border/80" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border/80" />
        </div>
        {widgetButton}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <div>
        <p className="font-medium text-foreground">Connect Telegram</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Required to complete tasks and run campaigns. Use the same Telegram account you manage channels with.
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Telegram button</p>
        {widgetButton}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">Open our bot</p>
        {botButton}
      </div>
    </div>
  );
}
