import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import { api } from "../../services/api";
import { PricingCard } from "../../landing/components/PricingCard";
import {
  EMPTY_PACKAGE_DRAFT,
  featuresToText,
  textToFeatures,
  type PublicCreditPackage
} from "../../lib/creditPackages";
import { FormError, FormMessage, PageHeader, StatusPill } from "./_shared";

type Draft = Omit<PublicCreditPackage, "id"> & { id?: number };

function draftFromPackage(pkg: PublicCreditPackage): Draft {
  return {
    id: pkg.id,
    name: pkg.name,
    tagline: pkg.tagline,
    priceLabel: pkg.priceLabel,
    pricePeriod: pkg.pricePeriod,
    credits: pkg.credits,
    priceLkr: pkg.priceLkr,
    features: [...pkg.features],
    isPopular: pkg.isPopular,
    isActive: pkg.isActive !== false,
    sortOrder: pkg.sortOrder ?? 0
  };
}

function PackageEditor({
  draft,
  onChange,
  onSave,
  onDelete,
  onCancel,
  saving
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  onSave: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
  saving: boolean;
}) {
  const featuresText = featuresToText(draft.features);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
            <Label>Plan name</Label>
            <Input
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              placeholder="Pro"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Tagline</Label>
            <Input
              value={draft.tagline}
              onChange={(e) => onChange({ ...draft, tagline: e.target.value })}
              placeholder="For serious growth"
            />
          </div>
          <div className="space-y-2">
            <Label>Display price</Label>
            <Input
              value={draft.priceLabel}
              onChange={(e) => onChange({ ...draft, priceLabel: e.target.value })}
              placeholder="$29 or Free"
            />
          </div>
          <div className="space-y-2">
            <Label>Price period</Label>
            <Input
              value={draft.pricePeriod}
              onChange={(e) => onChange({ ...draft, pricePeriod: e.target.value })}
              placeholder="/month"
            />
          </div>
          <div className="space-y-2">
            <Label>Credits (wallet)</Label>
            <Input
              type="number"
              min={1}
              value={draft.credits}
              onChange={(e) => onChange({ ...draft, credits: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Price LKR (billing)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={draft.priceLkr}
              onChange={(e) => onChange({ ...draft, priceLkr: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Sort order</Label>
            <Input
              type="number"
              min={0}
              value={draft.sortOrder ?? 0}
              onChange={(e) => onChange({ ...draft, sortOrder: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Features (one per line)</Label>
          <Textarea
            rows={8}
            value={featuresText}
            onChange={(e) => onChange({ ...draft, features: textToFeatures(e.target.value) })}
            placeholder="2,000 exchanges per month&#10;Real-time analytics"
          />
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.isPopular}
              onCheckedChange={(checked) => onChange({ ...draft, isPopular: checked })}
            />
            Most popular badge
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.isActive !== false}
              onCheckedChange={(checked) => onChange({ ...draft, isActive: checked })}
            />
            Visible on site
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save package"}
          </Button>
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          {onDelete ? (
            <Button type="button" variant="outline" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Landing page preview (styles fixed)
        </p>
        <PricingCard
          name={draft.name || "Plan"}
          price={draft.priceLabel || "Free"}
          period={draft.pricePeriod || "/month"}
          description={draft.tagline || "Tagline"}
          features={draft.features.length ? draft.features : ["Add features in the editor"]}
          popular={draft.isPopular}
        />
      </div>
    </div>
  );
}

export function AdminPackages() {
  const [packages, setPackages] = useState<PublicCreditPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_PACKAGE_DRAFT });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminListPackages();
      setPackages(Array.isArray(res.packages) ? res.packages : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load packages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setEditingId("new");
    setDraft({ ...EMPTY_PACKAGE_DRAFT, sortOrder: packages.length });
    setMessage(null);
    setError(null);
  }

  function startEdit(pkg: PublicCreditPackage) {
    setEditingId(pkg.id);
    setDraft(draftFromPackage(pkg));
    setMessage(null);
    setError(null);
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const payload = {
      name: draft.name.trim(),
      tagline: draft.tagline.trim(),
      priceLabel: draft.priceLabel.trim(),
      pricePeriod: draft.pricePeriod.trim() || "/month",
      credits: Number(draft.credits),
      priceLkr: Number(draft.priceLkr),
      features: draft.features,
      isPopular: Boolean(draft.isPopular),
      isActive: draft.isActive !== false,
      sortOrder: Number(draft.sortOrder ?? 0)
    };
    try {
      if (editingId === "new") {
        await api.adminCreatePackage(payload);
        setMessage("Package created");
      } else if (typeof editingId === "number") {
        await api.adminUpdatePackage(editingId, payload);
        setMessage("Package updated");
      }
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save package");
    } finally {
      setSaving(false);
    }
  }

  async function remove(pkg: PublicCreditPackage) {
    if (!confirm(`Delete package "${pkg.name}"?`)) return;
    setError(null);
    try {
      await api.adminDeletePackage(pkg.id);
      if (editingId === pkg.id) setEditingId(null);
      setMessage("Package deleted");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing packages"
        description="Edit plan details shown on the landing page and wallet. Card layout and styles stay fixed — you only change text, price labels, features, and visibility."
        actions={
          <Button type="button" onClick={startCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add package
          </Button>
        }
      />
      <FormError error={error} />
      <FormMessage message={message} />

      {editingId !== null ? (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>{editingId === "new" ? "New package" : `Edit: ${draft.name}`}</CardTitle>
          </CardHeader>
          <CardContent>
            <PackageEditor
              draft={draft}
              onChange={setDraft}
              onSave={() => void saveDraft()}
              onCancel={() => setEditingId(null)}
              onDelete={typeof editingId === "number" ? () => void remove({ ...draft, id: editingId } as PublicCreditPackage) : undefined}
              saving={saving}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {packages.map((pkg) => (
          <Card key={pkg.id} className="border-border bg-card">
            <CardHeader className="space-y-2 pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">{pkg.name}</CardTitle>
                <StatusPill value={pkg.isActive ? "active" : "paused"} />
              </div>
              <p className="text-sm text-muted-foreground">{pkg.tagline}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-2xl font-bold text-foreground">
                {pkg.priceLabel}
                {pkg.priceLabel.toLowerCase() !== "free" ? (
                  <span className="text-sm font-normal text-muted-foreground"> {pkg.pricePeriod}</span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {pkg.credits.toLocaleString()} credits · order {pkg.sortOrder ?? 0}
                {pkg.isPopular ? " · Most popular" : ""}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => startEdit(pkg)}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => void remove(pkg)}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {packages.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground md:col-span-2 xl:col-span-4">
          No packages yet. Click Add package to create your first plan.
        </p>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
    </div>
  );
}
