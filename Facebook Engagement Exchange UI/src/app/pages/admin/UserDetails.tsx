import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { api } from "../../services/api";
import {
  EmptyTableRow,
  FormError,
  FormMessage,
  PageHeader,
  StatusPill,
  formatDateTime
} from "./_shared";

type Detail = {
  user: any;
  campaigns: any[];
  transactions: any[];
  engagements: any[];
  pendingRefundDebt: number;
};

export function AdminUserDetails() {
  const { id } = useParams();
  const userId = Number(id);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const load = useCallback(async () => {
    if (!Number.isInteger(userId) || userId < 1) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminGetUserDetails(userId);
      setDetail(res as Detail);
      setName(res.user.name || "");
      setEmail(res.user.email || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await api.adminUpdateUser(userId, { name: name.trim() || undefined, email: email.trim() || undefined });
      setMessage("User updated");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    }
  }

  async function handleAdjust(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const amount = Number(adjustAmount);
    if (!Number.isInteger(amount) || amount === 0) {
      setError("Amount must be a non-zero integer");
      return;
    }
    if (!adjustReason.trim()) {
      setError("Reason is required");
      return;
    }
    try {
      const res = await api.adminAdjustCredits({ userId, amount, reason: adjustReason.trim() });
      setMessage(res.message || "Credits adjusted");
      setAdjustAmount("");
      setAdjustReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to adjust credits");
    }
  }

  async function toggleBlock() {
    if (!detail) return;
    setMessage(null);
    setError(null);
    try {
      if (detail.user.isActive) await api.adminBlockUser(userId);
      else await api.adminUnblockUser(userId);
      setMessage(detail.user.isActive ? "User blocked" : "User unblocked");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function clearSession() {
    setMessage(null);
    setError(null);
    try {
      await api.adminClearMtprotoSession(userId);
      setMessage("Telegram user session cleared");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!Number.isInteger(userId) || userId < 1) {
    return <p className="text-sm text-muted-foreground">Invalid user id.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail ? `User #${detail.user.id}` : "User"}
        description={detail ? detail.user.email : ""}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/dashboard/users">Back to users</Link>
          </Button>
        }
      />
      <FormError error={error} />
      <FormMessage message={message} />

      {detail ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <form className="space-y-3" onSubmit={handleSaveProfile}>
                  <div>
                    <label className="text-xs text-muted-foreground">Name</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Email</label>
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit">Save profile</Button>
                    <Button type="button" variant="outline" onClick={() => void toggleBlock()}>
                      {detail.user.isActive ? "Block user" : "Unblock user"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void clearSession()}>
                      Clear Telegram session
                    </Button>
                  </div>
                </form>
                <div className="grid grid-cols-2 gap-3 pt-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <StatusPill value={detail.user.isActive ? "active" : "blocked"} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Has MTProto session</p>
                    <p className="font-medium">{detail.user.hasMtprotoSession ? "Yes" : "No"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Telegram ID</p>
                    <p className="font-medium">{detail.user.telegramUserId || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Connected channel</p>
                    <p className="font-medium">{detail.user.telegramActingChannelTitle || "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>Credits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Balance</p>
                    <p className="text-3xl font-bold text-foreground">{detail.user.credits}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Earned today</p>
                    <p className="text-3xl font-bold text-foreground">{detail.user.dailyEarnedCredits || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pending refund debt</p>
                    <p className="text-2xl font-semibold text-amber-300">{detail.pendingRefundDebt}</p>
                  </div>
                </div>
                <form className="space-y-3" onSubmit={handleAdjust}>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      placeholder="Amount (e.g. 50 or -50)"
                    />
                    <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Reason" />
                  </div>
                  <Button type="submit">Apply credit adjustment</Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Recent campaigns ({detail.campaigns.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[50vh] overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-card text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border">
                    <tr>
                      <th className="px-3 py-2 text-left">ID</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Cost / slot</th>
                      <th className="px-3 py-2 text-left">Slots</th>
                      <th className="px-3 py-2 text-left">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.campaigns.map((c: any) => (
                      <tr key={c.id} className="border-t border-border">
                        <td className="px-3 py-2">{c.id}</td>
                        <td className="px-3 py-2">{c.name}</td>
                        <td className="px-3 py-2">{c.engagementType}</td>
                        <td className="px-3 py-2">
                          <StatusPill value={c.status} />
                        </td>
                        <td className="px-3 py-2">{c.creditsPerEngagement}</td>
                        <td className="px-3 py-2">{c.maxEngagements}</td>
                        <td className="px-3 py-2 text-xs">{formatDateTime(c.createdAt)}</td>
                      </tr>
                    ))}
                    {detail.campaigns.length === 0 && (
                      <EmptyTableRow message="No campaigns" colSpan={7} />
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>Recent transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[45vh] overflow-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-card text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border">
                      <tr>
                        <th className="px-3 py-2 text-left">When</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Amount</th>
                        <th className="px-3 py-2 text-left">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.transactions.map((tx: any) => (
                        <tr key={tx.id} className="border-t border-border">
                          <td className="px-3 py-2 text-xs">{formatDateTime(tx.createdAt)}</td>
                          <td className="px-3 py-2">
                            <StatusPill value={tx.type === "earn" ? "active" : "cancelled"} />
                          </td>
                          <td className="px-3 py-2 font-medium">{tx.amount}</td>
                          <td className="px-3 py-2 text-xs">{tx.reason}</td>
                        </tr>
                      ))}
                      {detail.transactions.length === 0 && (
                        <EmptyTableRow message="No transactions" colSpan={4} />
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>Recent engagements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[45vh] overflow-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-card text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border">
                      <tr>
                        <th className="px-3 py-2 text-left">When</th>
                        <th className="px-3 py-2 text-left">Action</th>
                        <th className="px-3 py-2 text-left">Campaign</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.engagements.map((e: any) => (
                        <tr key={e.id} className="border-t border-border">
                          <td className="px-3 py-2 text-xs">{formatDateTime(e.createdAt)}</td>
                          <td className="px-3 py-2">{e.actionKind || e.engagementType}</td>
                          <td className="px-3 py-2 text-xs">
                            #{e.campaign?.id} {e.campaign?.name}
                          </td>
                          <td className="px-3 py-2">
                            <StatusPill value={e.verificationStatus} />
                          </td>
                        </tr>
                      ))}
                      {detail.engagements.length === 0 && (
                        <EmptyTableRow message="No engagements" colSpan={4} />
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{loading ? "Loading user…" : "No data"}</p>
      )}
    </div>
  );
}
