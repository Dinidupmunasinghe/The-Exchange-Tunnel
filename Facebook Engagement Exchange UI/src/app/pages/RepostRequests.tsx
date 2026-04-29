import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Users, Repeat2, ExternalLink, Bell, CircleCheck, CircleDashed, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { api } from "../services/api";

type RepostChannel = {
  userId: number;
  channelId: string;
  channelName: string;
  subscribers: number;
  imageUrl: string | null;
  credits: number | null;
};

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

export function RepostRequests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [messageUrl, setMessageUrl] = useState("");
  const [channels, setChannels] = useState<RepostChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestingUserId, setRequestingUserId] = useState<number | null>(null);
  const tabParam = String(searchParams.get("tab") || "send").toLowerCase();
  const paneParam = String(searchParams.get("pane") || "").toLowerCase();
  const showNotificationPane = paneParam === "notifications";
  const tab: "send" | "received" | "sent" =
    tabParam === "received" ? "received" : tabParam === "sent" ? "sent" : "send";
  const [receivedRequests, setReceivedRequests] = useState<RepostRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<RepostRequest[]>([]);
  const [cancellingCampaignId, setCancellingCampaignId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadChannels() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listRepostChannels();
      setChannels((res.channels || []) as RepostChannel[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load channels");
    } finally {
      setLoading(false);
    }
  }

  async function loadRequests(which: "received" | "sent", silent = false) {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await api.listRepostRequests(which);
      const rows = (res.requests || []) as RepostRequest[];
      if (which === "received") setReceivedRequests(rows);
      else setSentRequests(rows);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Failed to load repost requests");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadChannels();
    void loadRequests("received", true);
    void loadRequests("sent", true);
  }, []);

  useEffect(() => {
    if (tab === "received") void loadRequests("received");
    if (tab === "sent") void loadRequests("sent");
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  function setTab(next: "send" | "received" | "sent") {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "send") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setSearchParams(nextParams);
  }

  function closeNotificationPane() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("pane");
    setSearchParams(nextParams);
  }

  const readyUrl = useMemo(() => String(messageUrl || "").trim(), [messageUrl]);

  async function handleRequest(userId: number) {
    if (!readyUrl) {
      setError("Paste your Telegram post URL first");
      return;
    }
    setRequestingUserId(userId);
    setError(null);
    setNotice(null);
    try {
      const res = await api.requestRepost({ targetUserId: userId, messageUrl: readyUrl });
      setNotice(res.message || `Repost request sent. Charged ${res.chargedCredits} credits.`);
      await loadRequests("sent", true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send repost request");
    } finally {
      setRequestingUserId(null);
    }
  }

  async function handleCancelRequest(campaignId: number) {
    setCancellingCampaignId(campaignId);
    setError(null);
    setNotice(null);
    try {
      await api.deleteCampaign(campaignId);
      setNotice("Repost request cancelled");
      await loadRequests("sent", true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel request");
    } finally {
      setCancellingCampaignId(null);
    }
  }

  function formatDateTime(value?: string) {
    if (!value) return "Unknown time";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Unknown time";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(d);
  }

  function statusBadge(status?: string | null) {
    const v = String(status || "").toLowerCase();
    if (v === "completed") return <Badge className="bg-emerald-500/15 text-emerald-300">Completed</Badge>;
    if (v === "cancelled") return <Badge className="bg-rose-500/15 text-rose-300">Cancelled</Badge>;
    if (v === "assigned" || v === "active")
      return <Badge className="bg-amber-500/15 text-amber-300">{v === "assigned" ? "Pending action" : "Active"}</Badge>;
    return <Badge variant="outline">{status || "Unknown"}</Badge>;
  }

  const notifications = useMemo(() => {
    const received = receivedRequests.map((r) => ({
      id: `r-${r.id}`,
      createdAt: r.createdAt || "",
      title: "New repost request received",
      body: `${r.campaign?.name || `Campaign #${r.campaignId}`} • ${r.rewardCredits} credits`,
      type: "received" as const,
      request: r
    }));
    const sent = sentRequests.map((r) => ({
      id: `s-${r.id}`,
      createdAt: r.createdAt || "",
      title: "Repost request sent",
      body: `${r.campaign?.name || `Campaign #${r.campaignId}`} • ${r.rewardCredits} credits`,
      type: "sent" as const,
      request: r
    }));
    return [...received, ...sent].sort((a, b) => {
      const at = new Date(a.createdAt || 0).getTime();
      const bt = new Date(b.createdAt || 0).getTime();
      return bt - at;
    });
  }, [receivedRequests, sentRequests]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">Request Repost</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your source Telegram post, then pick a connected channel to request a repost.
        </p>
      </div>

      <div className="inline-flex rounded-lg border border-border bg-card p-1">
        <Button
          type="button"
          size="sm"
          variant={tab === "send" ? "default" : "ghost"}
          onClick={() => setTab("send")}
          className="rounded-md"
        >
          Send Request
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "received" ? "default" : "ghost"}
          onClick={() => setTab("received")}
          className="rounded-md"
        >
          Received Requests
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "sent" ? "default" : "ghost"}
          onClick={() => setTab("sent")}
          className="rounded-md"
        >
          Sent Requests
        </Button>
      </div>

      {tab === "send" ? (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Connect a post</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={messageUrl}
            onChange={(e) => setMessageUrl(e.target.value)}
            placeholder="https://t.me/yourchannel/123"
          />
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void loadChannels()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh channels"}
            </Button>
            <p className="text-xs text-muted-foreground">Paste any valid Telegram post link to request repost.</p>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}
        </CardContent>
      </Card>
      ) : null}

      {tab === "send" ? (
      <div className="grid gap-4 md:grid-cols-2">
        {channels.map((ch) => (
          <Card key={ch.userId} className="border-border bg-card">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border bg-secondary/40">
                  {ch.imageUrl ? (
                    <img src={ch.imageUrl} alt={ch.channelName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Users className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">{ch.channelName}</p>
                  <p className="text-xs text-muted-foreground">
                    {Number(ch.subscribers || 0).toLocaleString()} subscribers
                  </p>
                  <p className="mt-1 text-sm text-primary">
                    Charge: {ch.credits != null ? `${ch.credits} credits` : "No pricing rule"}
                  </p>
                </div>
              </div>
              <Button
                className="mt-4 w-full"
                disabled={requestingUserId === ch.userId || ch.credits == null || !readyUrl}
                onClick={() => void handleRequest(ch.userId)}
              >
                <Repeat2 className="mr-2 h-4 w-4" />
                {requestingUserId === ch.userId ? "Requesting..." : "Request Repost"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      ) : null}

      {tab === "send" && !loading && channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No connected channels are available yet.</p>
      ) : null}

      {tab === "received" ? (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Received repost requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {receivedRequests.map((row) => (
              <div key={row.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{row.campaign?.name || `Request #${row.id}`}</p>
                    <p className="text-xs text-muted-foreground">Reward: {row.rewardCredits} credits</p>
                    <p className="text-xs text-muted-foreground">Received: {formatDateTime(row.createdAt)}</p>
                  </div>
                  {statusBadge(row.taskStatus || row.status)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {row.campaign?.messageUrl ? (
                    <Button type="button" size="sm" variant="outline" asChild>
                      <a href={row.campaign.messageUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1 h-3.5 w-3.5" />
                        Open Source Post
                      </a>
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" asChild>
                    <Link to="/earn">Complete in Earn Credits</Link>
                  </Button>
                </div>
              </div>
            ))}
            {!loading && receivedRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No received repost requests yet.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {tab === "sent" ? (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Sent repost requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sentRequests.map((row) => (
              <div key={row.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{row.campaign?.name || `Campaign #${row.campaignId}`}</p>
                    <p className="text-xs text-muted-foreground">Charge: {row.rewardCredits} credits</p>
                    <p className="text-xs text-muted-foreground">Sent: {formatDateTime(row.createdAt)}</p>
                    {row.assignee ? (
                      <p className="text-xs text-muted-foreground">
                        Target: {row.assignee.telegramActingChannelTitle || row.assignee.name || row.assignee.email}
                      </p>
                    ) : null}
                  </div>
                  {statusBadge(row.taskStatus || row.status)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {row.campaign?.messageUrl ? (
                    <Button type="button" size="sm" variant="outline" asChild>
                      <a href={row.campaign.messageUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1 h-3.5 w-3.5" />
                        Open Source Post
                      </a>
                    </Button>
                  ) : null}
                  {(row.status === "active" || row.taskStatus === "assigned" || row.taskStatus === "open") ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={cancellingCampaignId === row.campaignId}
                      onClick={() => void handleCancelRequest(row.campaignId)}
                    >
                      {cancellingCampaignId === row.campaignId ? "Cancelling..." : "Cancel Request"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {!loading && sentRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sent repost requests yet.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showNotificationPane ? (
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notification Pane
            </CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={closeNotificationPane}>
              Close
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {notifications.slice(0, 20).map((n) => (
            <div key={n.id} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
                </div>
                {n.request.taskStatus === "completed" || n.request.status === "completed" ? (
                  <CircleCheck className="h-4 w-4 text-emerald-400" />
                ) : n.request.taskStatus === "cancelled" || n.request.status === "cancelled" ? (
                  <XCircle className="h-4 w-4 text-rose-400" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-amber-400" />
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {n.request.campaign?.messageUrl ? (
                  <Button type="button" size="sm" variant="outline" asChild>
                    <a href={n.request.campaign.messageUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      Open
                    </a>
                  </Button>
                ) : null}
                {n.type === "received" ? (
                  <Button type="button" size="sm" asChild>
                    <Link to="/earn">Go to Earn Credits</Link>
                  </Button>
                ) : null}
                {n.type === "sent" &&
                (n.request.status === "active" || n.request.taskStatus === "assigned" || n.request.taskStatus === "open") ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={cancellingCampaignId === n.request.campaignId}
                    onClick={() => void handleCancelRequest(n.request.campaignId)}
                  >
                    {cancellingCampaignId === n.request.campaignId ? "Cancelling..." : "Cancel"}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          ) : null}
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}
