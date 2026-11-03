import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Coins, Info, CheckCircle, CalendarDays, Clock3, ArrowUpRight, ShieldCheck, UserRoundCheck } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import { Slider } from "../components/ui/slider";
import { Calendar } from "../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { cn } from "../components/ui/utils";
import { api, ApiError } from "../services/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../components/ui/dialog";
import {
  BASE_ENGAGEMENT_CHOICES,
  ENGAGEMENT_OPTIONS,
  type BaseEngagementKind,
  selectionToEngagementType
} from "../lib/engagement";
import { Callout, PageHeader, Section } from "../components/kit";
import { ChannelSetup } from "../components/setup/ChannelSetup";
import { useSetupStatus } from "../lib/setupStatus";

const defaultSelection: Record<BaseEngagementKind, boolean> = {
  like: true,
  comment: true
};

const BOT_AT = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "ExchangeTunnelApp_bot").trim();
const BOT_DISPLAY = BOT_AT.startsWith("@") ? BOT_AT : `@${BOT_AT}`;
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function isTme(str: string) {
  return /^https?:\/\/(www\.)?t\.me\//i.test(String(str).trim());
}

export function SubmitPost() {
  const setup = useSetupStatus();
  const [campaignMode, setCampaignMode] = useState<"subscribe" | "engagement">("subscribe");
  const [campaignName, setCampaignName] = useState("");
  const [selection, setSelection] = useState<Record<BaseEngagementKind, boolean>>(defaultSelection);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [slots, setSlots] = useState(10);
  const [freeRemaining, setFreeRemaining] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecheckingSetup, setIsRecheckingSetup] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [channelTitle, setChannelTitle] = useState<string | null>(null);
  const [connectedChannelId, setConnectedChannelId] = useState<string | null>(null);
  const [hasTelegramLogin, setHasTelegramLogin] = useState<boolean>(false);
  const [setupCheckMessage, setSetupCheckMessage] = useState<string | null>(null);
  const [messageUrl, setMessageUrl] = useState("");
  const [adminRewards, setAdminRewards] = useState<{
    like: number;
    comment: number;
    like_comment: number;
    subscribe: number;
  } | null>(null);

  const refreshSetupState = async () => {
    const res = await api.getProfile();
    const nextBalance = res.user?.credits ?? 0;
    const nextTitle = res.user?.telegramActingChannelTitle ?? res.user?.telegramActingAccountName ?? null;
    const nextChannelId = res.user?.telegramActingChannelId ? String(res.user.telegramActingChannelId) : null;
    const nextHasLogin = Boolean(res.user?.telegramUserId);
    setBalance(nextBalance);
    const usage = res.user?.usage as { isOnFreePlan?: boolean; freeCreditCap?: number | null; lifetimeCreditsSpent?: number } | undefined;
    setFreeRemaining(
      usage?.isOnFreePlan && usage.freeCreditCap != null
        ? Math.max(0, Number(usage.freeCreditCap) - Number(usage.lifetimeCreditsSpent || 0))
        : null
    );
    setChannelTitle(nextTitle);
    setConnectedChannelId(nextChannelId);
    setHasTelegramLogin(nextHasLogin);
    return { hasLogin: nextHasLogin, channelId: nextChannelId };
  };

  useEffect(() => {
    void refreshSetupState().catch(() => setBalance(null));
    void api
      .getCampaignRewards()
      .then((res) => setAdminRewards(res.rewards))
      .catch(() => setAdminRewards(null));
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshSetupState().catch(() => undefined);
      }
    };
    const onFocus = () => void refreshSetupState().catch(() => undefined);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const derivedType = selectionToEngagementType(selection);
  const effectiveType = campaignMode === "subscribe" ? "subscribe" : derivedType;
  const selectedEngagement = derivedType ? ENGAGEMENT_OPTIONS.find((t) => t.id === derivedType) : undefined;
  const subscribeOption = ENGAGEMENT_OPTIONS.find((t) => t.id === "subscribe");
  const fallbackCost =
    campaignMode === "subscribe" ? (subscribeOption?.cost ?? 5) : (selectedEngagement?.cost ?? 1);
  const adminCost = adminRewards
    ? campaignMode === "subscribe"
      ? adminRewards.subscribe
      : derivedType
        ? adminRewards[derivedType as keyof typeof adminRewards]
        : null
    : null;
  const cost = adminCost && adminCost > 0 ? adminCost : fallbackCost;
  /** Credits the user can put into this campaign right now (balance and free-plan allowance). */
  const spendable = Math.max(0, Math.min(balance ?? 0, freeRemaining ?? Number.POSITIVE_INFINITY));
  /** Most slots the user can afford (server accepts up to 1000 per campaign). */
  const maxSlots = Math.max(0, Math.min(1000, Math.floor(spendable / Math.max(1, cost))));
  const canAfford = maxSlots >= 1;
  const estimatedEngagements = effectiveType && canAfford ? Math.min(Math.max(1, slots), maxSlots) : 0;
  const totalCharge = effectiveType ? cost * estimatedEngagements : 0;
  const slotNoun =
    campaignMode === "subscribe"
      ? "subscribers"
      : derivedType === "like"
        ? "likes"
        : derivedType === "comment"
          ? "comments"
          : "engagements";

  // Keep the chosen amount inside what the user can afford when balance / price change.
  useEffect(() => {
    if (maxSlots < 1) return;
    setSlots((prev) => Math.min(Math.max(1, prev), maxSlots));
  }, [maxSlots]);

  const toggleKind = (kind: BaseEngagementKind) => {
    setSelection((prev) => ({ ...prev, [kind]: !prev[kind] }));
  };
  const [scheduleHour = "", scheduleMinute = ""] = scheduleTime.split(":");
  const updateScheduleHour = (h: string) => setScheduleTime(`${h}:${scheduleMinute || "00"}`);
  const updateScheduleMinute = (m: string) => setScheduleTime(`${scheduleHour || "00"}:${m}`);

  const scheduledAt = useMemo(() => {
    if (!scheduleDate) return null;
    if (!scheduleTime) return null;
    const [hRaw, mRaw] = scheduleTime.split(":");
    const h = Number.parseInt(hRaw ?? "0", 10);
    const m = Number.parseInt(mRaw ?? "0", 10);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const d = new Date(scheduleDate);
    d.setHours(h, m, 0, 0);
    return d;
  }, [scheduleDate, scheduleTime]);

  const isScheduled = Boolean(scheduledAt);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = messageUrl.trim();
    if (!channelTitle) {
      toast.error("Connect your channel in Settings first", { description: "Add the bot, then connect @channel." });
      return;
    }
    if (campaignMode === "engagement" && !isTme(u)) {
      toast.error("Use a t.me/… post link from your channel", { description: "e.g. https://t.me/yourchannel/42" });
      return;
    }
    if (campaignMode === "engagement" && !derivedType) {
      toast.error("Choose at least one action");
      return;
    }
    if (estimatedEngagements < 1) {
      toast.error("Not enough credits", { description: `You need at least ${cost} credits for one ${slotNoun.replace(/s$/, "")}.` });
      return;
    }
    if (balance != null && totalCharge > balance) {
      toast.error("Not enough credits");
      return;
    }
    setIsSubmitting(true);
    try {
      let scheduledLaunchAt: string | undefined;
      if (scheduleDate && !scheduleTime) {
        toast.error("Pick a time for the scheduled date");
        setIsSubmitting(false);
        return;
      }
      if (scheduledAt) {
        if (scheduledAt.getTime() <= Date.now()) {
          toast.error("Schedule must be in the future");
          setIsSubmitting(false);
          return;
        }
        scheduledLaunchAt = scheduledAt.toISOString();
      }
      await api.createCampaign({
        name: campaignName.trim() || undefined,
        ...(campaignMode === "subscribe" ? { channelUrl: u || undefined } : { messageUrl: u }),
        engagementType: effectiveType!,
        creditsPerEngagement: cost,
        maxEngagements: estimatedEngagements,
        ...(scheduledLaunchAt ? { scheduledLaunchAt } : {})
      });
      const later = Boolean(scheduledAt);
      toast.success(later ? "Campaign scheduled" : "Campaign started");
      setScheduleDate(undefined);
      setScheduleTime("");
      setCampaignName("");
      setSelection(defaultSelection);
      setCampaignMode("subscribe");
      setSlots(10);
      setMessageUrl("");
      const res = await api.getProfile();
      setBalance(res.user?.credits ?? 0);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === "PLAN_UPGRADE_REQUIRED") {
        setUpgradeOpen(true);
      } else {
        const msg = error instanceof Error ? error.message : "Failed";
        toast.error("Could not create campaign", { description: msg });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const botUsername = BOT_DISPLAY.replace(/^@/, "");
  const fixBotAdminUrl = `https://t.me/${botUsername}?startchannel=true`;
  const fixBotFatherUrl = "https://t.me/BotFather";
  const setupReady = hasTelegramLogin && Boolean(channelTitle);
  const completedSteps = Number(hasTelegramLogin) + Number(Boolean(channelTitle)) + Number(setupReady);

  const handleRecheckSetup = async () => {
    setIsRecheckingSetup(true);
    setSetupCheckMessage(null);
    try {
      const snapshot = await refreshSetupState();
      if (!snapshot.hasLogin) {
        setSetupCheckMessage("Connect Telegram in Settings first.");
        return;
      }
      if (!snapshot.channelId) {
        setSetupCheckMessage("No channel connected yet. Connect it in Settings.");
        return;
      }
      await api.connectTelegramChannel(snapshot.channelId);
      await refreshSetupState();
      setSetupCheckMessage("Setup looks good. You can launch campaigns now.");
      toast.success("Telegram setup verified");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Could not verify";
      setSetupCheckMessage(msg);
      toast.error("Setup check failed", { description: msg });
    } finally {
      setIsRecheckingSetup(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New campaign"
        description="Get real subscribers for your channel, or likes, comments and reposts on a post. You pay with credits only for what you get."
      />
      {!setup.loading && !setup.channel ? (
        <Section
          title="First, connect your channel"
          description="Campaigns promote your own Telegram channel. Connect it once — it takes a minute."
        >
          <ChannelSetup
            connected={false}
            onConnected={() => {
              void refreshSetupState().catch(() => undefined);
            }}
          />
        </Section>
      ) : null}
      {!setup.loading && setup.channel && campaignMode === "subscribe" && !setup.profile?.telegramActingChannelUsername ? (
        <Callout tone="warning" title="Subscriber campaigns need a public channel">
          Your channel has no public @username. Add one in Telegram (Channel info → Edit → Channel type → Public), then
          reconnect it in Settings — or choose a post engagement campaign instead.
        </Callout>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Campaign</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label>Campaign goal</Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setCampaignMode("subscribe")}
                      className={cn(
                        "rounded-lg border p-3 text-left",
                        campaignMode === "subscribe" ? "border-primary bg-primary/10" : "border-border bg-secondary/20"
                      )}
                    >
                      <p className="font-medium text-foreground">Get subscribers</p>
                      <p className="text-xs text-muted-foreground">Workers subscribe to your connected channel.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCampaignMode("engagement")}
                      className={cn(
                        "rounded-lg border p-3 text-left",
                        campaignMode === "engagement" ? "border-primary bg-primary/10" : "border-border bg-secondary/20"
                      )}
                    >
                      <p className="font-medium text-foreground">Boost a post</p>
                      <p className="text-xs text-muted-foreground">Workers like and/or comment on one t.me post.</p>
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaignName">Campaign name</Label>
                  <Input
                    id="campaignName"
                    type="text"
                    placeholder="e.g. Launch week"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    maxLength={160}
                    className="bg-secondary border-0"
                  />
                </div>
                <div className="space-y-2">
                  {campaignMode === "subscribe" ? (
                    <>
                      <Label>Connected channel</Label>
                      <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-sm">
                        <span className="font-medium text-foreground">
                          {channelTitle || "No channel connected"}
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Subscribe campaigns automatically use your connected channel from Settings.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Label htmlFor="tme">t.me post link</Label>
                      <Input
                        id="tme"
                        type="url"
                        placeholder="https://t.me/yourchannel/12"
                        value={messageUrl}
                        onChange={(e) => setMessageUrl(e.target.value)}
                        className="bg-secondary border-0 font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        {channelTitle
                          ? `Using connected channel. Post must be from: ${channelTitle}.`
                          : "Connect a channel in Settings first."}
                      </p>
                    </>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Schedule (optional)</Label>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[240px] space-y-1">
                      <Label className="text-xs text-muted-foreground">Date</Label>
                      <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal bg-secondary border-0",
                              !scheduleDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarDays className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                            {scheduleDate ? format(scheduleDate, "MMM d, yyyy") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={scheduleDate}
                            onSelect={(d) => {
                              setScheduleDate(d);
                              if (d) setScheduleOpen(false);
                            }}
                            disabled={(day) => {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              return day < today;
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="min-w-[240px] space-y-1">
                      <Label className="text-xs text-muted-foreground">Time</Label>
                      <div className="flex h-9 items-center gap-2 rounded-md bg-secondary px-3">
                        <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <Select value={scheduleHour || undefined} onValueChange={updateScheduleHour}>
                          <SelectTrigger className="h-8 w-[76px] border-0 bg-transparent px-2 shadow-none focus-visible:ring-0">
                            <SelectValue placeholder="HH" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {HOURS.map((h) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={scheduleMinute || undefined} onValueChange={updateScheduleMinute}>
                          <SelectTrigger className="h-8 w-[76px] border-0 bg-transparent px-2 shadow-none focus-visible:ring-0">
                            <SelectValue placeholder="MM" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {MINUTES.map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {scheduleDate ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setScheduleDate(undefined);
                          setScheduleTime("");
                        }}
                      >
                        Clear
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {scheduledAt ? `Will launch at ${format(scheduledAt, "MMM d, yyyy · h:mm a")}` : "Leave empty to launch immediately."}
                  </p>
                </div>
                {campaignMode === "engagement" ? (
                  <div className="space-y-3">
                    <Label>Action</Label>
                    <p className="text-xs text-muted-foreground -mt-1">
                      Pick the actions workers should complete on your Telegram post.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {BASE_ENGAGEMENT_CHOICES.map((opt) => {
                        const id = `eng-${opt.id}`;
                        const on = selection[opt.id];
                        return (
                          <div
                            key={opt.id}
                            className={cn(
                              "flex items-start gap-3 rounded-lg border-2 p-4",
                              on ? "border-primary bg-primary/10" : "border-border bg-secondary/30"
                            )}
                          >
                            <Checkbox id={id} checked={on} onCheckedChange={() => toggleKind(opt.id)} />
                            <div className="min-w-0">
                              <Label htmlFor={id} className="font-medium text-foreground flex items-center gap-2 cursor-pointer">
                                <span className="text-xl">{opt.icon}</span> {opt.name}
                              </Label>
                              <p className="text-xs text-muted-foreground mt-1">{opt.costHint}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                    Subscribe campaign selected. Workers will subscribe to your connected channel and tap{" "}
                    <strong className="text-foreground">Subscribe</strong> in the earn feed.
                  </div>
                )}
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="text-xs text-muted-foreground">
                      <p>
                        <span className="font-medium text-foreground">Credits per engagement:</span>{" "}
                        <span className="font-semibold text-primary">{cost}</span> cr (set by platform admin
                        {adminRewards ? "" : ", admin value loading…"})
                      </p>
                      <p className="mt-1">
                        Campaign creators can&apos;t change this rate. Adjust your budget to control how many
                        slots you fund.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <Label htmlFor="slots">How many {slotNoun}?</Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {cost} credits each · you can afford up to {maxSlots.toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="slots"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={Math.max(1, maxSlots)}
                        value={canAfford ? estimatedEngagements : 0}
                        disabled={!canAfford}
                        onChange={(e) => {
                          const n = Math.floor(Number(e.target.value));
                          if (Number.isFinite(n)) setSlots(Math.min(Math.max(1, n), Math.max(1, maxSlots)));
                        }}
                        className="h-9 w-24 text-right tabular-nums"
                        aria-label={`Number of ${slotNoun}`}
                      />
                    </div>
                  </div>
                  <Slider
                    value={[canAfford ? estimatedEngagements : 0]}
                    onValueChange={(v) => setSlots(Math.max(1, Math.round(v[0])))}
                    min={canAfford ? 1 : 0}
                    max={Math.max(1, maxSlots)}
                    step={1}
                    disabled={!canAfford}
                    className="w-full py-1"
                    aria-label={`Number of ${slotNoun}`}
                  />
                  <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Total cost</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {totalCharge.toLocaleString()} credits
                      {balance != null ? (
                        <span className="ml-1 font-normal text-muted-foreground">
                          · {Math.max(0, balance - totalCharge).toLocaleString()} left after
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {balance != null && !canAfford ? (
                    <Callout
                      tone="warning"
                      title="Not enough credits for this campaign"
                      action={
                        <Button asChild size="sm" variant="outline">
                          <Link to={freeRemaining != null && freeRemaining < cost && (balance ?? 0) >= cost ? "/wallet" : "/earn"}>
                            {freeRemaining != null && freeRemaining < cost && (balance ?? 0) >= cost ? "Upgrade plan" : "Earn credits"}
                          </Link>
                        </Button>
                      }
                    >
                      {freeRemaining != null && freeRemaining < cost && (balance ?? 0) >= cost
                        ? `You’ve used your free-plan campaign allowance. Upgrade to launch more campaigns.`
                        : `One ${slotNoun.replace(/s$/, "")} costs ${cost} credits and you have ${balance}. Earn a few more credits first.`}
                    </Callout>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={
                    (campaignMode === "engagement" && !isTme(messageUrl)) ||
                    !channelTitle ||
                    isSubmitting ||
                    !effectiveType ||
                    !canAfford ||
                    (balance != null && totalCharge > balance)
                  }
                >
                  {isSubmitting ? (
                    isScheduled ? (
                      "Scheduling…"
                    ) : (
                      "Starting…"
                    )
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-5 w-5" />
                      {isScheduled ? "Schedule" : "Start campaign"}
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Estimate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium text-right">
                  {campaignMode === "subscribe" ? "Subscribers" : selectedEngagement?.name ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price each</span>
                <span className="font-medium">{cost} cr</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total cost</span>
                <span className="font-medium">{totalCharge} cr</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">You get</span>
                <span className="text-2xl font-bold text-primary">{effectiveType ? estimatedEngagements : "—"}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Info className="h-4 w-4 shrink-0 text-primary" /> How it works
              </p>
              <ol className="list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
                <li>The credits for all slots are reserved when you launch.</li>
                <li>Members see your campaign in their Earn feed and complete it.</li>
                <li>Our bot checks every subscribe and action on Telegram before paying.</li>
                <li>Pause or delete any time — unused credits come back to you.</li>
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Coins className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="text-xl font-bold">{balance != null ? `${balance} cr` : "—"}</p>
                {balance != null && balance < 200 ? (
                  <Link to="/earn" className="text-xs text-primary underline">
                    Earn credits
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade your plan</DialogTitle>
            <DialogDescription>
              You have reached your free plan credit limit. Subscribe to a paid plan to launch more campaigns.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setUpgradeOpen(false)}>
              Not now
            </Button>
            <Button type="button" asChild>
              <Link to="/wallet">View plans</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
