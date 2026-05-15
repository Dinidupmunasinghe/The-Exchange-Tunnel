import { motion } from "motion/react";
import { useState } from "react";

interface ChartData {
  day: string;
  value: number;
}

interface InteractiveChartProps {
  data: ChartData[];
}

export function InteractiveChart({ data }: InteractiveChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {data.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          onHoverStart={() => setHoveredIndex(i)}
          onHoverEnd={() => setHoveredIndex(null)}
          className="flex items-center gap-3 cursor-pointer"
        >
          <span className="text-sm text-gray-500 w-8">{item.day}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${item.value}%` }}
              transition={{ duration: 1, delay: i * 0.1, type: "spring" }}
              className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full relative"
            >
              {hoveredIndex === i && (
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute -top-8 right-0 bg-gray-900 text-white text-xs px-2 py-1 rounded"
                >
                  {item.value}%
                </motion.div>
              )}
            </motion.div>
          </div>
          <motion.span
            animate={{
              scale: hoveredIndex === i ? 1.1 : 1,
              color: hoveredIndex === i ? "#3B82F6" : "#000"
            }}
            className="text-sm font-medium w-8"
          >
            {item.value}%
          </motion.span>
        </motion.div>
      ))}
    </div>
  );
}
