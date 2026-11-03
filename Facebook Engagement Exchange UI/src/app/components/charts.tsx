import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import { useTheme } from "./theme/ThemeProvider";
import type { UserAnalytics } from "../services/api";

/**
 * Categorical slots validated for CVD separation + contrast on the app surfaces
 * (light and dark are separate step choices, not an automatic flip).
 * Fixed order: 1 blue, 2 amber, 3 green, 4 violet.
 */
const PALETTE = {
  light: ["#2563eb", "#d97706", "#059669", "#7c3aed"],
  dark: ["#3b82f6", "#d97706", "#059669", "#8b5cf6"],
} as const;

export function useChartTheme() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  return useMemo(
    () => ({
      isLight,
      series: isLight ? PALETTE.light : PALETTE.dark,
      grid: isLight ? "#e8edf5" : "#2a2a2a",
      axis: isLight ? "#d7dfea" : "#3f3f46",
      tick: isLight ? "#526175" : "#8e8ea0",
      cursor: isLight ? "rgba(15,23,42,0.05)" : "rgba(255,255,255,0.06)",
      surface: isLight ? "#ffffff" : "#18191c",
    }),
    [isLight],
  );
}

export function formatDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-2 font-semibold tracking-tight text-foreground">
        {typeof label === "string" && /^\d{4}-\d{2}-\d{2}$/.test(label) ? formatDay(label) : label}
      </p>
      <ul className="space-y-1.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center justify-between gap-6 tabular-nums">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
              {entry.name}
            </span>
            <span className="font-semibold text-foreground">{Number(entry.value ?? 0).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string; value?: number }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />
          {it.label}
          {it.value != null ? <span className="font-semibold text-foreground tabular-nums">{it.value.toLocaleString()}</span> : null}
        </span>
      ))}
    </div>
  );
}

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 px-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

type Daily = UserAnalytics["daily"];

/** Credits earned vs spent per day (two series, one axis). */
export function CreditsFlowChart({ daily, height = 280 }: { daily: Daily; height?: number }) {
  const t = useChartTheme();
  const totalEarned = daily.reduce((s, d) => s + d.earned, 0);
  const totalSpent = daily.reduce((s, d) => s + d.spent, 0);
  const [earnedColor, spentColor] = [t.series[0], t.series[1]];
  return (
    <div className="space-y-3">
      <ChartLegend
        items={[
          { label: "Earned", color: earnedColor, value: totalEarned },
          { label: "Spent", color: spentColor, value: totalSpent },
        ]}
      />
      {totalEarned + totalSpent === 0 ? (
        <ChartEmpty message="No credit activity in this period yet. Earn credits or launch a campaign to see it here." />
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cf-earned" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={earnedColor} stopOpacity={0.28} />
                <stop offset="100%" stopColor={earnedColor} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="cf-spent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={spentColor} stopOpacity={0.24} />
                <stop offset="100%" stopColor={spentColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={t.grid} strokeDasharray="4 6" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fill: t.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: t.axis }}
              minTickGap={24}
              dy={6}
            />
            <YAxis tick={{ fill: t.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: t.axis, strokeWidth: 1 }} wrapperStyle={{ outline: "none" }} />
            <Area type="monotone" dataKey="earned" name="Earned" stroke={earnedColor} strokeWidth={2} fill="url(#cf-earned)"
              activeDot={{ r: 5, strokeWidth: 2, stroke: t.surface, fill: earnedColor }} />
            <Area type="monotone" dataKey="spent" name="Spent" stroke={spentColor} strokeWidth={2} fill="url(#cf-spent)"
              activeDot={{ r: 5, strokeWidth: 2, stroke: t.surface, fill: spentColor }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** Engagements you completed vs engagements your campaigns received, per day. */
export function EngagementActivityChart({ daily, height = 280 }: { daily: Daily; height?: number }) {
  const t = useChartTheme();
  const done = daily.reduce((s, d) => s + d.engagementsDone, 0);
  const received = daily.reduce((s, d) => s + d.engagementsReceived, 0);
  const [doneColor, receivedColor] = [t.series[0], t.series[1]];
  return (
    <div className="space-y-3">
      <ChartLegend
        items={[
          { label: "You completed", color: doneColor, value: done },
          { label: "Your campaigns received", color: receivedColor, value: received },
        ]}
      />
      {done + received === 0 ? (
        <ChartEmpty message="No engagements in this period yet." />
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid stroke={t.grid} strokeDasharray="4 6" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fill: t.tick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: t.axis }}
              minTickGap={24}
              dy={6}
            />
            <YAxis tick={{ fill: t.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: t.cursor }} wrapperStyle={{ outline: "none" }} />
            <Bar dataKey="engagementsDone" name="You completed" fill={doneColor} radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="engagementsReceived" name="Received" fill={receivedColor} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
