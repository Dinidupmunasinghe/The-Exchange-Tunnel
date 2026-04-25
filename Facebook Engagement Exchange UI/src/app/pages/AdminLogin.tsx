import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { api, getAdminToken, isAccessTokenValid } from "../services/api";

export function AdminLogin() {
  const navigate = useNavigate();
  const existing = getAdminToken();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (existing && isAccessTokenValid(existing)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.adminLogin({ email, password });
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-slate-900">
      <Card className="w-full max-w-md border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl text-slate-900">Admin Login</CardTitle>
          <p className="text-sm text-slate-500">Sign in with your admin credentials.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Admin email"
              required
              className="border-slate-300 bg-white text-slate-900"
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              required
              className="border-slate-300 bg-white text-slate-900"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white hover:bg-blue-700"
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
