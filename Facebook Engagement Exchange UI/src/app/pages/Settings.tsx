import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckCircle2, Cloud, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { api } from "../services/api";
import { toast } from "sonner";
import { buildSoundCloudAuthorizeUrl } from "../lib/soundcloudPkce";

const FB_GRAPH_VERSION = "v22.0";
const PAGE_CONNECT_SCOPES = [
  "public_profile",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_engagement",
].join(",");
const SETTINGS_ROUTE_PATH = "/settings";

type Profile = {
  soundcloudUserId?: string;
  soundcloudActingAccountId?: string | null;
  soundcloudActingAccountName?: string | null;
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

function buildFacebookPagesOAuthUrl(appId: string): string {
  const redirectUri = `${window.location.origin}${SETTINGS_ROUTE_PATH}`;
  const state = crypto.randomUUID();
  sessionStorage.setItem("settings_oauth_provider", "facebook");
  sessionStorage.setItem("fb_pages_oauth_state", state);

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: PAGE_CONNECT_SCOPES,
  });

  return `https://www.facebook.com/${FB_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

const SC_SETTINGS_STATE_KEY = "sc_oauth_state_settings";
const SC_SETTINGS_VERIFIER_KEY = "sc_pkce_verifier_settings";

export function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const soundcloudClientId = (import.meta.env.VITE_SOUNDCLOUD_CLIENT_ID || "").trim();
  const metaPagesAppId = import.meta.env.VITE_META_PAGES_APP_ID || import.meta.env.VITE_META_APP_ID || "";
  const canConnectAccounts = Boolean(soundcloudClientId || metaPagesAppId);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pages, setPages] = useState<ManagedPage[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPages, setLoadingPages] = useState(false);
  const [connectingPages, setConnectingPages] = useState(false);
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
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setLoadingPages(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (profile?.soundcloudUserId) {
      void refreshPages();
    }
  }, [profile?.soundcloudUserId, refreshPages]);

  useEffect(() => {
    const error = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");
    if (error || searchParams.get("error_code")) {
      toast.error(errorDesc?.replace(/\+/g, " ") || error || "SoundCloud account connection failed");
      setSearchParams({}, { replace: true });
      return;
    }

    const code = searchParams.get("code");
    const returnedState = searchParams.get("state");
    if (!code) return;

    const useSoundCloudPkce =
      sessionStorage.getItem("settings_oauth_provider") === "soundcloud" ||
      Boolean(sessionStorage.getItem(SC_SETTINGS_VERIFIER_KEY));

    if (useSoundCloudPkce) {
      const savedState = sessionStorage.getItem(SC_SETTINGS_STATE_KEY);
      if (savedState && returnedState && savedState !== returnedState) {
        toast.error("SoundCloud account connection expired. Please try again.");
        sessionStorage.removeItem(SC_SETTINGS_STATE_KEY);
        sessionStorage.removeItem(SC_SETTINGS_VERIFIER_KEY);
        sessionStorage.removeItem("settings_oauth_provider");
        setSearchParams({}, { replace: true });
        return;
      }
      const codeVerifier = sessionStorage.getItem(SC_SETTINGS_VERIFIER_KEY);
      sessionStorage.removeItem(SC_SETTINGS_STATE_KEY);
      sessionStorage.removeItem(SC_SETTINGS_VERIFIER_KEY);
      sessionStorage.removeItem("settings_oauth_provider");
      setConnectingPages(true);
      const redirectUri = `${window.location.origin}${SETTINGS_ROUTE_PATH}`;
      void api
        .connectSoundCloud({
          code,
          redirectUri,
          ...(codeVerifier ? { codeVerifier } : {}),
        })
        .then(async () => {
          toast.success("SoundCloud account connected");
          await Promise.all([refreshProfile(), refreshPages()]);
        })
        .catch((e: unknown) => {
          toast.error(e instanceof Error ? e.message : "Could not connect SoundCloud accounts");
        })
        .finally(() => {
          setConnectingPages(false);
          setSearchParams({}, { replace: true });
        });
      return;
    }

    const savedState = sessionStorage.getItem("fb_pages_oauth_state");
    if (savedState && returnedState && savedState !== returnedState) {
      toast.error("SoundCloud account connection expired. Please try again.");
      sessionStorage.removeItem("fb_pages_oauth_state");
      sessionStorage.removeItem("settings_oauth_provider");
      setSearchParams({}, { replace: true });
      return;
    }

    sessionStorage.removeItem("fb_pages_oauth_state");
    sessionStorage.removeItem("settings_oauth_provider");
    setConnectingPages(true);
    const redirectUri = `${window.location.origin}${SETTINGS_ROUTE_PATH}`;
    void api
      .connectSoundCloud({ code, redirectUri })
      .then(async () => {
        toast.success("SoundCloud account connected");
        await Promise.all([refreshProfile(), refreshPages()]);
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "Could not connect SoundCloud accounts");
      })
      .finally(() => {
        setConnectingPages(false);
        setSearchParams({}, { replace: true });
      });
  }, [refreshPages, refreshProfile, searchParams, setSearchParams]);

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === profile?.soundcloudActingAccountId) ?? null,
    [pages, profile?.soundcloudActingAccountId]
  );
  const hasPlaceholderEmail = Boolean(
    profile?.email &&
      (profile.email.endsWith("@users.facebook.exchange") || profile.email.endsWith("@users.soundcloud.exchange"))
  );
  const displayEmail = loadingProfile
    ? "Loading..."
    : hasPlaceholderEmail
      ? "Not shared by provider"
      : profile?.email || "Not available";
  const displayName = loadingProfile ? "Loading..." : profile?.name || "Not available";
  const connectionStatus = loadingProfile
    ? "Checking..."
    : profile?.soundcloudUserId
      ? "Connected"
      : "Not connected";

  async function handleConnectPages() {
    if (!canConnectAccounts) {
      toast.error(
        "Add VITE_SOUNDCLOUD_CLIENT_ID (recommended) or VITE_META_PAGES_APP_ID to the frontend .env, then restart Vite."
      );
      return;
    }
    try {
      setConnectingPages(true);
      if (soundcloudClientId) {
        const url = await buildSoundCloudAuthorizeUrl({
          clientId: soundcloudClientId,
          redirectPath: SETTINGS_ROUTE_PATH,
          authorizeBaseUrl: import.meta.env.VITE_SOUNDCLOUD_AUTHORIZE_URL,
          session: {
            providerKey: "settings_oauth_provider",
            stateKey: SC_SETTINGS_STATE_KEY,
            verifierKey: SC_SETTINGS_VERIFIER_KEY,
          },
        });
        window.location.assign(url);
        return;
      }
      window.location.assign(buildFacebookPagesOAuthUrl(metaPagesAppId));
    } catch (e: unknown) {
      setConnectingPages(false);
      toast.error(e instanceof Error ? e.message : "Could not start SoundCloud account connection");
    }
  }

  async function handleSelectPage(pageId: string) {
    setSelectingPageId(pageId);
    try {
      const res = await api.selectManagedPage(pageId);
      toast.success(res.page.name ? `Selected ${res.page.name}` : "SoundCloud account selected");
      await Promise.all([refreshProfile(), refreshPages()]);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not save selected Page");
    } finally {
      setSelectingPageId(null);
    }
  }

  async function handleClearSelectedPage() {
    setClearingSelection(true);
    try {
      const res = await api.clearSelectedManagedPage();
      toast.success(res.message || "Selected page removed");
      await Promise.all([refreshProfile(), refreshPages()]);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not remove selected Page");
    } finally {
      setClearingSelection(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Connect SoundCloud, pick a managed account, and use it for actions.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Account</CardTitle>
          <CardDescription>Current signed-in SoundCloud user and selected automation account.</CardDescription>
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
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">SoundCloud</p>
              <div className="mt-1">
                <Badge variant={profile?.soundcloudUserId ? "default" : "outline"}>{connectionStatus}</Badge>
              </div>
            </div>
          </div>
          <Separator />
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-medium text-foreground">Selected Page</p>
                <p className="text-sm text-muted-foreground">
                  {selectedPage?.name || profile?.soundcloudActingAccountName || "No account selected yet."}
                </p>
              </div>
              {selectedPage ? (
                <div className="flex items-center gap-2">
                  <Badge>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Active for actions
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleClearSelectedPage()}
                    disabled={clearingSelection}
                  >
                    {clearingSelection ? "Removing..." : "Remove"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">SoundCloud Accounts</CardTitle>
          <CardDescription>
            Link SoundCloud and choose which account should perform likes, comments, and shares.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="gap-2"
              onClick={() => void handleConnectPages()}
              disabled={connectingPages || !canConnectAccounts}
            >
              {connectingPages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
              {selectedPage ? "Reconnect SoundCloud Accounts" : "Connect SoundCloud Accounts"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refreshPages()}
              disabled={loadingPages || !profile?.soundcloudUserId}
            >
              {loadingPages ? "Refreshing..." : "Refresh Pages"}
            </Button>
            {!profile?.soundcloudUserId ? (
              <Button variant="outline" asChild>
                <Link to="/login">Log in with SoundCloud first</Link>
              </Button>
            ) : null}
          </div>

            {!canConnectAccounts ? (
              <p className="text-sm text-muted-foreground">Account connection is not configured (missing client IDs in .env).</p>
            ) : null}

          {loadingPages ? <p className="text-sm text-muted-foreground">Loading managed Pages...</p> : null}
          {!loadingPages && pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No managed accounts found yet. Connect SoundCloud above and make sure the signed-in account has access.
            </p>
          ) : null}

          <div className="space-y-3">
            {pages.map((page) => {
              const selecting = selectingPageId === page.id;
              return (
                <div
                  key={page.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{page.name}</p>
                      {page.selected ? <Badge>Selected</Badge> : null}
                      {page.category ? <Badge variant="outline">{page.category}</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Page ID {page.id}
                      {page.tasks.length > 0 ? ` · Tasks: ${page.tasks.join(", ")}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={page.selected ? "default" : "outline"}
                    disabled={selecting || page.selected}
                    onClick={() => void handleSelectPage(page.id)}
                  >
                    {selecting ? "Saving..." : page.selected ? "Selected" : "Use this Page"}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">How actions work</CardTitle>
          <CardDescription>Important before you use Earn Credits with Page automation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Likes, comments, and shares are attempted as the selected SoundCloud account, not as your personal account.</p>
          <p>
            Undo uses the same selected Page. If you change the selected Page later, old actions may no longer be
            reversible from the platform.
          </p>
          <p>If the platform rejects an action, the button will show the API error returned by the backend.</p>
        </CardContent>
      </Card>
    </div>
  );
}
