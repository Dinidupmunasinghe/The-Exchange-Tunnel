import { FormEvent, useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { api } from "../services/api";

type AdminUser = {
  id: number;
  email: string;
  name?: string | null;
  credits: number;
  telegramUserId?: string | null;
  isActive: boolean;
};

type AdminTx = {
  id: number;
  userId: number;
  type: "earn" | "spend";
  amount: number;
  reason: string;
  createdAt: string;
  user?: { id: number; email: string; name?: string | null };
};

type PlatformSettings = {
  dailyEarnLimit: number;
  likeReward: number;
  commentReward: number;
  subscribeReward: number;
};

type CreditPackage = {
  id: number;
  name: string;
  credits: number;
  priceLkr: string | number;
  isActive: boolean;
};

export function Admin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [transactions, setTransactions] = useState<AdminTx[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [settingsForm, setSettingsForm] = useState<PlatformSettings>({
    dailyEarnLimit: 500,
    likeReward: 5,
    commentReward: 10,
    subscribeReward: 10
  });
  const [packageForm, setPackageForm] = useState({
    name: "",
    credits: "",
    priceLkr: "",
    isActive: true
  });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingPackage, setSavingPackage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userRes, txRes, settingsRes, packagesRes] = await Promise.all([
        api.adminListUsers({ query: search || undefined, limit: 25 }),
        api.adminListTransactions({ limit: 50 }),
        api.adminGetSettings(),
        api.adminListPackages()
      ]);
      setUsers(userRes.users || []);
      setTransactions(txRes.transactions || []);
      setPackages(packagesRes.packages || []);
      setSettingsForm(settingsRes.settings || settingsForm);
      if (!selectedUser && (userRes.users || []).length > 0) {
        setSelectedUser(userRes.users[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, [search, selectedUser]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleAdjustCredits(e: FormEvent) {
    e.preventDefault();
    if (!selectedUser) {
      setError("Select a user first");
      return;
    }
    const n = Number(amount);
    if (!Number.isInteger(n) || n === 0) {
      setError("Amount must be a non-zero integer");
      return;
    }
    if (!String(reason || "").trim()) {
      setError("Reason is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.adminAdjustCredits({
        userId: selectedUser.id,
        amount: n,
        reason: reason.trim()
      });
      setMessage(res.message || "Credit updated");
      setAmount("");
      setReason("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to adjust credits");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setError(null);
    setMessage(null);
    try {
      await api.adminUpdateSettings({
        dailyEarnLimit: Number(settingsForm.dailyEarnLimit),
        likeReward: Number(settingsForm.likeReward),
        commentReward: Number(settingsForm.commentReward),
        subscribeReward: Number(settingsForm.subscribeReward)
      });
      setMessage("Platform reward settings saved");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleCreatePackage(e: FormEvent) {
    e.preventDefault();
    setSavingPackage(true);
    setError(null);
    setMessage(null);
    try {
      await api.adminCreatePackage({
        name: packageForm.name.trim(),
        credits: Number(packageForm.credits),
        priceLkr: Number(packageForm.priceLkr),
        isActive: packageForm.isActive
      });
      setPackageForm({ name: "", credits: "", priceLkr: "", isActive: true });
      setMessage("Package created");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create package");
    } finally {
      setSavingPackage(false);
    }
  }

  async function handleTogglePackage(pkg: CreditPackage) {
    setError(null);
    setMessage(null);
    try {
      await api.adminUpdatePackage(pkg.id, { isActive: !pkg.isActive });
      setMessage(`Package ${!pkg.isActive ? "enabled" : "disabled"}`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update package");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Control user credits, reward settings, free-plan limits, and package offerings.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Platform Reward Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={handleSaveSettings}>
            <Input
              type="number"
              min={0}
              value={settingsForm.dailyEarnLimit}
              onChange={(e) => setSettingsForm((s) => ({ ...s, dailyEarnLimit: Number(e.target.value) }))}
              placeholder="Free plan daily limit"
            />
            <Input
              type="number"
              min={0}
              value={settingsForm.likeReward}
              onChange={(e) => setSettingsForm((s) => ({ ...s, likeReward: Number(e.target.value) }))}
              placeholder="Like reward"
            />
            <Input
              type="number"
              min={0}
              value={settingsForm.commentReward}
              onChange={(e) => setSettingsForm((s) => ({ ...s, commentReward: Number(e.target.value) }))}
              placeholder="Comment reward"
            />
            <Input
              type="number"
              min={0}
              value={settingsForm.subscribeReward}
              onChange={(e) => setSettingsForm((s) => ({ ...s, subscribeReward: Number(e.target.value) }))}
              placeholder="Subscribe reward"
            />
            <div className="md:col-span-4">
              <Button type="submit" disabled={savingSettings}>
                {savingSettings ? "Saving..." : "Save Reward Settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Credit Packages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-3 md:grid-cols-4" onSubmit={handleCreatePackage}>
            <Input
              value={packageForm.name}
              onChange={(e) => setPackageForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="Package name"
            />
            <Input
              type="number"
              min={1}
              value={packageForm.credits}
              onChange={(e) => setPackageForm((s) => ({ ...s, credits: e.target.value }))}
              placeholder="Credits"
            />
            <Input
              type="number"
              min={0}
              step="0.01"
              value={packageForm.priceLkr}
              onChange={(e) => setPackageForm((s) => ({ ...s, priceLkr: e.target.value }))}
              placeholder="Price (LKR)"
            />
            <Button type="submit" disabled={savingPackage}>
              {savingPackage ? "Creating..." : "Add Package"}
            </Button>
          </form>
          <div className="max-h-56 overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Credits</th>
                  <th className="px-3 py-2 text-left">Price</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg) => (
                  <tr key={pkg.id} className="border-t border-border">
                    <td className="px-3 py-2">{pkg.name}</td>
                    <td className="px-3 py-2">{pkg.credits}</td>
                    <td className="px-3 py-2">{pkg.priceLkr}</td>
                    <td className="px-3 py-2">{pkg.isActive ? "Active" : "Inactive"}</td>
                    <td className="px-3 py-2">
                      <Button variant="outline" size="sm" onClick={() => void handleTogglePackage(pkg)}>
                        {pkg.isActive ? "Disable" : "Enable"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {packages.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-muted-foreground" colSpan={5}>
                      No packages yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>User Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email, name or Telegram ID"
            />
            <Button onClick={() => void loadData()} disabled={loading}>
              {loading ? "Loading..." : "Search"}
            </Button>
          </div>
          <div className="max-h-64 overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Credits</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className={`cursor-pointer border-t border-border ${
                      selectedUser?.id === u.id ? "bg-brand/10" : "hover:bg-secondary/30"
                    }`}
                    onClick={() => setSelectedUser(u)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{u.name || "Unnamed User"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-3 py-2">{u.credits}</td>
                    <td className="px-3 py-2">{u.isActive ? "Active" : "Blocked"}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-muted-foreground" colSpan={3}>
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Adjust Credits</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={handleAdjustCredits}>
            <Input value={selectedUser?.email || ""} disabled />
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (e.g. 50 or -50)"
            />
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
            <div className="md:col-span-3">
              <Button type="submit" disabled={submitting || !selectedUser}>
                {submitting ? "Updating..." : "Apply Credit Adjustment"}
              </Button>
            </div>
          </form>
          {message && <p className="mt-3 text-sm text-brand">{message}</p>}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="max-h-80 overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Amount</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-border">
                    <td className="px-3 py-2">{new Date(tx.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{tx.user?.email || `User #${tx.userId}`}</td>
                    <td className="px-3 py-2">{tx.type}</td>
                    <td className="px-3 py-2">{tx.amount}</td>
                    <td className="px-3 py-2">{tx.reason}</td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-muted-foreground" colSpan={5}>
                      No transactions found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
