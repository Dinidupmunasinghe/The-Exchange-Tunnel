import { FormEvent, useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import { EmptyTableRow, FormError, FormMessage, PageHeader, StatusPill } from "./_shared";

type CreditPackage = {
  id: number;
  name: string;
  credits: number;
  priceLkr: string | number;
  isActive: boolean;
};

export function AdminPackages() {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", credits: "", priceLkr: "", isActive: true });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", credits: "", priceLkr: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminListPackages();
      setPackages((res.packages || []) as CreditPackage[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load packages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      await api.adminCreatePackage({
        name: form.name.trim(),
        credits: Number(form.credits),
        priceLkr: Number(form.priceLkr),
        isActive: form.isActive
      });
      setForm({ name: "", credits: "", priceLkr: "", isActive: true });
      setMessage("Package created");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create package");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(pkg: CreditPackage) {
    setError(null);
    setMessage(null);
    try {
      await api.adminUpdatePackage(pkg.id, { isActive: !pkg.isActive });
      setMessage(`Package ${!pkg.isActive ? "enabled" : "disabled"}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  function startEdit(pkg: CreditPackage) {
    setEditingId(pkg.id);
    setEditForm({
      name: pkg.name,
      credits: String(pkg.credits),
      priceLkr: String(pkg.priceLkr)
    });
  }

  async function saveEdit() {
    if (editingId == null) return;
    setError(null);
    setMessage(null);
    try {
      await api.adminUpdatePackage(editingId, {
        name: editForm.name.trim(),
        credits: Number(editForm.credits),
        priceLkr: Number(editForm.priceLkr)
      });
      setEditingId(null);
      setMessage("Package updated");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function remove(pkg: CreditPackage) {
    if (!confirm(`Delete package "${pkg.name}"? This cannot be undone.`)) return;
    setError(null);
    setMessage(null);
    try {
      await api.adminDeletePackage(pkg.id);
      setMessage("Package deleted");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Packages"
        description="Define purchasable credit bundles. Disable to hide from buyers without losing the record."
      />
      <FormError error={error} />
      <FormMessage message={message} />

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Create new package</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={handleCreate}>
            <Input
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="Package name"
            />
            <Input
              type="number"
              min={1}
              value={form.credits}
              onChange={(e) => setForm((s) => ({ ...s, credits: e.target.value }))}
              placeholder="Credits"
            />
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.priceLkr}
              onChange={(e) => setForm((s) => ({ ...s, priceLkr: e.target.value }))}
              placeholder="Price (LKR)"
            />
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Add package"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Existing packages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Credits</th>
                  <th className="px-3 py-2 text-left">Price (LKR)</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg) =>
                  editingId === pkg.id ? (
                    <tr key={pkg.id} className="border-t border-border bg-secondary/20">
                      <td className="px-3 py-2">
                        <Input
                          value={editForm.name}
                          onChange={(e) => setEditForm((s) => ({ ...s, name: e.target.value }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          value={editForm.credits}
                          onChange={(e) => setEditForm((s) => ({ ...s, credits: e.target.value }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={editForm.priceLkr}
                          onChange={(e) => setEditForm((s) => ({ ...s, priceLkr: e.target.value }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill value={pkg.isActive ? "active" : "paused"} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => void saveEdit()}>
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={pkg.id} className="border-t border-border">
                      <td className="px-3 py-2">{pkg.name}</td>
                      <td className="px-3 py-2">{pkg.credits}</td>
                      <td className="px-3 py-2">{Number(pkg.priceLkr).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <StatusPill value={pkg.isActive ? "active" : "paused"} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => startEdit(pkg)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void toggle(pkg)}>
                            {pkg.isActive ? "Disable" : "Enable"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void remove(pkg)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
                {packages.length === 0 && <EmptyTableRow message="No packages defined yet" colSpan={5} />}
              </tbody>
            </table>
          </div>
          {loading && <p className="mt-3 text-xs text-muted-foreground">Loading…</p>}
        </CardContent>
      </Card>
    </div>
  );
}
