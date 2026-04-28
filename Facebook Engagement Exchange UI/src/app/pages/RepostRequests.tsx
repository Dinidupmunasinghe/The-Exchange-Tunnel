import { useEffect, useMemo, useState } from "react";
import { Users, Repeat2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
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
  const [messageUrl, setMessageUrl] = useState("");
  const [channels, setChannels] = useState<RepostChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestingUserId, setRequestingUserId] = useState<number | null>(null);
  const [tab, setTab] = useState<"received" | "sent">("sent");
  const [requests, setRequests] = useState<RepostRequest[]>([]);
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

  async function loadRequests(which: "received" | "sent") {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listRepostRequests(which);
      setRequests((res.requests || []) as RepostRequest[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repost requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadChannels();
  }, []);

  useEffect(() => {
    void loadRequests(tab);
  }, [tab]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send repost request");
    } finally {
      setRequestingUserId(null);
    }
  }

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
          variant={tab === "sent" ? "default" : "ghost"}
          onClick={() => setTab("sent")}
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
      </div>

      {tab === "sent" ? (
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

      {tab === "sent" ? (
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

      {tab === "sent" && !loading && channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No connected channels are available yet.</p>
      ) : null}

      {tab === "received" ? (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Received repost requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.map((row) => (
              <div key={row.id} className="rounded-md border border-border p-3">
                <p className="text-sm font-semibold text-foreground">{row.campaign?.name || `Request #${row.id}`}</p>
                <p className="text-xs text-muted-foreground">
                  Reward: {row.rewardCredits} credits • Status: {row.taskStatus || row.status}
                </p>
                {row.campaign?.messageUrl ? (
                  <a
                    className="mt-1 inline-block text-xs text-primary hover:underline"
                    href={row.campaign.messageUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open source post
                  </a>
                ) : null}
              </div>
            ))}
            {!loading && requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No received repost requests yet.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
