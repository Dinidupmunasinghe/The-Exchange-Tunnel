import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Bell,
  ExternalLink,
  Repeat2,
  Coins,
  CreditCard,
  Activity,
  CircleCheck,
  CircleDashed,
  XCircle,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { api } from "../services/api";
import { cn } from "./ui/utils";

type RepostRequest = {
  id: number;
  campaignId: number;
  status: string;
  rewardCredits: number;
  createdAt?: string;
  campaign?: {
    id: number;
    name?: string;
    messageUrl?: string;
    status?: string;
  };
  assignee?: {
    id: number;
    name?: string | null;
    email?: string;
    telegramActingChannelTitle?: string | null;
  } | null;
  taskStatus?: string | null;
};

type Transaction = {
  id: number;
  type: "earn" | "spend";
  amount: number;
  description?: string | null;
  createdAt?: string;
};

type NotificationCategory = "request" | "payment" | "credit" | "action";

type NotificationItem = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  createdAt: string;
  status?: "completed" | "cancelled" | "pending" | null;
  href?: string;
  externalUrl?: string | null;
  meta?: string;
};

const filters: Array<{ id: "all" | NotificationCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "request", label: "Requests" },
  { id: "payment", label: "Payments" },
  { id: "credit", label: "Credits" },
  { id: "action", label: "Actions" },
];

const categoryStyle: Record<
  NotificationCategory,
  { tile: string; icon: typeof Bell; pill: string; label: string }
> = {
  request: {
    tile: "bg-blue-500/10 text-blue-600 ring-1 ring-inset ring-blue-500/15 dark:bg-blue-500/15 dark:text-blue-400 dark:ring-blue-400/25",
    icon: Repeat2,
    pill: "bg-blue-500/10 text-blue-700 ring-1 ring-inset ring-blue-500/15 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/25",
    label: "Request",
  },
  payment: {
    tile: "bg-rose-500/10 text-rose-600 ring-1 ring-inset ring-rose-500/15 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-400/25",
    icon: CreditCard,
    pill: "bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/15 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25",
    label: "Payment",
  },
  credit: {
    tile: "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/15 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-400/25",
    icon: Coins,
    pill: "bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/15 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25",
    label: "Credit",
  },
  action: {
    tile: "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/15 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-400/25",
    icon: Activity,
    pill: "bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/15 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25",
    label: "Action",
  },
};

function formatRelative(value?: string) {
  if (!value) return "";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  const sec = Math.max(1, Math.round(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function classifyTransaction(t: Transaction): NotificationCategory {
  const desc = String(t.description || "").toLowerCase();
  if (/(package|purchase|topup|top-up|payment|invoice|refund)/.test(desc)) {
    return "payment";
  }
  if (/(campaign|task|repost)/.test(desc)) {
    return "action";
  }
  return "credit";
}

function statusFromTransaction(t: Transaction): NotificationItem["status"] {
  const desc = String(t.description || "").toLowerCase();
  if (/cancel|refund/.test(desc)) return "cancelled";
  return "completed";
}

function statusFromRequest(r: RepostRequest): NotificationItem["status"] {
  const s = String(r.taskStatus || r.status || "").toLowerCase();
  if (s === "completed") return "completed";
  if (s === "cancelled") return "cancelled";
  return "pending";
}

function readSeenAtFromStorage(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = Number(window.localStorage.getItem("notifications_seen_at") || 0);
    return Number.isFinite(raw) ? raw : 0;
  } catch {
    return 0;
  }
}

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [received, setReceived] = useState<RepostRequest[]>([]);
  const [sent, setSent] = useState<RepostRequest[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [readKey, setReadKey] = useState<number>(0);

  useEffect(() => {
    setReadKey(readSeenAtFromStorage());
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [recv, sentRes, tx] = await Promise.all([
        api.listRepostRequests("received").catch(() => ({ requests: [] as RepostRequest[] })),
        api.listRepostRequests("sent").catch(() => ({ requests: [] as RepostRequest[] })),
        api.getTransactions().catch(() => ({ transactions: [] as Transaction[] })),
      ]);
      setReceived((recv.requests || []) as RepostRequest[]);
      setSent((sentRes.requests || []) as RepostRequest[]);
      setTransactions((tx.transactions || []) as Transaction[]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(true), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const notifications = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];

    for (const r of received) {
      items.push({
        id: `req-r-${r.id}`,
        category: "request",
        title: "New repost request received",
        body: `${r.campaign?.name || `Campaign #${r.campaignId}`} • ${r.rewardCredits} credits`,
        createdAt: r.createdAt || "",
        status: statusFromRequest(r),
        href: "/repost?tab=received",
        externalUrl: r.campaign?.messageUrl || null,
        meta: "Received",
      });
    }
    for (const r of sent) {
      items.push({
        id: `req-s-${r.id}`,
        category: "request",
        title: "Repost request sent",
        body: `${r.campaign?.name || `Campaign #${r.campaignId}`} • ${r.rewardCredits} credits`,
        createdAt: r.createdAt || "",
        status: statusFromRequest(r),
        href: "/repost?tab=sent",
        externalUrl: r.campaign?.messageUrl || null,
        meta: "Sent",
      });
    }
    for (const t of transactions) {
      const cat = classifyTransaction(t);
      const sign = t.type === "earn" ? "+" : "-";
      const amount = Math.abs(Number(t.amount) || 0);
      const title =
        cat === "payment"
          ? t.type === "spend"
            ? "Payment charged"
            : "Credits added to wallet"
          : cat === "action"
            ? t.description || "Account activity"
            : t.type === "earn"
              ? "Credits earned"
              : "Credits spent";
      items.push({
        id: `tx-${t.id}`,
        category: cat,
        title,
        body: `${sign}${amount} credits${t.description ? ` • ${t.description}` : ""}`,
        createdAt: t.createdAt || "",
        status: statusFromTransaction(t),
        href: cat === "payment" ? "/wallet" : "/wallet",
        meta: t.type === "earn" ? "Earned" : "Spent",
      });
    }

    return items.sort((a, b) => {
      const at = new Date(a.createdAt || 0).getTime();
      const bt = new Date(b.createdAt || 0).getTime();
      return bt - at;
    });
  }, [received, sent, transactions]);

  const visible = useMemo(
    () => (filter === "all" ? notifications : notifications.filter((n) => n.category === filter)),
    [notifications, filter],
  );

  const unreadCount = useMemo(
    () =>
      notifications.filter((n) => {
        const t = new Date(n.createdAt || 0).getTime();
        return t > readKey;
      }).length,
    [notifications, readKey],
  );

  function markAllRead() {
    const now = Date.now();
    setReadKey(now);
    try {
      window.localStorage.setItem("notifications_seen_at", String(now));
    } catch {
      /* private mode / blocked storage */
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && unreadCount > 0) {
      window.setTimeout(markAllRead, 600);
    }
  }

  return (
    <Popover modal={false} open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0 rounded-full border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Open notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={16}
        className="z-[110] w-[min(100vw-2rem,22rem)] p-0 sm:w-[26rem]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-foreground" />
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            {notifications.length > 0 ? (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                {notifications.length}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => void load()}
              aria-label="Refresh notifications"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            {unreadCount > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={markAllRead}
              >
                Mark all read
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
          {filters.map((f) => {
            const active = filter === f.id;
            const count =
              f.id === "all"
                ? notifications.length
                : notifications.filter((n) => n.category === f.id).length;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    active ? "bg-background/20 text-background" : "bg-card text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-foreground">You're all caught up</p>
              <p className="text-xs text-muted-foreground">
                {filter === "all"
                  ? "No notifications yet."
                  : `No ${filter} notifications right now.`}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visible.slice(0, 30).map((n) => {
                const style = categoryStyle[n.category];
                const Icon = style.icon;
                return (
                  <li
                    key={n.id}
                    className="group flex gap-3 px-4 py-3 transition-colors hover:bg-accent/60"
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        style.tile,
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2.25} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{n.title}</p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {n.status === "completed" ? (
                            <CircleCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : n.status === "cancelled" ? (
                            <XCircle className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" />
                          ) : n.status === "pending" ? (
                            <CircleDashed className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                            style.pill,
                          )}
                        >
                          {style.label}
                        </span>
                        {n.meta ? (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {n.meta}
                          </span>
                        ) : null}
                        <span className="text-[11px] text-muted-foreground">
                          {formatRelative(n.createdAt)}
                        </span>
                        {n.externalUrl ? (
                          <a
                            href={n.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : n.href ? (
                          <Link
                            to={n.href}
                            onClick={() => setOpen(false)}
                            className="ml-auto inline-flex items-center text-[11px] font-medium text-primary hover:underline"
                          >
                            View
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-4 py-2 text-right">
          <Link
            to="/repost?tab=received"
            onClick={() => setOpen(false)}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            View all activity
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
