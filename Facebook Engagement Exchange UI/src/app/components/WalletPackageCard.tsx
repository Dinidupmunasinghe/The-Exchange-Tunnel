import { Check, Zap } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import type { PublicCreditPackage } from "../lib/creditPackages";
import { cn } from "./ui/utils";

type WalletPackageCardProps = {
  pkg: PublicCreditPackage;
  ctaLabel: string;
  ctaDisabled?: boolean;
  isCurrent?: boolean;
  onBuy?: (pkg: PublicCreditPackage) => void;
};

export function WalletPackageCard({ pkg, ctaLabel, ctaDisabled, isCurrent, onBuy }: WalletPackageCardProps) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-xl border-2 p-6 transition-all",
        isCurrent
          ? "border-emerald-500/60 bg-emerald-500/5"
          : pkg.isPopular
            ? "border-primary bg-primary/5 shadow-lg"
            : "border-border bg-secondary/30",
      )}
    >
      {isCurrent ? (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1 bg-emerald-600 px-3 text-white">
          <Check className="h-3 w-3" />
          Your plan
        </Badge>
      ) : pkg.isPopular ? (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1 bg-primary px-3">
          <Zap className="h-3 w-3 fill-current" />
          Most Popular
        </Badge>
      ) : null}

      <div className="mb-4 space-y-1 text-center">
        <h3 className="text-xl font-bold text-foreground">{pkg.name}</h3>
        <p className="min-h-[1.25rem] text-sm text-muted-foreground">{pkg.tagline}</p>
      </div>

      <div className="mb-4 text-center">
        <p className="text-3xl font-bold text-foreground">{pkg.priceLabel || (pkg.isFree ? "Free" : `$${pkg.priceUsd}`)}</p>
        <p className="min-h-[1rem] text-xs text-muted-foreground">{pkg.isFree ? "forever" : pkg.pricePeriod}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {pkg.credits.toLocaleString()} credits{pkg.isFree ? " to start" : " every period"}
        </p>
      </div>

      <Button
        type="button"
        className="mb-5 w-full"
        variant={isCurrent ? "secondary" : pkg.isPopular ? "default" : "outline"}
        disabled={ctaDisabled}
        onClick={() => onBuy?.(pkg)}
      >
        {ctaLabel}
      </Button>

      <ul className="space-y-2.5">
        {pkg.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Check className="h-3 w-3 text-primary" />
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
