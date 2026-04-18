import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, Send, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { api } from "../services/api";
import { toast } from "sonner";

type Profile = {
  telegramUserId?: string;
  telegramActingChannelId?: string | null;
  telegramActingChannelTitle?: string | null;
  email?: string;
  name?: string;
};

type ManagedPage = {
  id: string;
  name: string;
  category: string | null;
  tasks: string[];
  pictureUrl: string | null;
  selected: boolean;
};

export function Settings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pages, setPages] = useState<ManagedPage[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPages, setLoadingPages] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [channelInput, setChannelInput] = useState("");
  const [selectingPageId, setSelectingPageId] = useState<string | null>(null);
  const [clearingSelection, setClearingSelection] = useState(false);

  const refreshProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const res = await api.getProfile();
      setProfile(res.user as Profile);
    } catch {
      setProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const refreshPages = useCallback(async () => {
    setLoadingPages(true);
    try {
      const res = await api.getManagedPages();
      setPages(res.pages as ManagedPage[]);
    } catch (error: unknown) {
      setPages([]);
      if (error instanceof Error) toast.error(error.message);
    } finally {
      setLoadingPages(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (profile?.telegramUserId) void refreshPages();
  }, [profile?.telegramUserId, refreshPages]);

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === profile?.telegramActingChannelId) ?? null,
    [pages, profile?.telegramActingChannelId]
  );

  const hasPlaceholderEmail = Boolean(
    profile?.email &&
      (profile.email.endsWith("@users.telegram.exchange") || profile.email.endsWith("@users.facebook.exchange"))
  );
  const displayEmail = loadingProfile
    ? "Loading..."
    : hasPlaceholderEmail
      ? "Not shared (Telegram login placeholder)"
      : profile?.email || "Not available";
  const displayName = loadingProfile ? "Loading..." : profile?.name || "Not available";
  const connectionStatus = loadingProfile
    ? "Checking..."
    : profile?.telegramUserId
      ? "Connected"
      : "Not connected";

  async function handleConnectChannel() {
    const c = channelInput.trim();
    if (!c) {
      toast.error("Enter @channel, your channel t.me/…, or a numeric id");
      return;
    }
    if (!profile?.telegramUserId) {
      toast.error("Log in with Telegram first (Login page).");
      return;
    }
    setConnecting(true);
    try {
      await api.connectTelegramChannel(c);
      toast.success("Channel connected. Add the bot to your channel as admin if you have not already.");
      setChannelInput("");
      await Promise.all([refreshProfile(), refreshPages()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  async function handleSelectPage(pageId: string) {
    setSelectingPageId(pageId);
    try {
      const res = await api.selectManagedPage(pageId);
      toast.success(res.page.name ? `Selected ${res.page.name}` : "Channel selected");
      await Promise.all([refreshProfile(), refreshPages()]);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSelectingPageId(null);
    }
  }

  async function handleClearSelected() {
    setClearingSelection(true);
    try {
      await api.clearSelectedManagedPage();
      toast.success("Channel selection cleared");
      await Promise.all([refreshProfile(), refreshPages()]);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not remove");
    } finally {
      setClearingSelection(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Link Telegram, connect the channel you promote, and use it for campaigns and tasks.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Account</CardTitle>
          <CardDescription>Current Telegram user and selected channel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-secondary/20 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
              <p className="mt-1 text-sm text-foreground">{displayName}</p>
            </div>
            <div className="rounded-md border border-border bg-secondary/20 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
              <p className="mt-1 text-sm text-foreground">{displayEmail}</p>
            </div>
            <div className="rounded-md border border-border bg-secondary/20 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Telegram</p>
              <div className="mt-1">
                <Badge variant={profile?.telegramUserId ? "default" : "outline"}>{connectionStatus}</Badge>
              </div>
            </div>
          </div>
          <Separator />
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-medium text-foreground">Active channel</p>
                <p className="text-sm text-muted-foreground">
                  {selectedPage?.name || profile?.telegramActingChannelTitle || "Not connected yet."}
                </p>
              </div>
              {selectedPage ? (
                <div className="flex items-center gap-2">
                  <Badge>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Used for your campaigns
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleClearSelected()}
                    disabled={clearingSelection}
                  >
                    {clearingSelection ? "…" : "Remove"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Telegram channel</CardTitle>
          <CardDescription>
            Add your bot to the channel as an administrator, then connect it here. Use e.g. <code className="text-xs">@mychannel</code> or{" "}
            <code className="text-xs">https://t.me/mychannel</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="ch">Channel</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="ch"
                placeholder="@channel or t.me/…"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                disabled={connecting || !profile?.telegramUserId}
              />
              <Button
                type="button"
                className="gap-2 shrink-0"
                onClick={() => void handleConnectChannel()}
                disabled={connecting || !profile?.telegramUserId}
              >
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {selectedPage ? "Update channel" : "Connect channel"}
              </Button>
            </div>
            {!profile?.telegramUserId ? (
              <Button variant="outline" asChild>
                <Link to="/login">Log in with Telegram</Link>
              </Button>
            ) : null}
          </div>

          {loadingPages ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          <div className="space-y-3">
            {pages.map((page) => {
              const selecting = selectingPageId === page.id;
              return (
                <div
                  key={page.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-foreground">{page.name}</p>
                    <p className="text-sm text-muted-foreground">ID {page.id}</p>
                  </div>
                  <Button
                    type="button"
                    variant={page.selected ? "default" : "outline"}
                    disabled={selecting || page.selected}
                    onClick={() => void handleSelectPage(page.id)}
                  >
                    {selecting ? "…" : page.selected ? "Active" : "Select"}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
