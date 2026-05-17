import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { api } from "../../services/api";
import { PricingCard } from "../../landing/components/PricingCard";
import {
  EMPTY_PACKAGE_DRAFT,
  normalizeFeatures,
  normalizePublicPackage,
  priceLkrFromDisplayLabel,
  type PublicCreditPackage
} from "../../lib/creditPackages";
import { FormError, FormMessage, PageHeader, StatusPill } from "./_shared";

type Draft = Omit<PublicCreditPackage, "id"> & { id?: number };

function draftFromPackage(pkg: PublicCreditPackage): Draft {
  const normalized = normalizePublicPackage(pkg);
  const { id, ...rest } = normalized;
  return { id, ...rest };
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
  const featureRows = draft.features?.length ? draft.features : [""];
  const previewFeatures = normalizeFeatures(draft.features);

  function setFeatures(next: string[]) {
    onChange({ ...draft, features: next });
  }

  function updateFeature(index: number, value: string) {
    const next = [...featureRows];
    next[index] = value;
    setFeatures(next);
  }

  function addFeature() {
    setFeatures([...featureRows, ""]);
  }

  function removeFeature(index: number) {
    const next = featureRows.filter((_, i) => i !== index);
    setFeatures(next.length ? next : [""]);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Plan name</Label>
            <Input
              value={draft.name ?? ""}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              placeholder="Pro"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Tagline</Label>
            <Input
              value={draft.tagline ?? ""}
              onChange={(e) => onChange({ ...draft, tagline: e.target.value })}
              placeholder="For serious growth"
            />
          </div>
          <div className="space-y-2">
            <Label>Display price</Label>
            <Input
              value={draft.priceLabel ?? ""}
              onChange={(e) => onChange({ ...draft, priceLabel: e.target.value })}
              placeholder="$29 or Free"
            />
          </div>
          <div className="space-y-2">
            <Label>Price period</Label>
            <Input
              value={draft.pricePeriod ?? ""}
              onChange={(e) => onChange({ ...draft, pricePeriod: e.target.value })}
              placeholder="/month"
            />
          </div>
          <div className="space-y-2">
            <Label>Credits (wallet)</Label>
            <Input
              type="number"
              min={1}
              value={draft.credits ?? 0}
              onChange={(e) => onChange({ ...draft, credits: Number(e.target.value) })}
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

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Features</Label>
            <Button type="button" variant="outline" size="sm" onClick={addFeature}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add feature
            </Button>
          </div>
          <div className="space-y-2">
            {featureRows.map((feature, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={feature}
                  onChange={(e) => updateFeature(index, e.target.value)}
                  placeholder="e.g. 2,000 exchanges per month"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeFeature(index)}
                  disabled={featureRows.length === 1 && !feature.trim()}
                  aria-label="Remove feature"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
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
          preview
          name={draft.name || "Plan"}
          price={draft.priceLabel || "Free"}
          period={draft.pricePeriod || "/month"}
          description={draft.tagline || "Tagline"}
          features={previewFeatures.length ? previewFeatures : ["Add features in the editor"]}
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
  const editorRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminListPackages();
      const list = Array.isArray(res.packages) ? res.packages : [];
      setPackages(list.map((p) => normalizePublicPackage(p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load packages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (editingId === null) return;
    const t = window.setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [editingId]);

  function startCreate() {
    setEditingId("new");
    setDraft({ ...EMPTY_PACKAGE_DRAFT, sortOrder: packages.length });
    setMessage(null);
    setError(null);
  }

  function startEdit(pkg: PublicCreditPackage) {
    const id = Number(pkg.id);
    if (!Number.isFinite(id)) {
      setError("Could not open editor: invalid package id.");
      return;
    }
    setEditingId(id);
    setDraft(draftFromPackage(pkg));
    setMessage(null);
    setError(null);
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const payload = {
      name: String(draft.name ?? "").trim(),
      tagline: String(draft.tagline ?? "").trim(),
      priceLabel: String(draft.priceLabel ?? "").trim(),
      pricePeriod: String(draft.pricePeriod ?? "").trim() || "/month",
      credits: Number(draft.credits),
      priceLkr: priceLkrFromDisplayLabel(String(draft.priceLabel ?? "")),
      features: normalizeFeatures(draft.features),
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
        <div
          ref={editorRef}
          className="sticky top-0 z-20 -mx-1 scroll-mt-4 rounded-xl border-2 border-primary/40 bg-background/95 p-1 shadow-lg backdrop-blur-sm"
        >
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle>{editingId === "new" ? "New package" : `Edit: ${draft.name || "Package"}`}</CardTitle>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                Close
              </Button>
            </CardHeader>
            <CardContent>
              <PackageEditor
                draft={draft}
                onChange={setDraft}
                onSave={() => void saveDraft()}
                onCancel={() => setEditingId(null)}
                onDelete={
                  typeof editingId === "number"
                    ? () => void remove({ ...draft, id: editingId } as PublicCreditPackage)
                    : undefined
                }
                saving={saving}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {packages.map((pkg) => {
          const isEditing = editingId === pkg.id;
          return (
            <Card
              key={pkg.id}
              className={`border-border bg-card ${isEditing ? "ring-2 ring-primary" : ""}`}
            >
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
                  <Button
                    type="button"
                    size="sm"
                    variant={isEditing ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => startEdit(pkg)}
                  >
                    {isEditing ? "Editing…" : "Edit"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void remove(pkg)}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
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
