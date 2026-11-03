import { Link } from "react-router";
import { ArrowRight, CheckCircle2, Circle, Rocket } from "lucide-react";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { cn } from "../ui/utils";
import { setupHref, type SetupInfo } from "../../lib/setupStatus";

/** "Getting started" card shown on the dashboard (and other pages) until setup is complete. */
export function SetupChecklist({ setup, className }: { setup: SetupInfo; className?: string }) {
  if (setup.complete) return null;
  const pct = Math.round((setup.doneCount / Math.max(1, setup.total)) * 100);
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-info-border bg-gradient-to-br from-primary-soft via-card to-card shadow-xs",
        className,
      )}
    >
      <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:gap-8 md:p-6">
        <div className="md:w-64 md:shrink-0">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Rocket className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-lg font-semibold text-foreground">Finish setting up</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {setup.doneCount} of {setup.total} steps done — takes about 2 minutes.
          </p>
          <Progress value={pct} className="mt-3 h-2" aria-label="Setup progress" />
        </div>
        <ol className="flex-1 space-y-2">
          {setup.steps.map((s) => {
            const isNext = setup.nextStep?.id === s.id;
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3",
                  s.done ? "border-transparent bg-transparent" : isNext ? "border-info-border bg-card" : "border-border bg-card/60",
                )}
              >
                {s.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Done" />
                ) : (
                  <Circle className={cn("h-5 w-5 shrink-0", isNext ? "text-primary" : "text-muted-foreground/50")} aria-label="To do" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", s.done ? "text-muted-foreground line-through" : "text-foreground")}>{s.title}</p>
                  {!s.done ? <p className="text-xs text-muted-foreground">{s.unlocks}</p> : null}
                </div>
                {isNext ? (
                  <Button asChild size="sm">
                    <Link to={setupHref(s.id)}>
                      Start <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
