import { FormEvent, useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { FormError, FormMessage, PageHeader } from "./_shared";

type Settings = {
  dailyEarnLimit: number;
  likeReward: number;
  commentReward: number;
  subscribeReward: number;
};

export function AdminRewards() {
  const [settings, setSettings] = useState<Settings>({
    dailyEarnLimit: 500,
    likeReward: 5,
    commentReward: 10,
    subscribeReward: 10
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminGetSettings();
      if (res.settings) setSettings(res.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.adminUpdateSettings({
        dailyEarnLimit: Number(settings.dailyEarnLimit),
        likeReward: Number(settings.likeReward),
        commentReward: Number(settings.commentReward),
        subscribeReward: Number(settings.subscribeReward)
      });
      setMessage("Reward settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rewards & Limits"
        description="Daily free-plan earn cap and per-action reward credits used by every campaign."
      />
      <FormError error={error} />
      <FormMessage message={message} />

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Platform reward settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSave}>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Free-plan daily earn limit (credits)
              </label>
              <Input
                type="number"
                min={0}
                value={settings.dailyEarnLimit}
                onChange={(e) => setSettings((s) => ({ ...s, dailyEarnLimit: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Subscribe reward (credits)
              </label>
              <Input
                type="number"
                min={0}
                value={settings.subscribeReward}
                onChange={(e) => setSettings((s) => ({ ...s, subscribeReward: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Like reward (credits)</label>
              <Input
                type="number"
                min={0}
                value={settings.likeReward}
                onChange={(e) => setSettings((s) => ({ ...s, likeReward: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Comment reward (credits)</label>
              <Input
                type="number"
                min={0}
                value={settings.commentReward}
                onChange={(e) => setSettings((s) => ({ ...s, commentReward: Number(e.target.value) }))}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving || loading}>
                {saving ? "Saving…" : "Save reward settings"}
              </Button>
            </div>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            Campaign creators are charged exactly these reward values per engagement. New campaigns automatically
            pick up updates to this table.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
