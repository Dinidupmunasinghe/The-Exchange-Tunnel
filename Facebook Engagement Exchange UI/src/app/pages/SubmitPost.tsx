import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Coins, Info, CheckCircle, CalendarDays, RefreshCw, ExternalLink } from "lucide-react";
import { format, isBefore, setHours, setMinutes, startOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Slider } from "../components/ui/slider";
import { Calendar } from "../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Skeleton } from "../components/ui/skeleton";
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

type PagePost = {
  id: string;
  message: string;
  createdTime: string | null;
  permalinkUrl: string;
  previewImageUrl: string | null;
  statusType: string | null;
};

export function SubmitPost() {
  const [campaignName, setCampaignName] = useState("");
  const [selection, setSelection] = useState<Record<BaseEngagementKind, boolean>>(defaultSelection);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [creditBudget, setCreditBudget] = useState([100]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [selectedPageName, setSelectedPageName] = useState<string | null>(null);
  const [pagePosts, setPagePosts] = useState<PagePost[]>([]);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getProfile()
      .then((res) => {
        setBalance(res.user?.credits ?? 0);
        setSelectedPageName(res.user?.soundcloudActingAccountName ?? null);
      })
      .catch(() => setBalance(null));
  }, []);

  const loadPagePosts = async () => {
    if (!selectedPageName) {
      setPagePosts([]);
      setSelectedPostId("");
      setPostsError(null);
      return;
    }
    setIsLoadingPosts(true);
    setPostsError(null);
    try {
      const res = await api.getSelectedPagePosts();
      setPagePosts(res.posts || []);
      setSelectedPostId((current) => {
        if (current && (res.posts || []).some((post) => post.id === current)) {
          return current;
        }
        return res.posts?.[0]?.id || "";
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not load Page posts";
      setPostsError(msg);
      setPagePosts([]);
      setSelectedPostId("");
    } finally {
      setIsLoadingPosts(false);
    }
  };

  useEffect(() => {
    loadPagePosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPageName]);

  const derivedType = selectionToEngagementType(selection);
  const selectedEngagement = derivedType ? ENGAGEMENT_OPTIONS.find((t) => t.id === derivedType) : undefined;
  const cost = selectedEngagement?.cost || 1;
  const estimatedEngagements = derivedType ? Math.floor(creditBudget[0] / cost) : 0;
  /** Upfront charge: credits per slot × number of slots (not the raw slider value). */
  const totalCharge = derivedType ? cost * estimatedEngagements : 0;

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

  const scheduledAt = useMemo(() => {
    if (!scheduleDate) return null;
    const parts = scheduleTime.split(":");
    const h = parseInt(parts[0] ?? "0", 10);
    const m = parseInt(parts[1] ?? "0", 10);
    if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return setMinutes(setHours(startOfDay(scheduleDate), h), m);
  }, [scheduleDate, scheduleTime]);

  const isScheduled = Boolean(scheduledAt);
  const selectedPost = pagePosts.find((post) => post.id === selectedPostId) || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost) {
      toast.error("Choose a SoundCloud post", {
        description: "Select one of your connected posts before starting the campaign."
      });
      return;
    }
    if (!derivedType) {
      toast.error("Choose at least one engagement type", {
        description: "Select like, comment, and/or share."
      });
      return;
    }
    if (estimatedEngagements < 1) {
      toast.error("Increase your budget", {
        description: `This combination needs at least ${cost} credits for one slot.`
      });
      return;
    }
    if (balance != null && totalCharge > balance) {
      toast.error("Not enough credits", {
        description: `You need ${totalCharge} credits reserved (${cost} × ${estimatedEngagements} slots) but have ${balance}. Earn more on Earn Credits or reduce the budget.`
      });
      return;
    }
    setIsSubmitting(true);

    try {
      let scheduledLaunchAt: string | undefined;
      if (scheduledAt) {
        if (scheduledAt.getTime() <= Date.now()) {
          toast.error("Schedule must be in the future", {
            description: "Pick a later date or time."
          });
          setIsSubmitting(false);
          return;
        }
        scheduledLaunchAt = scheduledAt.toISOString();
      }

      await api.createCampaign({
        name: campaignName.trim() || undefined,
        soundcloudPostId: selectedPost.id,
        soundcloudPostUrl: selectedPost.permalinkUrl,
        engagementType: derivedType,
        creditsPerEngagement: cost,
        maxEngagements: estimatedEngagements,
        ...(scheduledLaunchAt ? { scheduledLaunchAt } : {})
      });

      const later = Boolean(scheduledAt);
      toast.success(later ? "Campaign scheduled" : "Campaign started!", {
        description: later
          ? `Launch at ${scheduledAt!.toLocaleString()} — ${estimatedEngagements} ${selectedEngagement?.name.toLowerCase()}.`
          : `Your post is live for ${estimatedEngagements} ${selectedEngagement?.name.toLowerCase()}.`
      });
      setScheduleDate(undefined);
      setScheduleTime("09:00");
      setCampaignName("");
      setSelection(defaultSelection);
      setCreditBudget([100]);
      api.getProfile().then((res) => setBalance(res.user?.credits ?? 0));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to create campaign";
      toast.error(msg.includes("Insufficient") ? "Insufficient credits" : "Could not create campaign", {
        description: msg
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Submit Post</h1>
        <p className="text-muted-foreground mt-1">Boost your SoundCloud post with credits</p>
      </div>
      {!selectedPageName ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Tip: select your SoundCloud account in{" "}
          <Link to="/settings" className="font-medium underline underline-offset-2">
            Settings
          </Link>{" "}
          so your account is fully ready for page-based actions.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Campaign Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="campaignName">Campaign name</Label>
                  <Input
                    id="campaignName"
                    type="text"
                    placeholder="e.g. Spring launch promo"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    maxLength={160}
                    className="bg-secondary border-0"
                  />
                  <p className="text-xs text-muted-foreground">Optional — shown in My Campaigns.</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label>Choose a SoundCloud post</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedPageName
                          ? `Showing recent posts from ${selectedPageName}.`
                          : "Select a SoundCloud account in Settings first."}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={loadPagePosts}
                      disabled={!selectedPageName || isLoadingPosts}
                    >
                      <RefreshCw className={cn("mr-2 h-4 w-4", isLoadingPosts && "animate-spin")} />
                      Refresh
                    </Button>
                  </div>

                  {!selectedPageName ? (
                    <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
                      Connect and select your SoundCloud account in{" "}
                      <Link to="/settings" className="font-medium text-primary underline-offset-2 hover:underline">
                        Settings
                      </Link>{" "}
                      to load posts here.
                    </div>
                  ) : isLoadingPosts ? (
                    <div className="space-y-3">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="rounded-lg border border-border p-4 space-y-3">
                          <Skeleton className="h-4 w-1/3" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-5/6" />
                          <Skeleton className="h-32 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : postsError ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                      <p>{postsError}</p>
                      <p className="mt-2 text-xs text-amber-100/80">
                        Try refreshing, or reconnect/select the account again in Settings if permissions changed.
                      </p>
                    </div>
                  ) : pagePosts.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
                      No recent posts found for this account. Create a post on SoundCloud, then click Refresh.
                    </div>
                  ) : (
                    <div className="max-h-[480px] space-y-3 overflow-y-auto pr-1">
                      {pagePosts.map((post) => {
                        const active = post.id === selectedPostId;
                        const caption = post.message?.trim() || "Photo/video post without caption";
                        return (
                          <button
                            key={post.id}
                            type="button"
                            onClick={() => setSelectedPostId(post.id)}
                            className={cn(
                              "w-full rounded-lg border p-4 text-left transition-colors",
                              active ? "border-primary bg-primary/10" : "border-border bg-secondary/20 hover:bg-secondary/40"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-3 text-sm font-medium text-foreground">{caption}</p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {post.createdTime ? new Date(post.createdTime).toLocaleString() : "Recent post"}
                                  {post.statusType ? ` • ${post.statusType.replace(/_/g, " ")}` : ""}
                                </p>
                              </div>
                              {active ? (
                                <span className="rounded-full bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground">
                                  Selected
                                </span>
                              ) : null}
                            </div>
                            {post.previewImageUrl ? (
                              <div className="mt-3 overflow-hidden rounded-md border border-border/60 bg-black/5 p-2">
                                <img
                                  src={post.previewImageUrl}
                                  alt="SoundCloud post preview"
                                  className="max-h-[520px] w-full rounded object-contain"
                                />
                              </div>
                            ) : null}
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <span className="truncate text-xs text-muted-foreground">{post.permalinkUrl}</span>
                              <span className="inline-flex items-center text-xs font-medium text-primary">
                                Open
                                <ExternalLink className="ml-1 h-3.5 w-3.5" />
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Schedule launch (optional)</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "min-w-[240px] justify-start text-left font-normal bg-secondary border-0",
                            !scheduleDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarDays className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                          {scheduledAt
                            ? format(scheduledAt, "MMM d, yyyy · h:mm a")
                            : "Pick date & time"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={scheduleDate}
                          onSelect={(d) => setScheduleDate(d)}
                          disabled={(day) => isBefore(startOfDay(day), startOfDay(new Date()))}
                          initialFocus
                        />
                        <div className="border-t border-border p-3 space-y-2">
                          <Label htmlFor="schedule-time" className="text-xs text-muted-foreground">
                            Time
                          </Label>
                          <Input
                            id="schedule-time"
                            type="time"
                            value={scheduleTime}
                            onChange={(e) => setScheduleTime(e.target.value)}
                            className="bg-secondary border-0"
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                    {scheduleDate ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
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
                    Open the calendar to choose a day, set the time below it, then click away to close. Leave unset to
                    start immediately; scheduled campaigns stay pending until launch.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label>Engagement types</Label>
                  <p className="text-xs text-muted-foreground -mt-1">Select one or more. Pricing follows the combination (e.g. all three = one bundled task).</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {BASE_ENGAGEMENT_CHOICES.map((opt) => {
                      const id = `eng-${opt.id}`;
                      const on = selection[opt.id];
                      return (
                        <div
                          key={opt.id}
                          className={
                            "flex items-start gap-3 rounded-lg border-2 p-4 transition-colors " +
                            (on ? "border-primary bg-primary/10" : "border-border bg-secondary/30")
                          }
                        >
                          <Checkbox
                            id={id}
                            checked={on}
                            onCheckedChange={() => toggleKind(opt.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <Label htmlFor={id} className="flex cursor-pointer items-center gap-2 font-medium text-foreground">
                              <span className="text-xl">{opt.icon}</span>
                              {opt.name}
                            </Label>
                            <p className="text-xs text-muted-foreground mt-1">{opt.costHint}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Budget target</Label>
                    <span className="text-sm font-bold text-primary">{creditBudget[0]} credits</span>
                  </div>
                  <Slider
                    value={creditBudget}
                    onValueChange={(v) => {
                      const raw = v[0];
                      const clamped = Math.min(maxSpend, Math.max(minSpend, raw));
                      setCreditBudget([clamped]);
                    }}
                    max={maxSpend}
                    min={minSpend}
                    step={maxSpend < 50 ? 1 : 10}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{minSpend} credits</span>
                    <span>{maxSpend} credits</span>
                    {balance != null ? (
                      <span className="text-amber-600/90 dark:text-amber-400/90">Your balance caps this</span>
                    ) : null}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={
                    !selectedPostId ||
                    isSubmitting ||
                    !derivedType ||
                    (balance != null && totalCharge > balance)
                  }
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin mr-2">⏳</span>
                      {isScheduled ? "Scheduling…" : "Starting campaign…"}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-5 w-5" />
                      {isScheduled ? "Schedule campaign" : "Start campaign"}
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
              <CardTitle className="text-foreground">Campaign estimate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Selected post</span>
                  <span className="font-medium text-foreground text-right">
                    {selectedPost ? "Ready" : "Choose a post"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Combination</span>
                  <span className="font-medium text-foreground text-right">
                    {selectedEngagement?.name ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cost per completion</span>
                  <span className="font-medium text-foreground">{derivedType ? cost : "—"} credits</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Reserved upfront</span>
                  <span className="font-medium text-foreground">{derivedType ? totalCharge : "—"} credits</span>
                </div>
                {derivedType && balance != null && totalCharge > balance ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Need {totalCharge - balance} more credits, or lower the budget.
                  </p>
                ) : null}
              </div>

              <div className="border-t border-border pt-4">
                <div className="rounded-lg bg-primary/10 p-4">
                  <p className="text-xs text-muted-foreground">Estimated slots</p>
                  <p className="text-3xl font-bold text-primary mt-1">{derivedType ? estimatedEngagements : "—"}</p>
                  <p className="text-sm text-muted-foreground">{selectedEngagement?.name ?? "Pick at least one type"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-blue-500 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Multi-select</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Each slot is one proof submission for the whole combination you chose</li>
                    <li>• Earn Credits enables every action that matches your selection</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Coins className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Available balance</p>
                  <p className="text-xl font-bold text-foreground">
                    {balance != null ? `${balance.toLocaleString()} credits` : "—"}
                  </p>
                  {balance != null && balance < 500 ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      Low balance?{" "}
                      <Link to="/earn" className="text-primary font-medium underline-offset-2 hover:underline">
                        Earn credits
                      </Link>{" "}
                      first — campaigns lock the full slot total up front.
                    </p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
