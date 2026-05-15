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

type Props = {
  onLinked?: () => void;
  /** Welcome / connect-telegram screen layout (two styled options). */
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

  const option1 = (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Option 1 — Telegram button</p>
      <div className="relative h-11 w-full">
        <div
          id="telegram-link-widget-mount"
          className={
            isConnect
              ? "absolute inset-0 z-20 overflow-hidden rounded-full opacity-[0.02] [&_iframe]:!h-11 [&_iframe]:!min-h-[44px] [&_iframe]:!w-full"
              : "flex min-h-[44px] flex-col items-center justify-center"
          }
          aria-label="Log in with Telegram"
        />
        {isConnect ? (
          <>
            <div
              className="pointer-events-none relative z-10 flex h-11 w-full items-center justify-center gap-2.5 rounded-full bg-[#2AABEE] text-sm font-semibold text-white shadow-md shadow-[#2AABEE]/30"
              aria-hidden
            >
              <TelegramPlaneWhite size={20} />
              Log in with Telegram
            </div>
            {widgetBusy ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center rounded-full bg-[#2AABEE]/90">
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
    </div>
  );

  const option2 = (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Option 2 — Open our bot in Telegram</p>
      {deeplinkState === "waiting" ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card/50 py-4 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#2AABEE]" />
          <p className="text-sm text-muted-foreground">Confirm in Telegram, then return here.</p>
          {deeplinkUrl ? (
            <a
              href={deeplinkUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-[#2AABEE] underline underline-offset-2"
            >
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
        <Button
          type="button"
          variant="outline"
          className={
            isConnect
              ? "h-11 w-full gap-2.5 rounded-lg border-border bg-card/40 font-semibold text-foreground hover:bg-muted/50"
              : "w-full gap-2"
          }
          onClick={() => void startBotLink()}
        >
          <TelegramBrandIcon size={20} />
          Connect via bot
        </Button>
      )}
    </div>
  );

  if (isConnect) {
    return (
      <div className="space-y-5">
        {option1}
        {option2}
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
      {option1}
      <div className="border-t border-border pt-4">{option2}</div>
    </div>
  );
}
