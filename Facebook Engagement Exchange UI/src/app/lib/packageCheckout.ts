import type { PublicCreditPackage } from "./creditPackages";

export function packageCta(pkg: Pick<PublicCreditPackage, "id" | "isFree" | "requiresPayment">) {
  if (pkg.isFree || !pkg.requiresPayment) {
    return {
      href: "/login?intent=free",
      label: "Get Started"
    };
  }
  const hasToken =
    typeof window !== "undefined" && Boolean(localStorage.getItem("exchange_token"));
  return {
    href: hasToken ? `/checkout?packageId=${pkg.id}` : `/login?intent=subscribe&packageId=${pkg.id}`,
    label: "Subscribe"
  };
}
