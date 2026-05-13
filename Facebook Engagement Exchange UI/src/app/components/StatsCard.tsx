import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { cn } from "./ui/utils";

export type StatsAccent = "blue" | "emerald" | "amber" | "rose";

interface StatsCardProps {
  title: string;
  value: string;
  change: string;
  icon: LucideIcon;
  trend?: "up" | "down";
  accent?: StatsAccent;
}

const accentTile: Record<StatsAccent, string> = {
  blue:
    "bg-blue-500/10 text-blue-600 ring-1 ring-inset ring-blue-500/15 dark:bg-blue-500/15 dark:text-blue-400 dark:ring-blue-400/25",
  emerald:
    "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/15 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-400/25",
  amber:
    "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/15 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-400/25",
  rose:
    "bg-rose-500/10 text-rose-600 ring-1 ring-inset ring-rose-500/15 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-400/25",
};

const accentGlow: Record<StatsAccent, string> = {
  blue: "dark:hover:shadow-[0_0_0_1px_rgba(59,130,246,0.28)_inset,0_18px_40px_-18px_rgba(59,130,246,0.55)]",
  emerald:
    "dark:hover:shadow-[0_0_0_1px_rgba(16,185,129,0.28)_inset,0_18px_40px_-18px_rgba(16,185,129,0.45)]",
  amber:
    "dark:hover:shadow-[0_0_0_1px_rgba(245,158,11,0.28)_inset,0_18px_40px_-18px_rgba(245,158,11,0.45)]",
  rose: "dark:hover:shadow-[0_0_0_1px_rgba(244,63,94,0.28)_inset,0_18px_40px_-18px_rgba(244,63,94,0.5)]",
};

const trendPill: Record<"up" | "down", string> = {
  up: "bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/15 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-400/25",
  down: "bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/15 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-400/25",
};

export function StatsCard({
  title,
  value,
  change,
  icon: Icon,
  trend = "up",
  accent = "blue",
}: StatsCardProps) {
  return (
    <Card
      className={cn(
        "group relative overflow-hidden border-border bg-card transition-all duration-300",
        "hover:-translate-y-0.5 hover:shadow-lg",
        "dark:bg-gradient-to-br dark:from-card dark:to-card/70",
        accentGlow[accent],
      )}
    >
      <CardContent className="px-4 py-[21px]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate whitespace-nowrap text-[13px] font-medium text-muted-foreground">
              {title}
            </p>
            <div className="mt-1 flex items-center gap-2 whitespace-nowrap">
              <p className="truncate text-[21px] font-semibold tracking-tight text-foreground tabular-nums leading-none">
                {value}
              </p>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none",
                  trendPill[trend],
                )}
              >
                <ArrowUpRight className={cn("h-2.5 w-2.5", trend === "down" && "rotate-180")} />
                {change}
              </span>
            </div>
          </div>
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-300 group-hover:scale-105",
              accentTile[accent],
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={2.25} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
