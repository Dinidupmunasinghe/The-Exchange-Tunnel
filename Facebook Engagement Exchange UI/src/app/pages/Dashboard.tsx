import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  ArrowRight,
  Coins,
  Megaphone,
  MessageCircle,
  Share2,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { CreditsFlowChart, EngagementActivityChart } from "../components/charts";
import { Callout, EmptyState, LinkButton, PageHeader, Section, StatCard } from "../components/kit";
import { SetupChecklist } from "../components/setup/SetupChecklist";
import { api, type UserAnalytics } from "../services/api";
import { setupHref, useSetupStatus } from "../lib/setupStatus";
import { cn } from "../components/ui/utils";

type ActivityType = "like" | "comment" | "share" | "campaign";
type RecentActivityItem = { id: string; action: string; post: string; at: string; type: ActivityType };

const WIZARD_SHOWN_KEY = "exchangeTunnel_wizard_auto_v1";

const activityIcon: Record<ActivityType, { Icon: typeof ThumbsUp; cls: string }> = {
  like: { Icon: ThumbsUp, cls: "bg-primary-soft text-primary-soft-foreground" },
  comment: { Icon: MessageCircle, cls: "bg-violet-500/10 text-violet-600 dark:text-violet-300" },
  share: { Icon: Share2, cls: "bg-success-soft text-success" },
  campaign: { Icon: Megaphone, cls: "bg-warning-soft text-warning" },
};

function timeAgo(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export function Dashboard() {
  const navigate = useNavigate();
  const setup = useSetupStatus();
  const [stats, setStats] = useState<any>(null);
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getDashboard()
      .then((r) => setStats(r.stats))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your dashboard"));
    api.getAnalytics(14).then(setAnalytics).catch(() => undefined);
  }, []);

  // First visit of a new user: open the setup wizard once.
  useEffect(() => {
    if (setup.loading || setup.complete || setup.hasGoal) return;
    try {
      if (localStorage.getItem(WIZARD_SHOWN_KEY)) return;
      localStorage.setItem(WIZARD_SHOWN_KEY, "1");
    } catch {
      return;
    }
    navigate(setupHref(null), { replace: true });
  }, [setup.loading, setup.complete, setup.hasGoal, navigate]);

  const firstName = useMemo(() => {
    const n = String(setup.profile?.name || "").replace(/^@/, "").trim();
    return n ? n.split(/\s+/)[0] : "";
  }, [setup.profile?.name]);

  const recent = (stats?.recentActivity as RecentActivityItem[] | undefined) ?? [];
  const loading = !stats && !error;

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description="Here’s what’s happening with your credits and campaigns."
        actions={
          <>
            <LinkButton to="/earn" variant="outline">
              <Sparkles className="h-4 w-4" /> Earn credits
            </LinkButton>
            <LinkButton to="/submit">
              <Megaphone className="h-4 w-4" /> New campaign
            </LinkButton>
          </>
        }
      />

      <SetupChecklist setup={setup} />

      {error ? <Callout tone="warning">{error}</Callout> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Credit balance"
          value={Number(setup.profile?.credits ?? 0).toLocaleString()}
          hint={`${setup.profile?.plan?.name || "Free"} plan`}
          icon={Coins}
          tone="primary"
          loading={setup.loading}
        />
        <StatCard
          label="Earned (30 days)"
          value={Number(stats?.creditsEarned30d ?? 0).toLocaleString()}
          hint="From completed tasks"
          icon={TrendingUp}
          tone="success"
          loading={loading}
        />
        <StatCard
          label="Active campaigns"
          value={Number(stats?.activeCampaigns ?? 0).toLocaleString()}
          hint="Running right now"
          icon={Activity}
          tone="warning"
          loading={loading}
        />
        <StatCard
          label="Spent (30 days)"
          value={Number(stats?.creditsSpent30d ?? 0).toLocaleString()}
          hint="On campaigns, net of refunds"
          icon={Wallet}
          tone="violet"
          loading={loading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Engagement activity" description="Last 14 days">
          {analytics ? <EngagementActivityChart daily={analytics.daily} height={240} /> : <div className="h-[270px]" />}
        </Section>
        <Section title="Credit flow" description="Earned vs. spent, last 14 days">
          {analytics ? <CreditsFlowChart daily={analytics.daily} height={240} /> : <div className="h-[270px]" />}
        </Section>
      </div>

      <Section
        title="Recent activity"
        description="Your latest credits and campaigns"
        actions={
          <LinkButton to="/wallet" variant="ghost" size="sm">
            View all <ArrowRight className="h-4 w-4" />
          </LinkButton>
        }
      >
        {recent.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description="Complete a task or launch a campaign — it will show up here."
            action={
              <LinkButton to={setup.canEarn ? "/earn" : setupHref(setup.nextStep?.id)} size="sm">
                {setup.canEarn ? "Start earning" : "Finish setup"}
              </LinkButton>
            }
            className="border-0 py-8"
          />
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((a) => {
              const meta = activityIcon[a.type] || activityIcon.campaign;
              return (
                <li key={a.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", meta.cls)}>
                    <meta.Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{a.action}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.post}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
