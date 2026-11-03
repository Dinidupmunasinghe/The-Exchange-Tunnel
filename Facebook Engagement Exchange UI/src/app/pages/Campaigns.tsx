import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Copy,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Trash2
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../components/ui/alert-dialog";
import { Progress } from "../components/ui/progress";
import { api } from "../services/api";
import { getEngagementLabel } from "../lib/engagement";
import { toast } from "sonner";
import { Activity, FolderOpen, Megaphone, Coins as CoinsIcon } from "lucide-react";
import { Callout, EmptyState, LinkButton, PageHeader, SegmentedControl, StatCard, StatusBadge } from "../components/kit";

function isCampaignLive(c: { status: string; scheduledLaunchAt?: string | null }) {
  if (c.status === "active") return true;
  if (c.status === "pending" && c.scheduledLaunchAt && new Date(c.scheduledLaunchAt) <= new Date()) return true;
  return false;
}

function canPause(status: string) {
  return status === "active" || status === "pending";
}

export function Campaigns() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedPageName, setSelectedPageName] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await api.getCampaigns();
    setCampaigns(res.campaigns);
  }, []);

  useEffect(() => {
    api
      .getCampaigns()
      .then((res) => setCampaigns(res.campaigns))
      .catch(() => setCampaigns([]));
    api
      .getProfile()
      .then((res) =>
        setSelectedPageName(
          (res.user as { telegramActingChannelTitle?: string | null })?.telegramActingChannelTitle ?? null
        )
      )
      .catch(() => setSelectedPageName(null));
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get("q") || "").trim().toLowerCase();
  const visibleCampaigns = useMemo(
    () =>
      query
        ? campaigns.filter((c) =>
            [c.name, c.messageUrl, c.engagementType].some((v) => String(v || "").toLowerCase().includes(query))
          )
        : campaigns,
    [campaigns, query]
  );
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "paused" | "ended">("all");
  const filteredCampaigns = useMemo(
    () =>
      visibleCampaigns.filter((c) =>
        statusFilter === "all"
          ? true
          : statusFilter === "running"
            ? c.status === "active" || c.status === "pending"
            : statusFilter === "paused"
              ? c.status === "paused"
              : c.status === "completed" || c.status === "cancelled"
      ),
    [visibleCampaigns, statusFilter]
  );
  const activeCount = campaigns.filter(isCampaignLive).length;
  const totalEngagements = campaigns.reduce((sum, c) => sum + (c.completedEngagements || 0), 0);
  const totalSpent = campaigns.reduce((sum, c) => sum + (c.spentCredits || 0), 0);

  async function handlePause(id: number) {
    setBusyId(id);
    try {
      await api.updateCampaign(id, { action: "pause" });
      toast.success("Campaign paused", { description: "Tasks are hidden until you resume." });
      await refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not pause");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResume(id: number) {
    setBusyId(id);
    try {
      await api.updateCampaign(id, { action: "resume" });
      toast.success("Campaign resumed");
      await refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not resume");
    } finally {
      setBusyId(null);
    }
  }

  async function copyPostUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Post URL copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteCampaign(deleteTarget.id);
      toast.success("Campaign deleted", {
        description: "Unused credits were returned to your balance."
      });
      setDeleteTarget(null);
      await refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My campaigns"
        description="See how your campaigns are doing. Pause or delete any time — unused credits come back to you."
        actions={
          <LinkButton to="/submit">
            <Megaphone className="h-4 w-4" /> New campaign
          </LinkButton>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Running campaigns" value={activeCount} icon={Activity} tone="success" />
        <StatCard label="Completed actions" value={totalEngagements.toLocaleString()} hint="Subscribers, likes, comments and reposts" icon={FolderOpen} tone="primary" />
        <StatCard label="Credits spent" value={totalSpent.toLocaleString()} hint="Only for completed actions" icon={CoinsIcon} tone="violet" />
      </div>

      {!selectedPageName ? (
        <Callout
          tone="warning"
          title="No channel connected"
          action={<LinkButton to="/get-started?step=channel&returnTo=%2Fcampaigns" size="sm">Connect channel</LinkButton>}
        >
          Connect your Telegram channel to launch new campaigns.
        </Callout>
      ) : (
        <p className="text-sm text-muted-foreground">
          Promoting <span className="font-medium text-foreground">{selectedPageName}</span>
        </p>
      )}

      {campaigns.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            ariaLabel="Filter campaigns"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All", count: visibleCampaigns.length },
              { value: "running", label: "Running" },
              { value: "paused", label: "Paused" },
              { value: "ended", label: "Ended" },
            ]}
          />
          {query ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              Results for <span className="font-medium text-foreground">“{searchParams.get("q")}”</span>
              <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>
                Clear
              </Button>
            </span>
          ) : null}
        </div>
      ) : null}

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Launch a campaign to get subscribers, likes, comments or reposts on your Telegram channel."
          action={<LinkButton to="/submit">Launch your first campaign</LinkButton>}
        />
      ) : filteredCampaigns.length === 0 ? (
        <EmptyState title="Nothing here" description="No campaigns match this filter." />
      ) : null}

      <div className="space-y-4">
        {filteredCampaigns.map((campaign) => {
          const creditsTotal = campaign.maxEngagements * campaign.creditsPerEngagement;
          const creditsSpent = campaign.spentCredits || 0;
          const progress = creditsTotal ? (creditsSpent / creditsTotal) * 100 : 0;
          const busy = busyId === campaign.id;
          const title = campaign.name || `Campaign #${campaign.id}`;

          return (
            <Card key={campaign.id} className="transition-shadow hover:shadow-md">
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1 space-y-4 min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-base font-semibold text-foreground">{title}</h3>
                          <StatusBadge status={campaign.status} />
                          <Badge variant="outline" className="border-border">
                            {getEngagementLabel(campaign.engagementType)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Created {new Date(campaign.createdAt).toLocaleString()}
                          {campaign.scheduledLaunchAt ? (
                            <>
                              {" · "}
                              Launch{" "}
                              {campaign.status === "pending"
                                ? `scheduled ${new Date(campaign.scheduledLaunchAt).toLocaleString()}`
                                : `was ${new Date(campaign.scheduledLaunchAt).toLocaleString()}`}
                            </>
                          ) : null}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Budget used</span>
                        <span className="font-medium text-foreground">
                          {creditsSpent} / {creditsTotal} credits
                        </span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    <div className="flex flex-wrap items-center gap-6 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Completed:</span>
                        <span className="font-semibold text-foreground">
                          {campaign.completedEngagements} / {campaign.maxEngagements}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">
                    <Button variant="outline" size="sm" asChild disabled={busy}>
                      <a href={campaign.soundcloudPostUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {campaign.engagementType === "subscribe" ? "View channel" : "View post"}
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => copyPostUrl(campaign.soundcloudPostUrl)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy URL
                    </Button>
                    {canPause(campaign.status) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => handlePause(campaign.id)}
                      >
                        {busy ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Pause className="mr-2 h-4 w-4" />
                        )}
                        Pause
                      </Button>
                    ) : null}
                    {campaign.status === "paused" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => handleResume(campaign.id)}
                      >
                        {busy ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="mr-2 h-4 w-4" />
                        )}
                        Resume
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={busy}
                      onClick={() =>
                        setDeleteTarget({
                          id: campaign.id,
                          name: title
                        })
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  <span className="font-medium text-foreground">{deleteTarget.name}</span> will be removed. Open task
                  slots are cancelled and unused credits are refunded to your wallet. This cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
