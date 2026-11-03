import { LifeBuoy } from "lucide-react";
import { Button } from "./ui/button";

const BOT = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "").trim();

/** Floating help button: opens the Telegram bot (support) or the in-app settings help. */
export function ChatWidget() {
  const href = BOT ? `https://t.me/${BOT}` : "/settings";
  return (
    <div className="fixed bottom-6 right-6 z-40">
      <Button
        asChild
        size="lg"
        className="h-12 w-12 rounded-full bg-primary p-0 text-primary-foreground shadow-lg hover:bg-primary/90"
      >
        <a href={href} target={BOT ? "_blank" : undefined} rel="noreferrer" aria-label="Get help" title="Get help">
          <LifeBuoy className="h-5 w-5" />
        </a>
      </Button>
    </div>
  );
}
