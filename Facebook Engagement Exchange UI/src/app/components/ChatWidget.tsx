import { MessageCircle } from "lucide-react";
import { Button } from "./ui/button";

export function ChatWidget() {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button
        size="lg"
        className="h-14 w-14 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
    </div>
  );
}
