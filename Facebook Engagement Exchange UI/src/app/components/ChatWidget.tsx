import { MessageCircle } from "lucide-react";
import { Button } from "./ui/button";

export function ChatWidget() {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button
        size="lg"
        className="h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-2xl transition-transform hover:scale-105 dark:shadow-[0_0_32px_rgba(96,165,250,0.85),0_0_64px_rgba(34,211,238,0.45),0_0_1px_rgba(255,255,255,0.4)_inset] dark:hover:shadow-[0_0_44px_rgba(96,165,250,0.95),0_0_88px_rgba(34,211,238,0.5)] hover:bg-primary/90"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
    </div>
  );
}
