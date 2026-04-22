import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, CheckCircle2, Loader2, Send, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { cn } from "../components/ui/utils";
import { api } from "../services/api";
import { toast } from "sonner";
import {
  ChannelConnectPrerequisites,
  ChannelConnectVisualGuide,
} from "../components/ChannelConnectGuide";

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
  const [rechecking, setRechecking] = useState(false);

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

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshProfile();
        if (profile?.telegramUserId) void refreshPages();
      }
    };
    const onFocus = () => {
      void refreshProfile();
      if (profile?.telegramUserId) void refreshPages();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [profile?.telegramUserId, refreshPages, refreshProfile]);

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === profile?.telegramActingChannelId) ?? null,
    [pages, profile?.telegramActingChannelId]
  );
  const hasConnectedChannel = Boolean(selectedPage || profile?.telegramActingChannelId);
  const hasTelegramLogin = Boolean(profile?.telegramUserId);
  const setupReady = hasTelegramLogin && hasConnectedChannel;
  const completedSteps = Number(hasTelegramLogin) + Number(hasConnectedChannel) + Number(setupReady);
  const botAt = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "ExchangeTunnelApp_bot").trim();
  const botUsername = botAt.startsWith("@") ? botAt.slice(1) : botAt;
  const fixBotAdminUrl = `https://t.me/${botUsername}?startchannel=true`;
  const fixBotFatherUrl = "https://t.me/BotFather";

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

  async function handleRecheckSetup() {
    setRechecking(true);
    try {
      await refreshProfile();
      if (profile?.telegramUserId) await refreshPages();
      toast.success("Setup rechecked");
    } catch {
      toast.error("Could not recheck setup");
    } finally {
      setRechecking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Link Telegram and connect your campaign channel.
        </p>
      </div>

      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-secondary/20">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-foreground">Creator setup checklist</p>
              <p className="text-sm text-muted-foreground">Complete these steps once to launch campaigns smoothly.</p>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "border-primary/40 bg-primary/10 text-primary transition-all duration-300",
                setupReady ? "scale-105 shadow-[0_0_0_1px_rgba(34,197,94,0.35)]" : ""
              )}
            >
              {completedSteps}/3 complete
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div
              className={cn(
                "rounded-lg border p-3 transition-all duration-300",
                hasTelegramLogin ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-card/60"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Step 1</p>
                  <p className="font-medium text-foreground">Login with Telegram</p>
                </div>
                <UserRoundCheck
                  className={cn(
                    "h-4 w-4 transition-all duration-300",
                    hasTelegramLogin ? "scale-110 text-emerald-400" : "text-muted-foreground"
                  )}
                />
              </div>
              {!hasTelegramLogin ? (
                <Button size="sm" variant="outline" className="mt-3 w-full" asChild>
                  <Link to="/login">Open login</Link>
                </Button>
              ) : (
                <p className="mt-3 text-xs text-emerald-300">Done</p>
              )}
            </div>

            <div
              className={cn(
                "rounded-lg border p-3 transition-all duration-300",
                hasConnectedChannel ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-card/60"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Step 2</p>
                  <p className="font-medium text-foreground">Connect channel</p>
                </div>
                <CheckCircle2
                  className={cn(
                    "h-4 w-4 transition-all duration-300",
                    hasConnectedChannel ? "scale-110 text-emerald-400" : "text-muted-foreground"
                  )}
                />
              </div>
              {hasConnectedChannel ? (
                <p className="mt-3 truncate text-xs text-emerald-300">
                  {selectedPage?.name || profile?.telegramActingChannelTitle || "Connected"}
                </p>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">Use the channel connect form below.</p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Step 3</p>
                  <p className="font-medium text-foreground">Telegram permissions</p>
                </div>
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-3 space-y-2">
                <Button size="sm" variant="outline" className="w-full justify-between" asChild>
                  <a href={fixBotAdminUrl} target="_blank" rel="noreferrer">
                    Add bot to channel <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button size="sm" variant="outline" className="w-full justify-between" asChild>
                  <a href={fixBotFatherUrl} target="_blank" rel="noreferrer">
                    Open BotFather <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void handleRecheckSetup()} disabled={rechecking}>
              {rechecking ? "Rechecking..." : "I fixed it, recheck now"}
            </Button>
            <p className="text-xs text-muted-foreground">Returns from Telegram auto-refresh this page too.</p>
          </div>
        </CardContent>
      </Card>

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
            Required only to <strong>run campaigns</strong> for a channel. Use e.g.{" "}
            <code className="text-xs">@mychannel</code> or <code className="text-xs">https://t.me/mychannel</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!hasConnectedChannel ? (
            <>
              <ChannelConnectPrerequisites disabled={!profile?.telegramUserId} />
              <ChannelConnectVisualGuide defaultOpenAccordion />
            </>
          ) : null}
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
