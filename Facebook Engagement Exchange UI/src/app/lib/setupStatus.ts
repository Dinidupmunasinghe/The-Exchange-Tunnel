import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api, getToken } from "../services/api";

/**
 * Single source of truth for "what does this user still need to set up?".
 * Shared by the setup wizard, dashboard checklist, sidebar progress card and blocked actions.
 *
 * Setup gates (mirroring the backend):
 *  - telegram: Telegram account linked                     -> required for everything
 *  - phone:    phone verification (Telegram user sign-in)  -> required to earn credits
 *  - channel:  channel connected with our bot as admin     -> required to launch campaigns / earn by reposting
 */

export type UserGoal = "earn" | "grow" | "both";
export type SetupStepId = "goal" | "telegram" | "phone" | "channel";

export type SetupProfile = {
  id?: number;
  name?: string | null;
  email?: string | null;
  credits?: number;
  telegramUserId?: string | null;
  telegramActingChannelId?: string | null;
  telegramActingChannelTitle?: string | null;
  telegramActingChannelUsername?: string | null;
  /** Live check by the server: "public" (has @username), "private", or "unknown" (couldn't check). */
  channelVisibility?: "public" | "private" | "unknown" | null;
  hasMtprotoSession?: boolean;
  plan?: { id: number; name: string; isFree: boolean } | null;
  profilePhotoUrl?: string | null;
};

const GOAL_KEY = "exchangeTunnel_goal_v2";
const LEGACY_GOAL_KEY = "exchangeTunnel_userGoal";

export function readGoal(): UserGoal | null {
  try {
    const v = localStorage.getItem(GOAL_KEY);
    if (v === "earn" || v === "grow" || v === "both") return v;
    const legacy = localStorage.getItem(LEGACY_GOAL_KEY);
    if (legacy === "earn_only") return "earn";
    if (legacy === "channel_owner") return "both";
  } catch {
    // storage blocked
  }
  return null;
}

export function writeGoal(goal: UserGoal) {
  try {
    localStorage.setItem(GOAL_KEY, goal);
  } catch {
    // storage blocked
  }
  emit();
}

/* ── tiny shared store ────────────────────────────────────────────── */

type State = { profile: SetupProfile | null; loading: boolean; error: string | null; goal: UserGoal | null };
let state: State = { profile: null, loading: false, error: null, goal: typeof window !== "undefined" ? readGoal() : null };
let inflight: Promise<void> | null = null;
let lastLoadedAt = 0;
const listeners = new Set<() => void>();

function emit() {
  state = { ...state, goal: readGoal() };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

let loadedForToken: string | null = null;

export function refreshSetup(force = false): Promise<void> {
  const token = getToken();
  if (!token) return Promise.resolve();
  // A different account signed in on this browser: never show the previous user's state.
  if (loadedForToken && loadedForToken !== token) {
    state = { ...state, profile: null, error: null };
    lastLoadedAt = 0;
    force = true;
  }
  if (inflight) return inflight;
  if (!force && state.profile && Date.now() - lastLoadedAt < 15_000) return Promise.resolve();
  state = { ...state, loading: !state.profile };
  listeners.forEach((l) => l());
  inflight = api
    .getProfile({ skipSessionRedirect: true })
    .then((res) => {
      state = { ...state, profile: (res.user || null) as SetupProfile, error: null, loading: false };
      lastLoadedAt = Date.now();
      loadedForToken = token;
    })
    .catch((e) => {
      state = { ...state, error: e instanceof Error ? e.message : "Could not load your account", loading: false };
    })
    .finally(() => {
      inflight = null;
      emit();
    });
  return inflight;
}

/** Call after logout so the next user never sees stale setup state. */
export function resetSetup() {
  state = { profile: null, loading: false, error: null, goal: readGoal() };
  lastLoadedAt = 0;
  listeners.forEach((l) => l());
}

export type SetupStep = {
  id: SetupStepId;
  title: string;
  description: string;
  done: boolean;
  /** Why the user needs it, in plain words. */
  unlocks: string;
};

export function computeSetup(profile: SetupProfile | null, goal: UserGoal | null) {
  const telegram = Boolean(profile?.telegramUserId);
  const phone = Boolean(profile?.hasMtprotoSession);
  const channel = Boolean(profile?.telegramActingChannelId);
  const g: UserGoal = goal || "both";
  const needsPhone = g === "earn" || g === "both";
  const needsChannel = g === "grow" || g === "both";

  const steps: SetupStep[] = [
    {
      id: "telegram",
      title: "Connect your Telegram account",
      description: "Link the Telegram account you use every day.",
      done: telegram,
      unlocks: "Required for everything on Exchange Tunnel.",
    },
  ];
  if (needsPhone) {
    steps.push({
      id: "phone",
      title: "Verify your phone",
      description: "A one-time Telegram code lets us do the actions you pick for you.",
      done: phone,
      unlocks: "Unlocks earning credits.",
    });
  }
  if (needsChannel) {
    steps.push({
      id: "channel",
      title: "Connect your channel",
      description: "Add our bot as an admin of your channel, then connect it.",
      done: channel,
      unlocks: "Unlocks campaigns for your channel and earning by reposting.",
    });
  }
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done) || null;
  return {
    goal: g,
    hasGoal: Boolean(goal),
    steps,
    doneCount,
    total: steps.length,
    complete: doneCount === steps.length,
    nextStep,
    canEarn: telegram && phone,
    canLaunch: telegram && channel,
    canRepost: telegram && phone && channel,
    telegram,
    phone,
    channel,
  };
}

export type SetupInfo = ReturnType<typeof computeSetup>;

export function useSetupStatus() {
  const snap = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  useEffect(() => {
    void refreshSetup();
  }, []);
  const refresh = useCallback(() => refreshSetup(true), []);
  return {
    ...computeSetup(snap.profile, snap.goal),
    profile: snap.profile,
    loading: snap.loading || (!snap.profile && !snap.error),
    error: snap.error,
    refresh,
    setGoal: writeGoal,
  };
}

/** Deep link into the wizard at a specific step. */
export function setupHref(step?: SetupStepId | null, returnTo?: string) {
  const qs = new URLSearchParams();
  if (step) qs.set("step", step);
  if (returnTo) qs.set("returnTo", returnTo);
  const s = qs.toString();
  return `/get-started${s ? `?${s}` : ""}`;
}
