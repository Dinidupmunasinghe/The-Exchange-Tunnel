import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Camera, Link2, Loader2, Megaphone, Moon, Smartphone, Sun, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { PageHeader, SegmentedControl, Section, StatusBadge } from "../components/kit";
import { PhoneVerification } from "../components/setup/PhoneVerification";
import { ChannelSetup } from "../components/setup/ChannelSetup";
import { TelegramLinkPanel } from "../components/TelegramLinkPanel";
import { useTheme } from "../components/theme/ThemeProvider";
import { api } from "../services/api";
import { refreshSetup, useSetupStatus } from "../lib/setupStatus";
import { friendlyError } from "../lib/friendlyErrors";
import { cn } from "../components/ui/utils";

type Tab = "profile" | "connections" | "appearance";

export function Settings() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const setup = useSetupStatus();
  const profile = setup.profile;
  const { theme, setTheme } = useTheme();

  const initialTab = ((): Tab => {
    const t = params.get("tab");
    if (t === "profile" || t === "connections" || t === "appearance") return t;
    if (typeof window !== "undefined" && /#(user-session|channel|connections)/.test(window.location.hash)) return "connections";
    return "profile";
  })();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshSetup(true);
  }, []);

  function changeTab(next: Tab) {
    setTab(next);
    const p = new URLSearchParams(params);
    p.set("tab", next);
    setParams(p, { replace: true });
  }

  const isPlaceholderEmail = Boolean(profile?.email && /@users\.(telegram|facebook)\.exchange$/.test(profile.email));
  const initials = String(profile?.name || profile?.email || "U")
    .replace(/^@/, "")
    .split(/[\s@._]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  async function onPhoto(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Image must be 15 MB or smaller.");
      return;
    }
    setSavingPhoto(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 512, 0.85);
      await api.updateProfilePhoto(dataUrl);
      await refreshSetup(true);
      toast.success("Profile photo updated");
    } catch (e) {
      toast.error(friendlyError(e, "Could not update your photo").message);
    } finally {
      setSavingPhoto(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto() {
    setSavingPhoto(true);
    try {
      await api.updateProfilePhoto(null);
      await refreshSetup(true);
      toast.success("Profile photo removed");
    } catch (e) {
      toast.error(friendlyError(e).message);
    } finally {
      setSavingPhoto(false);
    }
  }

  async function unlinkTelegram() {
    setUnlinking(true);
    try {
      await api.unlinkTelegram();
      await refreshSetup(true);
      toast.success("Telegram disconnected");
      navigate("/get-started?step=telegram&returnTo=%2Fsettings%3Ftab%3Dconnections", { replace: true });
    } catch (e) {
      toast.error(friendlyError(e).message);
    } finally {
      setUnlinking(false);
      setConfirmUnlink(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your profile, your Telegram connections and how the app looks." />

      <SegmentedControl
        ariaLabel="Settings sections"
        value={tab}
        onChange={changeTab}
        options={[
          { value: "profile", label: "Profile" },
          { value: "connections", label: "Connections" },
          { value: "appearance", label: "Appearance" },
        ]}
      />

      {tab === "profile" ? (
        <Section title="Your profile" description="This is how other members see you on campaigns.">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <Avatar className="h-20 w-20 text-xl">
              {profile?.profilePhotoUrl ? <AvatarImage src={profile.profilePhotoUrl} alt="" /> : null}
              <AvatarFallback className="bg-primary text-primary-foreground">{initials || <User className="h-6 w-6" />}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void onPhoto(e.target.files?.[0] || null)}
                />
                <Button variant="outline" size="sm" disabled={savingPhoto} onClick={() => fileRef.current?.click()}>
                  {savingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {profile?.profilePhotoUrl ? "Change photo" : "Upload photo"}
                </Button>
                {profile?.profilePhotoUrl ? (
                  <Button variant="ghost" size="sm" disabled={savingPhoto} onClick={() => void removePhoto()}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">JPEG, PNG or WebP. We resize it for you.</p>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Name</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{profile?.name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Email</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {isPlaceholderEmail ? "Signed in with Telegram (no email)" : profile?.email || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Plan</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{profile?.plan?.name || "Free"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Credits</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">{Number(profile?.credits ?? 0).toLocaleString()}</dd>
            </div>
          </dl>
        </Section>
      ) : null}

      {tab === "connections" ? (
        <div className="space-y-6">
          <Section
            title={
              <span className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" /> Telegram account
              </span>
            }
            description="The Telegram account linked to Exchange Tunnel. Required for everything."
            actions={<StatusBadge status={setup.telegram ? "connected" : "missing"} />}
          >
            {setup.telegram ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Connected{profile?.name?.startsWith("@") ? ` as ${profile.name}` : ""}. You can switch to another
                  Telegram account by disconnecting this one.
                </p>
                <Button variant="outline" size="sm" onClick={() => setConfirmUnlink(true)}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="max-w-md">
                <TelegramLinkPanel variant="connect" onLinked={() => void refreshSetup(true)} />
              </div>
            )}
          </Section>

          <Section
            title={
              <span className="flex items-center gap-2" id="user-session">
                <Smartphone className="h-4 w-4 text-primary" /> Phone verification
              </span>
            }
            description="Lets us subscribe, like, comment and repost for you when you tap a task. Needed to earn credits."
            actions={<StatusBadge status={setup.phone ? "connected" : "missing"} label={setup.phone ? "Verified" : undefined} />}
          >
            {setup.telegram ? (
              <PhoneVerification verified={setup.phone} />
            ) : (
              <p className="text-sm text-muted-foreground">Connect your Telegram account first.</p>
            )}
          </Section>

          <Section
            title={
              <span className="flex items-center gap-2" id="channel">
                <Megaphone className="h-4 w-4 text-primary" /> Your channel
              </span>
            }
            description="The Telegram channel your campaigns promote, and where reposts are shared."
            actions={<StatusBadge status={setup.channel ? "connected" : "missing"} />}
          >
            {setup.telegram ? (
              <ChannelSetup
                connected={setup.channel}
                channelTitle={profile?.telegramActingChannelTitle}
                channelUsername={profile?.telegramActingChannelUsername}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Connect your Telegram account first.</p>
            )}
          </Section>
        </div>
      ) : null}

      {tab === "appearance" ? (
        <Section title="Appearance" description="Choose how Exchange Tunnel looks on this device.">
          <div className="grid max-w-md grid-cols-2 gap-3">
            {(
              [
                { id: "light", label: "Light", Icon: Sun },
                { id: "dark", label: "Dark", Icon: Moon },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setTheme(o.id)}
                aria-pressed={theme === o.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors",
                  theme === o.id ? "border-primary bg-primary-soft" : "border-border hover:border-primary/50",
                )}
              >
                <o.Icon className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium text-foreground">{o.label}</span>
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      <AlertDialog open={confirmUnlink} onOpenChange={setConfirmUnlink}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Telegram?</AlertDialogTitle>
            <AlertDialogDescription>
              Your phone verification and connected channel are removed too. You’ll need to connect a Telegram account
              again to keep using Exchange Tunnel. Your credits and campaigns stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinking}>Keep connected</AlertDialogCancel>
            <AlertDialogAction
              disabled={unlinking}
              onClick={(e) => {
                e.preventDefault();
                void unlinkTelegram();
              }}
            >
              {unlinking ? "Disconnecting…" : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Downscale an image to fit maxSize x maxSize and encode as a WebP/JPEG data URL. */
async function compressImageToDataUrl(file: File, maxSize: number, quality: number): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read image"));
      el.src = objectUrl;
    });
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL("image/webp", quality);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
