/**
 * Exchange Tunnel UI kit — the shared building blocks every page uses, so headers, notices,
 * stats, statuses and empty/loading states look the same everywhere.
 */
import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "./ui/utils";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

/* ── Logo ─────────────────────────────────────────────────────────── */

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#2aabee] to-[#0b78c4] text-white shadow-sm",
        className,
      )}
      aria-hidden
    >
      {/* Paper plane inside a tunnel ring */}
      <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="none">
        <path
          d="M21.5 3.5 2.9 10.7c-.9.35-.88 1.63.03 1.95l4.57 1.62 1.7 5.36c.25.8 1.27 1.03 1.85.42l2.53-2.66 4.6 3.4c.66.49 1.6.12 1.76-.69L22.98 4.9c.18-.9-.65-1.66-1.48-1.4Z"
          fill="currentColor"
        />
        <path d="m8 14.2 9.5-7.2-7.3 8.4" stroke="#0b78c4" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact ? (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">Exchange Tunnel</span>
      ) : null}
    </span>
  );
}

/* ── Page header ──────────────────────────────────────────────────── */

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</div> : null}
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ── Callout (notices / banners) ─────────────────────────────────── */

type Tone = "info" | "success" | "warning" | "danger" | "neutral";

const toneClasses: Record<Tone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: "border-info-border bg-info-soft", icon: "text-info", Icon: Info },
  success: { box: "border-success-border bg-success-soft", icon: "text-success", Icon: CheckCircle2 },
  warning: { box: "border-warning-border bg-warning-soft", icon: "text-warning", Icon: AlertTriangle },
  danger: { box: "border-destructive-border bg-destructive-soft", icon: "text-destructive", Icon: XCircle },
  neutral: { box: "border-border bg-card", icon: "text-muted-foreground", Icon: Info },
};

export function Callout({
  tone = "info",
  title,
  children,
  action,
  icon,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const t = toneClasses[tone];
  const Icon = icon || t.Icon;
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3.5 sm:flex-row sm:items-center", t.box, className)}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", t.icon)} aria-hidden />
        <div className="min-w-0 text-sm">
          {title ? <p className="font-semibold text-foreground">{title}</p> : null}
          {children ? <div className={cn("text-muted-foreground", title && "mt-0.5")}>{children}</div> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 gap-2 sm:ml-2">{action}</div> : null}
    </div>
  );
}

/* ── Stat card ────────────────────────────────────────────────────── */

export type StatTone = "primary" | "success" | "warning" | "violet" | "neutral";

const statTile: Record<StatTone, string> = {
  primary: "bg-primary-soft text-primary-soft-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  neutral: "bg-muted text-muted-foreground",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  loading,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", statTile[tone])}>
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p className="mt-1 text-[28px] font-semibold leading-none tracking-tight text-foreground tabular-nums">{value}</p>
      )}
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ── Status badge ─────────────────────────────────────────────────── */

const statusMap: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-success-soft text-success border-success-border" },
  pending: { label: "Scheduled", cls: "bg-info-soft text-info border-info-border" },
  scheduled: { label: "Scheduled", cls: "bg-info-soft text-info border-info-border" },
  paused: { label: "Paused", cls: "bg-warning-soft text-warning border-warning-border" },
  completed: { label: "Completed", cls: "bg-muted text-muted-foreground border-border" },
  cancelled: { label: "Cancelled", cls: "bg-destructive-soft text-destructive border-destructive-border" },
  open: { label: "Open", cls: "bg-info-soft text-info border-info-border" },
  assigned: { label: "Waiting", cls: "bg-warning-soft text-warning border-warning-border" },
  connected: { label: "Connected", cls: "bg-success-soft text-success border-success-border" },
  missing: { label: "Not set up", cls: "bg-warning-soft text-warning border-warning-border" },
};

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const s = statusMap[String(status).toLowerCase()] || {
    label: status,
    cls: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        s.cls,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label || s.label}
    </span>
  );
}

/* ── Empty state ──────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
      ) : null}
      <p className="font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ── Loading skeletons ────────────────────────────────────────────── */

export function ListSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="mt-4 h-20 w-full" />
        </div>
      ))}
    </div>
  );
}

/* ── Segmented control ────────────────────────────────────────────── */

export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1", className)}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              selected ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {o.count != null ? (
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", selected ? "bg-primary-soft text-primary-soft-foreground" : "bg-card")}>
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── Section card ─────────────────────────────────────────────────── */

export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card shadow-xs", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold text-foreground">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ── Link button helper ───────────────────────────────────────────── */

export function LinkButton({
  to,
  children,
  variant = "default",
  size = "default",
  className,
}: {
  to: string;
  children: ReactNode;
  variant?: "default" | "outline" | "soft" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <Link to={to}>{children}</Link>
    </Button>
  );
}
