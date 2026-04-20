import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Coins, Info, CheckCircle, CalendarDays, Clock3 } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Slider } from "../components/ui/slider";
import { Calendar } from "../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { cn } from "../components/ui/utils";
import { api } from "../services/api";
import {
  BASE_ENGAGEMENT_CHOICES,
  ENGAGEMENT_OPTIONS,
  type BaseEngagementKind,
  selectionToEngagementType
} from "../lib/engagement";

const defaultSelection: Record<BaseEngagementKind, boolean> = {
  like: true,
  comment: false,
  share: false
};

const BOT_AT = (import.meta.env.VITE_TELEGRAM_BOT_NAME || "ExchangeTunnelApp_bot").trim();
const BOT_DISPLAY = BOT_AT.startsWith("@") ? BOT_AT : `@${BOT_AT}`;
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function isTme(str: string) {
  return /^https?:\/\/(www\.)?t\.me\//i.test(String(str).trim());
}

export function SubmitPost() {
  const [campaignMode, setCampaignMode] = useState<"subscribe" | "engagement">("subscribe");
  const [campaignName, setCampaignName] = useState("");
  const [selection, setSelection] = useState<Record<BaseEngagementKind, boolean>>(defaultSelection);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [creditBudget, setCreditBudget] = useState([100]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [channelTitle, setChannelTitle] = useState<string | null>(null);
  const [messageUrl, setMessageUrl] = useState("");

  useEffect(() => {
    api
      .getProfile()
      .then((res) => {
        setBalance(res.user?.credits ?? 0);
        setChannelTitle(res.user?.telegramActingChannelTitle ?? res.user?.telegramActingAccountName ?? null);
      })
      .catch(() => setBalance(null));
  }, []);

  const derivedType = selectionToEngagementType(selection);
  const effectiveType = campaignMode === "subscribe" ? "subscribe" : derivedType;
  const selectedEngagement = derivedType ? ENGAGEMENT_OPTIONS.find((t) => t.id === derivedType) : undefined;
  const subscribeOption = ENGAGEMENT_OPTIONS.find((t) => t.id === "subscribe");
  const cost = campaignMode === "subscribe" ? (subscribeOption?.cost ?? 5) : (selectedEngagement?.cost ?? 1);
  const estimatedEngagements = effectiveType ? Math.floor(creditBudget[0] / cost) : 0;
  const totalCharge = effectiveType ? cost * estimatedEngagements : 0;

  const maxSpend = balance != null ? Math.min(500, balance) : 500;
  const minSpend = maxSpend < 50 ? maxSpend : 50;

  useEffect(() => {
    if (balance == null) return;
    setCreditBudget((prev) => {
      const v = prev[0];
      const next = Math.min(maxSpend, Math.max(minSpend, v));
      return [next];
    });
  }, [balance, maxSpend, minSpend]);

  const toggleKind = (kind: BaseEngagementKind) => {
    setSelection((prev) => ({ ...prev, [kind]: !prev[kind] }));
  };
  const [scheduleHour, scheduleMinute] = scheduleTime.split(":");
  const updateScheduleHour = (h: string) => setScheduleTime(`${h}:${scheduleMinute ?? "00"}`);
  const updateScheduleMinute = (m: string) => setScheduleTime(`${scheduleHour ?? "00"}:${m}`);

  const scheduledAt = useMemo(() => {
    if (!scheduleDate) return null;
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
      toast.error("Increase your budget", { description: `Need at least ${cost} credits for one slot.` });
      return;
    }
    if (balance != null && totalCharge > balance) {
      toast.error("Not enough credits");
      return;
    }
    setIsSubmitting(true);
    try {
      let scheduledLaunchAt: string | undefined;
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
      setScheduleTime("09:00");
      setCampaignName("");
      setSelection(defaultSelection);
      setCampaignMode("subscribe");
      setCreditBudget([100]);
      setMessageUrl("");
      const res = await api.getProfile();
      setBalance(res.user?.credits ?? 0);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed";
      toast.error("Could not create campaign", { description: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Launch Campaigns</h1>
        <p className="text-muted-foreground mt-1">
          Run either a subscriber campaign for your connected channel or a post engagement campaign.
        </p>
      </div>
      {!channelTitle ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-medium text-amber-50">Campaigns need a linked channel</p>
          <p className="mt-1 text-amber-100/90">
            In{" "}
            <Link to="/settings" className="font-medium underline underline-offset-2">
              Settings
            </Link>
            , add <strong>{BOT_DISPLAY}</strong> as an admin on your channel first, then connect{" "}
            <code className="rounded bg-black/20 px-1 font-mono text-xs">@yourchannel</code>. See the step-by-step guide
            there. Only browsing/earning? Pick &quot;Earn &amp; browse&quot; on Settings — no bot admin needed.
          </p>
        </div>
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
                      <p className="text-xs text-muted-foreground">Workers join your connected channel.</p>
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
                      <p className="text-xs text-muted-foreground">Workers like/comment/share one t.me post.</p>
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
                          Subscriber campaigns automatically use your connected channel from Settings.
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
                    <div className="min-w-[180px] space-y-1">
                      <Label className="text-xs text-muted-foreground">Time</Label>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md bg-secondary px-2 py-1.5">
                        <Select value={scheduleHour || "09"} onValueChange={updateScheduleHour}>
                          <SelectTrigger className="h-8 border-0 bg-transparent px-2">
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
                        <Clock3 className="h-4 w-4 text-muted-foreground" />
                        <Select value={scheduleMinute || "00"} onValueChange={updateScheduleMinute}>
                          <SelectTrigger className="h-8 border-0 bg-transparent px-2">
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
                          setScheduleTime("09:00");
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
                    <Label>Action bundle</Label>
                    <p className="text-xs text-muted-foreground -mt-1">
                      Same credit model: workers complete the bundle you pick.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
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
                    Subscriber campaign selected. Workers will join your connected channel and tap{" "}
                    <strong className="text-foreground">Subscribe</strong> in the earn feed.
                  </div>
                )}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Budget (credits)</Label>
                    <span className="text-sm font-bold text-primary">{creditBudget[0]}</span>
                  </div>
                  <Slider
                    value={creditBudget}
                    onValueChange={(v) => {
                      const c = Math.min(maxSpend, Math.max(minSpend, v[0]));
                      setCreditBudget([c]);
                    }}
                    max={maxSpend}
                    min={minSpend}
                    step={10}
                    className="w-full"
                  />
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
                <span className="text-muted-foreground">Per slot</span>
                <span className="font-medium">{cost} cr</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reserved</span>
                <span className="font-medium">{totalCharge} cr</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Slots</span>
                <span className="text-2xl font-bold text-primary">{effectiveType ? estimatedEngagements : "—"}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex gap-2">
              <Info className="h-5 w-5 text-blue-500 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Earners must join the channel; the app checks membership with your bot. For post campaigns, they also perform
                the selected actions.
              </p>
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
    </div>
  );
}
