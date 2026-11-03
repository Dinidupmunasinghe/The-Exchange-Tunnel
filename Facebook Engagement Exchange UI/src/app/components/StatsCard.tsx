import type { LucideIcon } from "lucide-react";
import { StatCard, type StatTone } from "./kit";

export type StatsAccent = "blue" | "emerald" | "amber" | "rose";

const toneFor: Record<StatsAccent, StatTone> = {
  blue: "primary",
  emerald: "success",
  amber: "warning",
  rose: "violet",
};

/** Legacy API kept for existing pages; renders the shared kit StatCard. */
export function StatsCard({
  title,
  value,
  change,
  icon,
  accent = "blue",
}: {
  title: string;
  value: string;
  change: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  accent?: StatsAccent;
}) {
  return <StatCard label={title} value={value} hint={change} icon={icon} tone={toneFor[accent]} />;
}
