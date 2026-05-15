import { motion } from "motion/react";
import { Check, Zap } from "lucide-react";
import { GetStartedLink } from "../GetStartedLink";

interface PricingCardProps {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  popular?: boolean;
  delay?: number;
}

export function PricingCard({
  name,
  price,
  period = "/month",
  description,
  features,
  popular = false,
  delay = 0
}: PricingCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5 }}
      whileHover={{ y: -8, scale: 1.02 }}
      className="relative h-full"
    >
      {popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-1 rounded-full text-sm font-medium flex items-center gap-1 shadow-lg">
            <Zap className="w-4 h-4 fill-white" />
            Most Popular
          </div>
        </div>
      )}

      <motion.div
        animate={{
          borderColor: popular ? "#3B82F6" : "#E5E7EB"
        }}
        className={`bg-white rounded-2xl p-8 border-2 h-full flex flex-col ${
          popular ? "shadow-2xl" : "shadow-lg"
        }`}
      >
        <div className="mb-6">
          <h3 className="text-2xl font-bold mb-2">{name}</h3>
          <p className="text-gray-600 text-sm">{description}</p>
        </div>

        <div className="mb-6">
          <div className="flex items-end gap-1">
            <span className="text-5xl font-bold">{price}</span>
            {price !== "Free" && (
              <span className="text-gray-500 mb-2">{period}</span>
            )}
          </div>
        </div>

        <GetStartedLink
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`block w-full py-3 rounded-lg font-semibold mb-8 text-center transition-colors ${
            popular
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-100 text-gray-900 hover:bg-gray-200"
          }`}
        >
          Get Started
        </GetStartedLink>

        <div className="space-y-4 flex-1">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: delay + i * 0.1 }}
              className="flex items-start gap-3"
            >
              <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="w-3 h-3 text-blue-600" />
              </div>
              <span className="text-gray-700 text-sm">{feature}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
