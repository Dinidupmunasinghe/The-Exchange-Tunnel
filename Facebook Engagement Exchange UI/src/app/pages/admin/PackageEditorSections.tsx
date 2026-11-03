import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { normalizeEntitlements, type PackageEntitlements, type PublicCreditPackage } from "../../lib/creditPackages";

type Draft = Omit<PublicCreditPackage, "id"> & { id?: number };

type Props = {
  draft: Draft;
  ent: PackageEntitlements;
  onChange: (next: Draft) => void;
  patchEntitlements: (patch: Partial<PackageEntitlements>) => void;
  patchFlags: (patch: Partial<PackageEntitlements["flags"]>) => void;
  onSyncPayPal?: () => void;
  syncingPayPal?: boolean;
  onSave: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  saving: boolean;
};

export function PackageEditorSections({
  draft,
  ent,
  onChange,
  patchEntitlements,
  patchFlags,
  onSyncPayPal,
  syncingPayPal,
  onSave,
  onCancel,
  onDelete,
  saving
}: Props) {
  return (
    <>
      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm font-medium">Billing &amp; PayPal</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Price USD (PayPal)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={draft.priceUsd ?? 0}
              onChange={(e) => onChange({ ...draft, priceUsd: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={Boolean(draft.isFree)}
                onCheckedChange={(checked) =>
                  onChange({
                    ...draft,
                    isFree: checked,
                    entitlements: normalizeEntitlements(draft.entitlements, checked)
                  })
                }
              />
              Free plan (no PayPal)
            </label>
          </div>
        </div>
        {draft.paypalPlanId ? (
          <p className="text-xs font-mono text-muted-foreground">PayPal plan: {draft.paypalPlanId}</p>
        ) : (
          <p className="text-xs text-muted-foreground">PayPal plan not synced yet.</p>
        )}
        {onSyncPayPal && !draft.isFree ? (
          <Button type="button" variant="outline" size="sm" onClick={onSyncPayPal} disabled={syncingPayPal}>
            {syncingPayPal ? "Syncing…" : "Sync to PayPal"}
          </Button>
        ) : null}
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm font-medium">Plan limits (enforced on server)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Free credit cap</Label>
            <Input
              type="number"
              min={0}
              placeholder="50 or empty"
              value={ent.freeCreditCap ?? ""}
              onChange={(e) =>
                patchEntitlements({
                  freeCreditCap: e.target.value === "" ? null : Number(e.target.value)
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Monthly credit grant</Label>
            <Input
              type="number"
              min={0}
              value={ent.monthlyCreditGrant}
              onChange={(e) => patchEntitlements({ monthlyCreditGrant: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Monthly exchange limit</Label>
            <Input
              type="number"
              min={0}
              value={ent.monthlyExchangeLimit}
              onChange={(e) => patchEntitlements({ monthlyExchangeLimit: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Max active campaigns</Label>
            <Input
              type="number"
              min={1}
              value={ent.maxActiveCampaigns}
              onChange={(e) => patchEntitlements({ maxActiveCampaigns: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Daily earn limit override</Label>
            <Input
              type="number"
              min={0}
              placeholder="Use global setting"
              value={ent.dailyEarnLimitOverride ?? ""}
              onChange={(e) =>
                patchEntitlements({
                  dailyEarnLimitOverride: e.target.value === "" ? null : Number(e.target.value)
                })
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={ent.flags.apiAccess} onCheckedChange={(c) => patchFlags({ apiAccess: c })} />
            API access
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={ent.flags.prioritySupport} onCheckedChange={(c) => patchFlags({ prioritySupport: c })} />
            Priority support
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={ent.flags.customTargeting} onCheckedChange={(c) => patchFlags({ customTargeting: c })} />
            Custom targeting
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={ent.flags.removeWatermark} onCheckedChange={(c) => patchFlags({ removeWatermark: c })} />
            Remove watermark
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={draft.isPopular} onCheckedChange={(c) => onChange({ ...draft, isPopular: c })} />
          Most popular badge
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={draft.isActive !== false} onCheckedChange={(c) => onChange({ ...draft, isActive: c })} />
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
            Delete
          </Button>
        ) : null}
      </div>
    </>
  );
}
