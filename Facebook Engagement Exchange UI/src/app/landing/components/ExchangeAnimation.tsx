import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";
import { Laptop, Heart, Coins, User, TrendingUp } from "lucide-react";

export function ExchangeAnimation() {
  const [step, setStep] = useState(0);
  const [user1Credits, setUser1Credits] = useState(50);
  const [user2Likes, setUser2Likes] = useState(142);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((prev) => {
        if (prev === 4) {
          // Reset
          setUser1Credits(50);
          setUser2Likes(142);
          return 0;
        }

        if (prev === 2) {
          // User 1 earns credit
          setUser1Credits(51);
        }
        if (prev === 3) {
          // User 2 gets like
          setUser2Likes(143);
        }

        return prev + 1;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full max-w-4xl mx-auto py-12">
      <div className="grid grid-cols-2 gap-16 items-center">
        {/* User 1 */}
        <motion.div
          animate={{
            scale: step === 1 ? 1.05 : 1
          }}
          className="relative"
        >
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-3xl p-8 border-2 border-blue-200">
            {/* User Avatar */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="font-semibold">Alex</div>
                <motion.div
                  key={user1Credits}
                  initial={{ scale: 1.5, color: "#3B82F6" }}
                  animate={{ scale: 1, color: "#6B7280" }}
                  className="text-sm flex items-center gap-1"
                >
                  <Coins className="w-4 h-4 text-yellow-500" />
                  <span>{user1Credits} credits</span>
                </motion.div>
              </div>
            </div>

            {/* Laptop */}
            <div className="bg-white rounded-lg p-4 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <Laptop className="w-5 h-5 text-gray-600" />
                <div className="text-sm text-gray-500">Browsing posts...</div>
              </div>
              <div className="bg-gray-100 rounded-lg p-3 space-y-2">
                <div className="h-2 bg-gray-300 rounded w-3/4"></div>
                <div className="h-2 bg-gray-300 rounded w-full"></div>
                <div className="h-2 bg-gray-300 rounded w-2/3"></div>
              </div>
            </div>
          </div>

          {/* Credit Earned Animation */}
          <AnimatePresence>
            {step === 2 && (
              <motion.div
                initial={{ scale: 0, y: 0 }}
                animate={{ scale: 1, y: -20 }}
                exit={{ scale: 0, opacity: 0, y: -40 }}
                className="absolute -top-10 right-8 bg-green-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
              >
                <Coins className="w-5 h-5" />
                <span className="font-bold">+1 Credit</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* User 2 */}
        <motion.div
          animate={{
            scale: step === 3 ? 1.05 : 1
          }}
          className="relative"
        >
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-3xl p-8 border-2 border-indigo-200">
            {/* User Avatar */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-indigo-500 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="font-semibold">Sarah</div>
                <motion.div
                  key={user2Likes}
                  initial={{ scale: 1.5, color: "#6366F1" }}
                  animate={{ scale: 1, color: "#6B7280" }}
                  className="text-sm flex items-center gap-1"
                >
                  <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                  <span>{user2Likes} likes</span>
                </motion.div>
              </div>
            </div>

            {/* Laptop */}
            <div className="bg-white rounded-lg p-4 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <Laptop className="w-5 h-5 text-gray-600" />
                <div className="text-sm text-gray-500">My post</div>
              </div>
              <div className="bg-gray-100 rounded-lg p-3 space-y-2">
                <div className="h-2 bg-gray-300 rounded w-full"></div>
                <div className="h-2 bg-gray-300 rounded w-5/6"></div>
                <div className="h-2 bg-gray-300 rounded w-3/4"></div>
              </div>
            </div>
          </div>

          {/* Like Received Animation */}
          <AnimatePresence>
            {step === 3 && (
              <motion.div
                initial={{ scale: 0, y: 0 }}
                animate={{ scale: 1, y: -20 }}
                exit={{ scale: 0, opacity: 0, y: -40 }}
                className="absolute -top-10 left-8 bg-red-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
              >
                <Heart className="w-5 h-5 fill-white" />
                <span className="font-bold">+1 Like</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Exchange Arrow Animation */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <AnimatePresence>
          {step === 1 && (
            <motion.div
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 100, opacity: 0 }}
              className="relative"
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.5, repeat: 3 }}
                className="bg-blue-600 rounded-full p-6 shadow-2xl"
              >
                <Heart className="w-8 h-8 text-white" />
              </motion.div>
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                className="absolute top-1/2 left-full w-32 h-1 bg-blue-600 origin-left"
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-8 border-l-blue-600 border-t-4 border-t-transparent border-b-4 border-b-transparent"></div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Status */}
      <div className="mt-8 text-center">
        <div className="inline-flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg border border-gray-200">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${step >= 1 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
            <span className="text-sm">Like post</span>
          </div>
          <div className="w-px h-4 bg-gray-300"></div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${step >= 2 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
            <span className="text-sm">Earn credit</span>
          </div>
          <div className="w-px h-4 bg-gray-300"></div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${step >= 3 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
            <span className="text-sm">Receive like</span>
          </div>
        </div>
      </div>
    </div>
  );
}
