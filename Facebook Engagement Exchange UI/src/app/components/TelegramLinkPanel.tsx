import { useEffect, useId, useRef, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { cn } from "./ui/utils";
import { TelegramBrandIcon } from "./TelegramBrandIcon";
import {
  getToken,
  isAccessTokenValid,
  linkTelegramToAccount,
  pollTelegramLinkDeeplink,
  startTelegramLinkDeeplink,
} from "../services/api";

const BOT = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "").trim();

/** Fully hide Telegram's default iframe button; keep it clickable. */
const WIDGET_IFRAME_HIDE =
  "[&_iframe]:!pointer-events-auto [&_iframe]:!absolute [&_iframe]:!inset-0 [&_iframe]:!m-0 [&_iframe]:!h-full [&_iframe]:!w-full [&_iframe]:!max-w-none [&_iframe]:!border-0 [&_iframe]:!opacity-0 [&_iframe]:!cursor-pointer";

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
  const widgetMountId = useId().replace(/:/g, "");
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
    const el = document.getElementById(widgetMountId);
    if (!el) return;

    const hideWidgetIframe = () => {
      el.querySelectorAll("iframe").forEach((iframe) => {
        iframe.style.opacity = "0";
        iframe.style.position = "absolute";
        iframe.style.inset = "0";
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "0";
        iframe.style.cursor = "pointer";
      });
    };

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
      s.setAttribute("data-radius", "8");
    }
    el.appendChild(s);

    const observer = new MutationObserver(hideWidgetIframe);
    observer.observe(el, { childList: true, subtree: true });
    hideWidgetIframe();

    return () => {
      observer.disconnect();
      el.innerHTML = "";
    };
  }, [isConnect, widgetMountId]);

  const openTelegramBotUrl = (url: string) => {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      toast.info("Pop-up blocked. Tap «Open Telegram» below to continue.", { duration: 8000 });
    }
  };

  const startBotLink = async () => {
    if (!isAccessTokenValid(getToken())) {
      toast.error("Your session expired. Please sign in again.");
      window.location.assign("/login?session=expired&returnTo=%2Fconnect-telegram");
      return;
    }

    setDeeplinkState("waiting");
    setDeeplinkUrl(null);

    try {
      const { token } = await startTelegramLinkDeeplink();
      const url = `https://t.me/${BOT}?start=login_${token}`;
      setDeeplinkUrl(url);
      openTelegramBotUrl(url);

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
      stopPolling();
      setDeeplinkState("idle");
      setDeeplinkUrl(null);
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

  const connectBotBtnClass =
    "w-full gap-2.5 border-0 bg-[#2AABEE] text-white shadow-md hover:bg-[#229ED9] focus-visible:ring-[#2AABEE]/40";
  const connectLoginBtnClass =
    "w-full gap-2.5 border-border bg-muted/60 text-foreground shadow-sm hover:bg-muted dark:bg-muted/80 dark:hover:bg-muted";

  const widgetButton = isConnect ? (
    <div className="relative w-full">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className={cn("pointer-events-none relative z-0", connectLoginBtnClass)}
        tabIndex={-1}
        aria-hidden
      >
        <TelegramBrandIcon size={22} />
        Log in with Telegram
      </Button>
      <div
        id={widgetMountId}
        className={cn("absolute inset-0 z-10 size-full overflow-hidden rounded-lg", WIDGET_IFRAME_HIDE)}
        aria-label="Log in with Telegram"
      />
      {widgetBusy ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg border border-border bg-muted/80 backdrop-blur-[1px]">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}
    </div>
  ) : (
    <div className="w-full">
      <div id={widgetMountId} className="flex min-h-[44px] flex-col items-center justify-center" />
      {widgetBusy ? (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
          Connecting…
        </p>
      ) : null}
    </div>
  );

  const botButton = isConnect ? (
    deeplinkState === "waiting" ? (
      <div className="flex w-full flex-col items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-4 text-center dark:bg-muted/30">
        <Loader2 className="h-5 w-5 animate-spin text-[#2AABEE]" />
        <p className="text-sm text-muted-foreground">Tap START in Telegram, then return here</p>
        {deeplinkUrl ? (
          <Button
            type="button"
            size="sm"
            className={connectBotBtnClass}
            onClick={() => openTelegramBotUrl(deeplinkUrl)}
          >
            Open Telegram
          </Button>
        ) : null}
        <Button
          type="button"
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
      <Button type="button" size="lg" className={connectBotBtnClass} onClick={() => void startBotLink()}>
        <Bot className="size-[22px] text-white" aria-hidden />
        Connect via bot
      </Button>
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
      <Bot className="size-5 shrink-0" aria-hidden />
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
