/**
 * Accept only same-origin, in-app paths for post-login redirects ("/wallet?x=1").
 * Rejects absolute URLs, protocol-relative "//evil.com" and backslash tricks (open redirect).
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (value.startsWith("/login")) return null;
  return value;
}
