import { MessageCircle } from "lucide-react";
import { Button } from "./ui/button";

export function ChatWidget() {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button
        size="lg"
        className="h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-2xl hover:bg-primary/90 hover:scale-105 transition-transform"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
    </div>
  );
}
