import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Zap } from "lucide-react";
import { api } from "../../services/api";
import type { PublicCreditPackage } from "../../lib/creditPackages";
import { PricingCard } from "./PricingCard";

export function LandingPricingSection() {
  const [packages, setPackages] = useState<PublicCreditPackage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPublicPackages()
      .then((res) => setPackages(Array.isArray(res.packages) ? res.packages : []))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="bg-white px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2">
            <Zap className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-600">Pricing</span>
          </div>
          <h2 className="mb-4 text-4xl font-bold text-gray-900 md:text-5xl">Choose your perfect plan</h2>
          <p className="mx-auto max-w-2xl text-xl text-gray-600">
            Start <span className="font-medium text-blue-600">free</span> and upgrade as you grow. All plans
            include our core features.
          </p>
        </div>

        {loading ? (
          <p className="text-center text-gray-500">Loading plans…</p>
        ) : packages.length === 0 ? (
          <p className="text-center text-gray-500">Plans coming soon.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {packages.map((pkg, index) => (
              <PricingCard
                key={pkg.id}
                name={pkg.name}
                price={pkg.priceLabel}
                period={pkg.pricePeriod}
                description={pkg.tagline}
                features={pkg.features}
                popular={pkg.isPopular}
                delay={index * 0.1}
              />
            ))}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-12 text-center"
        >
          <p className="text-gray-600">
            All plans include a{" "}
            <span className="font-medium text-blue-600">14-day money-back guarantee</span>. No questions asked.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
