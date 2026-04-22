const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const TOKEN_KEY = "exchange_token";

type Json = Record<string, unknown>;

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (b64.length % 4)) % 4;
    const json = atob(b64 + "=".repeat(pad));
    return JSON.parse(json) as { exp?: number };
  } catch {
    return null;
  }
}

export function isAccessTokenValid(token: string | null): boolean {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  if (typeof payload.exp !== "number") return true;
  return payload.exp * 1000 > Date.now() + 10_000;
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function mapNetworkError(e: unknown): Error {
  if (e instanceof TypeError && (e.message === "Failed to fetch" || e.message.includes("fetch"))) {
    return new Error(
      "Cannot reach API. Start the backend (port 5000) and use VITE_API_BASE_URL=/api so Vite can proxy to it."
    );
  }
  return e instanceof Error ? e : new Error(String(e));
}

function extractApiErrorMessage(response: Response, payload: Json, rawText: string): string {
  const msg = typeof payload.message === "string" ? payload.message : "";
  const errors = payload.errors as Array<{ message?: string }> | undefined;
  const details =
    Array.isArray(errors) && errors.length > 0
      ? errors.map((item) => item.message).filter(Boolean).join(". ")
      : null;
  if (msg && details) return `${msg} — ${details}`;
  if (msg) return msg;
  if (details) return details;

  if (response.status === 502 || response.status === 503) {
    return "API unavailable (502/503). Start the backend: open a terminal, run: cd backend && npm run dev — it must listen on port 5000. Then keep Vite running with VITE_API_BASE_URL=/api.";
  }

  const trimmed = rawText.trim();
  if (trimmed && trimmed.length < 500 && !trimmed.startsWith("<!")) {
    try {
      const j = JSON.parse(trimmed) as Json;
      if (typeof j.message === "string" && j.message) return j.message;
    } catch {
      return `HTTP ${response.status}: ${trimmed.slice(0, 280)}`;
    }
  }

  return `HTTP ${response.status} ${response.statusText || ""}`.trim();
}

async function readJsonBody(response: Response): Promise<{ payload: Json; rawText: string }> {
  const rawText = await response.text();
  if (!rawText) return { payload: {}, rawText: "" };
  try {
    return { payload: JSON.parse(rawText) as Json, rawText };
  } catch {
    return { payload: {}, rawText };
  }
}

async function requestJson<T>(
  path: string,
  options: RequestInit,
  withBearer: boolean
): Promise<T> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(withBearer && token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (e) {
    throw mapNetworkError(e);
  }

  const { payload, rawText } = await readJsonBody(response);

  if (!response.ok) {
    throw new Error(extractApiErrorMessage(response, payload, rawText));
  }

  return payload as T;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  return requestJson<T>(path, options, true);
}

async function requestWithoutAuth<T>(path: string, options: RequestInit = {}): Promise<T> {
  return requestJson<T>(path, options, false);
}

async function authRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!getToken()) {
    throw new Error("Not authenticated");
  }
  return request<T>(path, options);
}

/** @see https://core.telegram.org/widgets/login */
export async function loginWithTelegram(auth: Record<string, string | number | undefined>) {
  const data = await requestWithoutAuth<{ token: string; user: unknown }>("/auth/telegram", {
    method: "POST",
    body: JSON.stringify(auth),
  });
  setToken(data.token);
  return data;
}

/** Email + password login */
export async function loginWithEmail(email: string, password: string) {
  const data = await requestWithoutAuth<{ token: string; user: unknown }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

/** Email + password register */
export async function registerWithEmail(email: string, password: string, name?: string) {
  const data = await requestWithoutAuth<{ token: string; user: unknown }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
  setToken(data.token);
  return data;
}

/** Deep-link login step 1: get a one-time token + t.me URL */
export async function startTelegramDeeplinkLogin() {
  return requestWithoutAuth<{ token: string; expiresInMs: number }>("/auth/telegram-deeplink/start", {
    method: "POST",
  });
}

type DeeplinkPollResult =
  | { status: "pending" }
  | { status: "expired"; message?: string }
  | { status: "ok"; token: string; user: unknown };

/** Deep-link login step 2: poll until status = ok | expired */
export async function pollTelegramDeeplinkLogin(token: string): Promise<DeeplinkPollResult> {
  return requestWithoutAuth<DeeplinkPollResult>(
    `/auth/telegram-deeplink/poll?token=${encodeURIComponent(token)}`
  );
}

export const api = {
  getProfile: () => authRequest("/users/me") as Promise<{ user: any }>,
  getDashboard: () => authRequest("/users/dashboard") as Promise<{ stats: any }>,
  connectTelegramChannel: (channel: string) =>
    authRequest("/telegram/connect", {
      method: "POST",
      body: JSON.stringify({ channel }),
    }) as Promise<{ message: string; pages: any[] }>,
  getManagedPages: () =>
    authRequest("/telegram/pages") as Promise<{
      pages: {
        id: string;
        name: string;
        category: string | null;
        tasks: string[];
        pictureUrl: string | null;
        selected: boolean;
      }[];
      selectedPageId: string | null;
    }>,
  selectManagedPage: (pageId: string) =>
    authRequest("/telegram/pages/select", {
      method: "POST",
      body: JSON.stringify({ pageId }),
    }) as Promise<{
      message: string;
      page: {
        id: string;
        name: string;
        category: string | null;
        tasks: string[];
        pictureUrl: string | null;
      };
    }>,
  clearSelectedManagedPage: () =>
    authRequest("/telegram/pages/select", {
      method: "DELETE",
    }) as Promise<{ message: string }>,
  getSelectedPagePosts: () =>
    authRequest("/telegram/posts") as Promise<{
      page: { id: string; name: string | null };
      posts: { id: string; message: string; permalinkUrl: string }[];
    }>,
  getCampaigns: () => authRequest("/campaigns") as Promise<{ campaigns: any[] }>,
  updateCampaign: (id: number, payload: { action: "pause" | "resume" }) =>
    authRequest(`/campaigns/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCampaign: (id: number) =>
    authRequest(`/campaigns/${id}`, {
      method: "DELETE",
    }),
  createCampaign: (payload: {
    name?: string;
    messageKey?: string;
    messageUrl?: string;
    channelUrl?: string;
    engagementType: "subscribe" | "like" | "comment" | "like_comment";
    creditsPerEngagement: number;
    maxEngagements: number;
    scheduledLaunchAt?: string | null;
  }) =>
    authRequest("/campaigns", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getTasks: () =>
    authRequest("/tasks") as Promise<{
      tasks: any[];
      myEngagements: { id: number; campaignId: number; taskId: number; actionKind: string }[];
    }>,
  completeTask: (payload: {
    taskId: number;
    engagementType: string;
    actionKind: "subscribe" | "like" | "comment";
    reaction?: string;
    commentVerifyToken?: string;
    proofText?: string;
  }) =>
    authRequest("/tasks/complete", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  revertEngagement: (payload: { campaignId: number; actionKind: "comment" | "like" }) =>
    authRequest("/tasks/revert", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startCommentDetect: (payload: { taskId: number }) =>
    authRequest("/tasks/comment-detect/start", {
      method: "POST",
      body: JSON.stringify(payload),
    }) as Promise<{ token: string; expiresInMs: number }>,
  pollCommentDetect: (token: string) =>
    authRequest(`/tasks/comment-detect/poll?token=${encodeURIComponent(token)}`) as Promise<{
      status: "pending" | "detected" | "expired";
    }>,
  getTransactions: () => authRequest("/transactions") as Promise<{ transactions: any[] }>,
  getTelegramMessagePreview: (url: string) =>
    authRequest(`/telegram/post-preview?${new URLSearchParams({ url }).toString()}`) as Promise<{
      imageUrl: string | null;
      title: string | null;
      description: string | null;
      isVideo?: boolean;
    }>,
  mtprotoSendCode: (payload: { apiId?: string | number; apiHash?: string; phone: string }) =>
    authRequest("/telegram/user-auth/send-code", {
      method: "POST",
      body: JSON.stringify(payload),
    }) as Promise<{ ok: boolean; phoneCodeHash: string }>,
  mtprotoSignIn: (payload: {
    apiId?: string | number;
    apiHash?: string;
    phone: string;
    phoneCode: string;
    phoneCodeHash?: string;
  }) =>
    authRequest("/telegram/user-auth/sign-in", {
      method: "POST",
      body: JSON.stringify(payload),
    }) as Promise<{ ok: boolean; requires2fa?: boolean; sessionSaved?: boolean }>,
  mtprotoSignIn2fa: (payload: { password: string }) =>
    authRequest("/telegram/user-auth/sign-in-2fa", {
      method: "POST",
      body: JSON.stringify(payload),
    }) as Promise<{ ok: boolean; sessionSaved?: boolean }>,
};
