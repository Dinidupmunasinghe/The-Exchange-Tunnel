import type { PublicCreditPackage } from "./creditPackages";

export type PackageCta = { href: string; label: string; disabled?: boolean };

/**
 * Where a plan's button should go, depending on whether the visitor is signed in and which
 * plan they are on right now.
 */
export function packageCta(
  pkg: Pick<PublicCreditPackage, "id" | "isFree" | "requiresPayment">,
  opts: { currentPackageId?: number | null; currentIsPaid?: boolean; signedIn?: boolean } = {}
): PackageCta {
  const signedIn =
    opts.signedIn ?? (typeof window !== "undefined" && Boolean(localStorage.getItem("exchange_token")));
  if (opts.currentPackageId != null && opts.currentPackageId === pkg.id) {
    return { href: "/wallet", label: "Current plan", disabled: true };
  }
  if (pkg.isFree || !pkg.requiresPayment) {
    return signedIn
      ? { href: "/earn", label: "Start earning" }
      : { href: "/login?intent=free&mode=register", label: "Get started free" };
  }
  return signedIn
    ? { href: `/checkout?packageId=${pkg.id}`, label: opts.currentIsPaid ? "Switch to this plan" : "Upgrade" }
    : {
        href: `/login?intent=subscribe&packageId=${pkg.id}&returnTo=${encodeURIComponent(`/checkout?packageId=${pkg.id}`)}`,
        label: "Subscribe"
      };
}
