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

export function RepostRequests() {
  const [messageUrl, setMessageUrl] = useState("");
  const [channels, setChannels] = useState<RepostChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestingUserId, setRequestingUserId] = useState<number | null>(null);
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

  useEffect(() => {
    void loadChannels();
  }, []);

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

      {!loading && channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No connected channels are available yet.</p>
      ) : null}
    </div>
  );
}
