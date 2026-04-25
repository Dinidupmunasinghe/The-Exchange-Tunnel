import { ReactNode } from "react";
import { Button } from "../../components/ui/button";

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatusPill({ value }: { value: string }) {
  const v = String(value || "").toLowerCase();
  const map: Record<string, string> = {
    active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    completed: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    paused: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    pending: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    open: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    assigned: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    cancelled: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    settled: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    blocked: "border-rose-500/40 bg-rose-500/10 text-rose-300"
  };
  const cls = map[v] || "border-slate-500/40 bg-slate-500/10 text-slate-300";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {value}
    </span>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-2">{children}</div>;
}

export function Paginator({
  pagination,
  onChange,
  disabled
}: {
  pagination: Pagination | null;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  if (!pagination) return null;
  const { page, totalPages, total } = pagination;
  return (
    <div className="flex items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
      <span>
        Page {page} of {totalPages} · {total} record{total === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={disabled || page <= 1}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={disabled || page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function FormError({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <p className="mt-2 text-sm text-destructive">{error}</p>;
}

export function FormMessage({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <p className="mt-2 text-sm text-emerald-400">{message}</p>;
}

export function EmptyTableRow({ message, colSpan }: { message: string; colSpan: number }) {
  return (
    <tr>
      <td className="px-3 py-6 text-center text-sm text-muted-foreground" colSpan={colSpan}>
        {message}
      </td>
    </tr>
  );
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}
