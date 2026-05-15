import { motion } from "motion/react";
import { LucideIcon } from "lucide-react";
import { AnimatedCounter } from "./AnimatedCounter";

interface StatCardProps {
  label: string;
  value: number;
  suffix?: string;
  trend: string;
  color: string;
  icon: LucideIcon;
  delay?: number;
}

export function StatCard({ label, value, suffix = "", trend, color, icon: Icon, delay = 0 }: StatCardProps) {
  const colorClasses = {
    blue: "from-blue-500 to-blue-600",
    green: "from-green-500 to-green-600",
    purple: "from-purple-500 to-purple-600",
    orange: "from-orange-500 to-orange-600"
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.5 }}
      whileHover={{ scale: 1.05, y: -5 }}
      className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 cursor-pointer"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-500">{label}</div>
        <motion.div
          whileHover={{ rotate: 360 }}
          transition={{ duration: 0.5 }}
          className={`w-10 h-10 bg-gradient-to-br ${colorClasses[color as keyof typeof colorClasses]} rounded-lg flex items-center justify-center`}
        >
          <Icon className="w-5 h-5 text-white" />
        </motion.div>
      </div>
      <div className="text-3xl font-bold mb-2">
        <AnimatedCounter value={value} suffix={suffix} duration={2} />
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.5 }}
        className="text-sm text-green-600 font-medium"
      >
        {trend}
      </motion.div>
    </motion.div>
  );
}
