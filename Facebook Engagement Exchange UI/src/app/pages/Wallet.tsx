import { useEffect, useMemo, useState } from "react";
import { Plus, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { api } from "../services/api";
import { WalletPackageCard } from "../components/WalletPackageCard";
import type { PublicCreditPackage } from "../lib/creditPackages";

export function Wallet() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [packages, setPackages] = useState<PublicCreditPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getTransactions(), api.getProfile()])
      .then(([tx, profile]) => {
        setTransactions(tx.transactions);
        setBalance(profile.user.credits || 0);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    api
      .getPublicPackages()
      .then((res) => setPackages(Array.isArray(res.packages) ? res.packages : []))
      .catch(() => setPackages([]))
      .finally(() => setPackagesLoading(false));
  }, []);

  const totalEarned = useMemo(
    () => transactions.filter((t) => t.type === "earn").reduce((sum, t) => sum + Number(t.amount), 0),
    [transactions]
  );
  const totalSpent = useMemo(
    () => Math.abs(transactions.filter((t) => t.type === "spend").reduce((sum, t) => sum + Number(t.amount), 0)),
    [transactions]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Wallet</h1>
          <p className="text-muted-foreground mt-1">Manage your credits and transactions</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Buy Credits
        </Button>
      </div>

      {/* Balance Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-gradient-to-br from-primary/20 to-primary/5">
          <CardContent className="p-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Available Balance</p>
              <p className="text-4xl font-bold text-primary">{balance}</p>
              <p className="text-xs text-muted-foreground">Credits</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <p className="text-sm text-muted-foreground">Total Earned</p>
              </div>
              <p className="text-3xl font-bold text-foreground">{totalEarned}</p>
              <p className="text-xs text-green-500">All time</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-orange-500" />
                <p className="text-sm text-muted-foreground">Total Spent</p>
              </div>
              <p className="text-3xl font-bold text-foreground">{totalSpent}</p>
              <p className="text-xs text-orange-500">All time</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Credit Packages */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Buy Credits</CardTitle>
          <p className="text-sm text-muted-foreground">Choose a package to get started</p>
        </CardHeader>
        <CardContent>
          {packagesLoading ? (
            <p className="text-sm text-muted-foreground">Loading packages…</p>
          ) : packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No packages available right now.</p>
          ) : (
            <div
              className={`grid gap-4 ${
                packages.length >= 4
                  ? "md:grid-cols-2 xl:grid-cols-4"
                  : packages.length === 3
                    ? "md:grid-cols-3"
                    : "md:grid-cols-2"
              }`}
            >
              {packages.map((pkg) => (
                <WalletPackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Transaction History</CardTitle>
          <p className="text-sm text-muted-foreground">Your recent credit activity</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4 transition-colors hover:bg-secondary/50"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      transaction.type === "earn"
                        ? "bg-primary/10"
                        : "bg-orange-500/10"
                    }`}
                  >
                    {transaction.type === "earn" ? (
                      <TrendingUp className="h-5 w-5 text-primary" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-orange-500" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {transaction.description}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(transaction.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-lg font-bold ${
                      transaction.type === "earn"
                        ? "text-primary"
                        : "text-orange-500"
                    }`}
                  >
                    {transaction.amount > 0 ? "+" : ""}
                    {transaction.amount}
                  </p>
                  <p className="text-xs text-muted-foreground">credits</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
