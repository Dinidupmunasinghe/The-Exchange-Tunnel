import { useNavigate } from "react-router";
import { Bot, Link2, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { setupHref, type SetupStepId } from "../../lib/setupStatus";

const COPY: Record<Exclude<SetupStepId, "goal">, { Icon: typeof Bot; title: string; body: string; cta: string }> = {
  telegram: {
    Icon: Link2,
    title: "Connect your Telegram account",
    body: "Exchange Tunnel works with your Telegram account. Connect it to continue — it takes a few seconds.",
    cta: "Connect Telegram",
  },
  phone: {
    Icon: Smartphone,
    title: "Verify your phone to start earning",
    body: "To subscribe, like, comment or repost for you, Telegram needs a one-time login code. It takes about a minute and you can remove it any time.",
    cta: "Verify my phone",
  },
  channel: {
    Icon: Bot,
    title: "Connect your channel first",
    body: "Add our bot as an admin of your Telegram channel, then connect it. Campaigns and reposts use this channel.",
    cta: "Connect my channel",
  },
};

/** Shown when the user taps something they can't do yet — explains why and links to the fix. */
export function FinishSetupDialog({
  step,
  onOpenChange,
  returnTo,
}: {
  step: Exclude<SetupStepId, "goal"> | null;
  onOpenChange: (open: boolean) => void;
  returnTo?: string;
}) {
  const navigate = useNavigate();
  const c = step ? COPY[step] : null;
  return (
    <Dialog open={Boolean(step)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {c ? (
          <>
            <DialogHeader>
              <span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                <c.Icon className="h-5 w-5" />
              </span>
              <DialogTitle>{c.title}</DialogTitle>
              <DialogDescription>{c.body}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Not now
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  navigate(setupHref(step, returnTo));
                }}
              >
                {c.cta}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
