import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  Bell,
  CheckCircle2,
  KeyRound,
  Link2,
  Loader2,
  Send,
  Unlink,
  Shield,
  ShieldCheck,
  User,
  UserRoundCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { cn } from "../components/ui/utils";
import { api } from "../services/api";
import { toast } from "sonner";
import {
  ChannelConnectPrerequisites,
  ChannelConnectVisualGuide,
} from "../components/ChannelConnectGuide";
import { TelegramLinkPanel } from "../components/TelegramLinkPanel";

type Profile = {
  telegramUserId?: string;
  telegramActingChannelId?: string | null;
  telegramActingChannelTitle?: string | null;
  hasMtprotoSession?: boolean;
  email?: string;
  name?: string;
  profilePhotoUrl?: string | null;
};

type ManagedPage = {
  id: string;
  name: string;
  category: string | null;
  tasks: string[];
  pictureUrl: string | null;
  selected: boolean;
};

const COUNTRY_CODES = [
  { code: "+94", label: "Sri Lanka (+94)" },
  { code: "+91", label: "India (+91)" },
  { code: "+1", label: "United States (+1)" },
  { code: "+44", label: "United Kingdom (+44)" },
  { code: "+971", label: "UAE (+971)" },
  { code: "+61", label: "Australia (+61)" },
];

type SettingsNavId = "general" | "channel" | "session" | "notifications" | "security";

const SETTINGS_NAV: { id: SettingsNavId; label: string; Icon: LucideIcon }[] = [
  { id: "general", label: "General", Icon: User },
  { id: "channel", label: "Channel", Icon: Link2 },
  { id: "session", label: "User session", Icon: KeyRound },
  { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "security", label: "Security", Icon: Shield },
];

export function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pages, setPages] = useState<ManagedPage[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPages, setLoadingPages] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [channelInput, setChannelInput] = useState("");
  const [selectingPageId, setSelectingPageId] = useState<string | null>(null);
  const [clearingSelection, setClearingSelection] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [mtprotoCountryCode, setMtprotoCountryCode] = useState("+94");
  const [mtprotoPhone, setMtprotoPhone] = useState("");
  const [mtprotoCode, setMtprotoCode] = useState("");
  const [mtprotoCodeHash, setMtprotoCodeHash] = useState("");
  const [mtprotoPassword, setMtprotoPassword] = useState("");
  const [mtprotoNeeds2fa, setMtprotoNeeds2fa] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [submitting2fa, setSubmitting2fa] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [settingsNav, setSettingsNav] = useState<SettingsNavId>("general");
  const [unlinkingTelegram, setUnlinkingTelegram] = useState(false);
  const [savingProfilePhoto, setSavingProfilePhoto] = useState(false);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

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

  const handleProfilePhotoFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (JPEG, PNG, or WebP).");
      return;
    }
    if (file.size > 500 * 1024) {
      toast.error("Image must be 500 KB or smaller.");
      return;
    }
    setSavingProfilePhoto(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read image"));
        reader.readAsDataURL(file);
      });
      await api.updateProfilePhoto(dataUrl);
      toast.success("Profile photo updated");
      await refreshProfile();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not update profile photo");
    } finally {
      setSavingProfilePhoto(false);
      if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = "";
    }
  };

  const handleRemoveProfilePhoto = async () => {
    setSavingProfilePhoto(true);
    try {
      await api.updateProfilePhoto(null);
      toast.success("Profile photo removed");
      await refreshProfile();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not remove profile photo");
    } finally {
      setSavingProfilePhoto(false);
    }
  };

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
    if (searchParams.get("connectTelegram") !== "1") return;
    setSearchParams({}, { replace: true });
    if (!profile?.telegramUserId) {
      window.location.replace("/connect-telegram");
    }
  }, [searchParams, setSearchParams, profile?.telegramUserId]);

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

  useEffect(() => {
    if (window.location.hash === "#user-session") {
      setSettingsNav("session");
    }
  }, []);

  useEffect(() => {
    if (window.location.hash !== "#user-session" || settingsNav !== "session") return;
    const t = window.setTimeout(() => {
      document.getElementById("user-session")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [settingsNav]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendCooldown]);

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
      toast.error("Connect Telegram in Settings first (Profile tab).");
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

  async function handleUnlinkTelegram() {
    setUnlinkingTelegram(true);
    try {
      const res = await api.unlinkTelegram();
      setProfile(res.user as Profile);
      setPages([]);
      toast.success("Telegram unlinked. Connect again when you are ready.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not unlink Telegram");
    } finally {
      setUnlinkingTelegram(false);
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

  async function handleSendMtprotoCode() {
    const raw = mtprotoPhone.trim();
    if (!raw) {
      toast.error("Enter your Telegram phone number");
      return;
    }
    const normalizedPhone = raw.startsWith("+")
      ? raw
      : `${mtprotoCountryCode}${raw.replace(/^0+/, "")}`;
    setSendingCode(true);
    try {
      const res = await api.mtprotoSendCode({
        phone: normalizedPhone,
      });
      setMtprotoCodeHash(res.phoneCodeHash || "");
      setMtprotoNeeds2fa(false);
      setResendCooldown(30);
      toast.success("Code sent to your Telegram app.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not send code");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleMtprotoSignIn() {
    const raw = mtprotoPhone.trim();
    if (!raw || !mtprotoCode.trim()) {
      toast.error("Enter phone number and code");
      return;
    }
    const normalizedPhone = raw.startsWith("+")
      ? raw
      : `${mtprotoCountryCode}${raw.replace(/^0+/, "")}`;
    const normalizedCode = mtprotoCode.replace(/[^\d]/g, "");
    setSigningIn(true);
    try {
      const res = await api.mtprotoSignIn({
        phone: normalizedPhone,
        phoneCode: normalizedCode,
        phoneCodeHash: mtprotoCodeHash || undefined,
      });
      if (res.requires2fa) {
        setMtprotoNeeds2fa(true);
        toast.info("2FA password required. Enter it below.");
      } else {
        setMtprotoNeeds2fa(false);
        toast.success("Telegram user session connected.");
        await refreshProfile();
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleMtproto2fa() {
    if (!mtprotoPassword.trim()) {
      toast.error("Enter your Telegram 2FA password");
      return;
    }
    setSubmitting2fa(true);
    try {
      await api.mtprotoSignIn2fa({ password: mtprotoPassword.trim() });
      setMtprotoNeeds2fa(false);
      setMtprotoPassword("");
      toast.success("Telegram user session connected.");
      await refreshProfile();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not verify 2FA password");
    } finally {
      setSubmitting2fa(false);
    }
  }

  const profileInitials = useMemo(() => {
    const raw = profile?.name?.trim();
    if (!raw) return "?";
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
    }
    return raw.slice(0, 2).toUpperCase();
  }, [profile?.name]);

  const panelCopy: Record<SettingsNavId, { title: string; description: string }> = {
    general: {
      title: "General",
      description: "Profile, setup checklist, and engagement session.",
    },
    channel: {
      title: "Channel",
      description: "Connect and select the Telegram channel used for campaigns.",
    },
    session: {
      title: "User session",
      description: "MTProto session so engagement actions can run as your Telegram user.",
    },
    notifications: {
      title: "Notifications",
      description: "How we reach you about campaigns and tasks.",
    },
    security: {
      title: "Security",
      description: "Protect your account and review sign-in activity.",
    },
  };
  const { title: panelTitle, description: panelDesc } = panelCopy[settingsNav];

  return (
    <div className="flex min-h-0 flex-col">
      <header className="mb-6 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account settings and preferences.</p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
        <aside className="shrink-0 lg:sticky lg:top-6 lg:w-56 lg:self-start">
          <nav
            className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
            aria-label="Settings sections"
          >
            {SETTINGS_NAV.map(({ id, label, Icon }) => {
              const active = settingsNav === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSettingsNav(id)}
                  className={cn(
                    "flex w-full shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  {label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-lg text-foreground">{panelTitle}</CardTitle>
            <CardDescription>{panelDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {settingsNav === "general" ? (
              <>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Profile information</h3>
                    <p className="mt-1 text-sm text-muted-foreground">What we store for your account.</p>
                  </div>
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                    <div className="flex flex-col items-center gap-3 sm:items-start">
                      <Label className="text-sm font-medium text-foreground">Profile photo</Label>
                      <Avatar className="h-20 w-20 shrink-0 border border-border">
                        <AvatarImage
                          src={profile?.profilePhotoUrl || undefined}
                          alt={displayName}
                          className="object-cover"
                        />
                        <AvatarFallback className="bg-muted text-lg font-medium text-foreground">
                          {profileInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                        <input
                          ref={profilePhotoInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          onChange={(e) => void handleProfilePhotoFile(e.target.files?.[0] ?? null)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={savingProfilePhoto || loadingProfile}
                          onClick={() => profilePhotoInputRef.current?.click()}
                        >
                          {savingProfilePhoto ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          {profile?.profilePhotoUrl ? "Change photo" : "Upload photo"}
                        </Button>
                        {profile?.profilePhotoUrl ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            disabled={savingProfilePhoto}
                            onClick={() => void handleRemoveProfilePhoto()}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                      <p className="max-w-[12rem] text-center text-xs text-muted-foreground sm:text-left">
                        Shown on your campaigns in the earn feed. Max 500 KB.
                      </p>
                    </div>
                    <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="settings-display-name">Name</Label>
                        <Input id="settings-display-name" readOnly value={displayName} className="bg-background" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="settings-email">Email address</Label>
                        <Input id="settings-email" readOnly value={displayEmail} className="bg-background" />
                      </div>
                    </div>
                  </div>
                  {!hasTelegramLogin ? (
                    <TelegramLinkPanel onLinked={() => void refreshProfile()} />
                  ) : null}
                  <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Telegram</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    profile?.telegramUserId
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border-border text-muted-foreground"
                  }
                >
                  {connectionStatus}
                </Badge>
                {hasTelegramLogin ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={unlinkingTelegram}
                      >
                        {unlinkingTelegram ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Unlink className="h-3.5 w-3.5" />
                        )}
                        Unlink Telegram
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Unlink Telegram?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Your Exchange Tunnel account stays signed in. Earn tasks and channel campaigns will stop
                          until you connect Telegram again. Your linked channel and user session will also be cleared.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => void handleUnlinkTelegram()}
                        >
                          Unlink Telegram
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/40 p-3 sm:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Channel status</p>
              <p className="mt-2 text-sm text-foreground">
                {hasConnectedChannel
                  ? selectedPage?.name || profile?.telegramActingChannelTitle || "Connected"
                  : "No channel linked yet. Use the Channel tab to connect."}
              </p>
            </div>
          </div>
          <Separator />
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="font-medium text-foreground">Active channel</p>
                <p className="text-sm text-muted-foreground">
                  {selectedPage?.name || profile?.telegramActingChannelTitle || "Not connected yet."}
                </p>
              </div>
              {selectedPage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Used for your campaigns
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void handleClearSelected()}
                    disabled={clearingSelection}
                  >
                    {clearingSelection ? "…" : "Remove"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-foreground">Creator setup checklist</p>
              <p className="text-sm text-muted-foreground">Complete these steps once to launch campaigns smoothly.</p>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "border-border bg-muted text-foreground transition-all duration-300",
                setupReady ? "scale-105 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 shadow-[0_0_0_1px_rgba(34,197,94,0.25)] dark:text-emerald-400" : ""
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
                  <p className="font-medium text-foreground">Connect Telegram</p>
                </div>
                <UserRoundCheck
                  className={cn(
                    "h-4 w-4 transition-all duration-300",
                    hasTelegramLogin ? "scale-110 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  )}
                />
              </div>
              {!hasTelegramLogin ? (
                <Button size="sm" variant="outline" className="mt-3 w-full" asChild>
                  <Link to="/settings">Connect in Profile</Link>
                </Button>
              ) : (
                <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">Done</p>
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
                    hasConnectedChannel ? "scale-110 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  )}
                />
              </div>
              {hasConnectedChannel ? (
                <p className="mt-3 truncate text-xs text-emerald-700 dark:text-emerald-300">
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
                </div>


                <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Telegram User Session required for engagement</p>
            <p className="text-xs text-muted-foreground">
              Complete this once for likes, comments, reposts, and other earn actions. Then engagement works normally.
            </p>
          </div>
          <Button
            size="sm"
            type="button"
            onClick={() => {
              setSettingsNav("session");
              window.location.hash = "user-session";
            }}
          >
            Open User Session setup
          </Button>
        </div>


              </>
            ) : null}

            {settingsNav === "channel" ? (
              <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Required only to <strong className="text-foreground">run campaigns</strong> for a channel. Use e.g.{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">@mychannel</code> or{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">https://t.me/mychannel</code>.
          </p>
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
                <Link to="/settings">Connect Telegram in Profile</Link>
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
                    variant="outline"
                    className={
                      page.selected
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : ""
                    }
                    disabled={selecting || page.selected}
                    onClick={() => void handleSelectPage(page.id)}
                  >
                    {selecting ? "…" : page.selected ? "Active" : "Select"}
                  </Button>
                </div>
              );
            })}
          </div>
              </div>
            ) : null}

            {settingsNav === "session" ? (
              <div id="user-session" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Required for earn engagements (likes, comments, reposts, and related actions) as your Telegram user. Separate from normal Telegram login.
          </p>
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
            <div className="mt-2">
              <Badge
                variant="outline"
                className={
                  profile?.hasMtprotoSession
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-border text-muted-foreground"
                }
              >
                {profile?.hasMtprotoSession ? "Connected" : "Not connected"}
              </Badge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="mtproto-country">Country</Label>
              <Select value={mtprotoCountryCode} onValueChange={setMtprotoCountryCode}>
                <SelectTrigger id="mtproto-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_CODES.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mtproto-phone">Telegram phone</Label>
              <Input
                id="mtproto-phone"
                value={mtprotoPhone}
                onChange={(e) => setMtprotoPhone(e.target.value)}
                placeholder="771234567 or +94771234567"
              />
            </div>
            <Button type="button" variant="outline" className="self-end" onClick={() => void handleSendMtprotoCode()} disabled={sendingCode}>
              {sendingCode ? "Sending..." : "Send code"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="mtproto-code" className="shrink-0">
              Code
            </Label>
            <Input
              id="mtproto-code"
              value={mtprotoCode}
              onChange={(e) => setMtprotoCode(e.target.value)}
              placeholder="Telegram login code"
              className="h-9 min-w-0 flex-1 basis-48"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
              disabled={sendingCode || resendCooldown > 0}
              onClick={() => void handleSendMtprotoCode()}
            >
              {sendingCode
                ? "Sending..."
                : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend code"}
            </Button>
            <Button
              type="button"
              className="h-9 shrink-0"
              onClick={() => void handleMtprotoSignIn()}
              disabled={signingIn}
            >
              {signingIn ? "Verifying..." : "Connect session"}
            </Button>
          </div>

          {mtprotoNeeds2fa ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="mtproto-password">Telegram 2FA password</Label>
                <Input
                  id="mtproto-password"
                  type="password"
                  value={mtprotoPassword}
                  onChange={(e) => setMtprotoPassword(e.target.value)}
                  placeholder="Your Telegram cloud password"
                />
              </div>
              <Button type="button" className="self-end" onClick={() => void handleMtproto2fa()} disabled={submitting2fa}>
                {submitting2fa ? "Checking..." : "Submit 2FA"}
              </Button>
            </div>
          ) : null}
              </div>
            ) : null}

            {settingsNav === "notifications" ? (
              <p className="text-sm text-muted-foreground">
                Notification preferences are not configurable yet. Campaign and task alerts use your connected Telegram
                account.
              </p>
            ) : null}

            {settingsNav === "security" ? (
              <p className="text-sm text-muted-foreground">
                Security settings such as password change and active sessions are not exposed in this app yet. Use
                Telegram to secure your linked account.
              </p>
            ) : null}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
