import { FormEvent, useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { FormError, FormMessage, PageHeader } from "./_shared";

type Rule = {
  id: number;
  minSubscribers: number;
  maxSubscribers: number | null;
  credits: number;
  isActive: boolean;
};

export function AdminRepostPricing() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [newRule, setNewRule] = useState<{ minSubscribers: string; maxSubscribers: string; credits: string }>({
    minSubscribers: "0",
    maxSubscribers: "",
    credits: "15"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rulesRes = await api.adminListRepostPricingRules();
      setRules((rulesRes.rules || []) as Rule[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pricing rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreateRule(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api.adminCreateRepostPricingRule({
        minSubscribers: Number(newRule.minSubscribers || 0),
        maxSubscribers: newRule.maxSubscribers.trim() ? Number(newRule.maxSubscribers) : null,
        credits: Number(newRule.credits || 0),
        isActive: true
      });
      setMessage("Pricing rule created");
      setNewRule({ minSubscribers: "0", maxSubscribers: "", credits: "15" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pricing rule");
    }
  }

  async function handleUpdateRule(rule: Rule) {
    setError(null);
    setMessage(null);
    try {
      await api.adminUpdateRepostPricingRule(rule.id, {
        minSubscribers: Number(rule.minSubscribers),
        maxSubscribers: rule.maxSubscribers == null ? null : Number(rule.maxSubscribers),
        credits: Number(rule.credits),
        isActive: Boolean(rule.isActive)
      });
      setMessage("Pricing rule updated");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pricing rule");
    }
  }

  async function handleDeleteRule(id: number) {
    setError(null);
    setMessage(null);
    try {
      await api.adminDeleteRepostPricingRule(id);
      setMessage("Pricing rule deleted");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete pricing rule");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Repost Pricing"
        description="Set credits charged for repost requests based on subscriber count tiers."
      />
      <FormError error={error} />
      <FormMessage message={message} />

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Repost pricing rules by subscribers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-3 md:grid-cols-4" onSubmit={handleCreateRule}>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground">Min subscribers</label>
              <Input
                type="number"
                min={0}
                value={newRule.minSubscribers}
                onChange={(e) => setNewRule((s) => ({ ...s, minSubscribers: e.target.value }))}
                placeholder="e.g. 0"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground">
                Max subscribers (optional)
              </label>
              <Input
                type="number"
                min={0}
                value={newRule.maxSubscribers}
                onChange={(e) => setNewRule((s) => ({ ...s, maxSubscribers: e.target.value }))}
                placeholder="Leave empty = no upper limit"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground">Credits to charge</label>
              <Input
                type="number"
                min={1}
                value={newRule.credits}
                onChange={(e) => setNewRule((s) => ({ ...s, credits: e.target.value }))}
                placeholder="e.g. 15"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Add rule
              </Button>
            </div>
          </form>
          <p className="text-xs text-muted-foreground">
            Example: Min 0, Max 1,000, Credits 15 means channels with 0-1,000 subscribers cost 15 credits.
          </p>

          <div className="max-h-[50vh] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border">
                <tr>
                  <th className="px-3 py-2 text-left">Range (subs)</th>
                  <th className="px-3 py-2 text-left">Credits</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, idx) => (
                  <tr key={rule.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          value={rule.minSubscribers}
                          onChange={(e) =>
                            setRules((rows) =>
                              rows.map((r, i) =>
                                i === idx ? { ...r, minSubscribers: Number(e.target.value || 0) } : r
                              )
                            )
                          }
                          className="h-8 w-28"
                        />
                        <span className="text-muted-foreground">to</span>
                        <Input
                          type="number"
                          min={0}
                          value={rule.maxSubscribers ?? ""}
                          onChange={(e) =>
                            setRules((rows) =>
                              rows.map((r, i) =>
                                i === idx
                                  ? { ...r, maxSubscribers: e.target.value === "" ? null : Number(e.target.value) }
                                  : r
                              )
                            )
                          }
                          className="h-8 w-32"
                          placeholder="no max"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={1}
                        value={rule.credits}
                        onChange={(e) =>
                          setRules((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, credits: Number(e.target.value || 1) } : r))
                          )
                        }
                        className="h-8 w-24"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={rule.isActive}
                          onChange={(e) =>
                            setRules((rows) =>
                              rows.map((r, i) => (i === idx ? { ...r, isActive: e.target.checked } : r))
                            )
                          }
                        />
                        Active
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => void handleUpdateRule(rule)}>
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleDeleteRule(rule.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {loading ? "Loading rules..." : "No pricing rules yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
