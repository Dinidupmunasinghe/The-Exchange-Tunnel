import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";

interface Activity {
  user: string;
  action: string;
  time: string;
  avatar: string;
}

interface ActivityFeedProps {
  activities: Activity[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const [items, setItems] = useState(activities);

  useEffect(() => {
    const interval = setInterval(() => {
      setItems((prev) => {
        const newItems = [...prev];
        const last = newItems.pop();
        if (last) {
          newItems.unshift(last);
        }
        return newItems;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {items.map((activity, i) => (
          <motion.div
            key={`${activity.user}-${i}`}
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="flex items-center gap-3"
          >
            <div
              className={`w-8 h-8 ${activity.avatar} rounded-full flex items-center justify-center text-white text-sm font-medium`}
            >
              {activity.user[0]}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">{activity.user}</div>
              <div className="text-xs text-gray-500">{activity.action}</div>
            </div>
            <div className="text-xs text-gray-400">{activity.time}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
