import { motion } from "motion/react";
import { ArrowRight, Send, Users, TrendingUp, Shield, MessageCircle, BarChart3, Zap, CheckCircle2, Heart, Share2, Eye, Sparkles } from "lucide-react";
import { StatCard } from "./components/StatCard";
import { InteractiveChart } from "./components/InteractiveChart";
import { ActivityFeed } from "./components/ActivityFeed";
import { FloatingCard } from "./components/FloatingCard";
import { ExchangeAnimation } from "./components/ExchangeAnimation";
import { PricingCard } from "./components/PricingCard";
import { GetStartedLink } from "./GetStartedLink";
import { useState } from "react";

export function LandingApp() {
  const [activeTab, setActiveTab] = useState(0);

  const chartData = [
    { day: "Mon", value: 85 },
    { day: "Tue", value: 92 },
    { day: "Wed", value: 78 },
    { day: "Thu", value: 95 },
    { day: "Fri", value: 88 }
  ];

  const activities = [
    { user: "Alex M.", action: "Liked your post", time: "2m ago", avatar: "bg-blue-400" },
    { user: "Sarah K.", action: "Shared content", time: "5m ago", avatar: "bg-purple-400" },
    { user: "Mike R.", action: "New follower", time: "8m ago", avatar: "bg-green-400" },
    { user: "Emma L.", action: "Commented", time: "12m ago", avatar: "bg-orange-400" }
  ];

  return (
    <motion.div className="min-h-screen overflow-x-hidden bg-white text-gray-900 antialiased">
      {/* Navigation */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 100 }}
        className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="flex items-center gap-2 cursor-pointer"
          >
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"
            >
              <Send className="w-5 h-5 text-white" />
            </motion.div>
            <span className="text-xl font-semibold text-gray-900">Exchange Tunnel</span>
          </motion.div>
          <motion.div className="flex items-center gap-4 sm:gap-8">
            <motion.a
              whileHover={{ scale: 1.05, color: "#000" }}
              href="#features"
              className="text-gray-600"
            >
              Features
            </motion.a>
            <motion.a
              whileHover={{ scale: 1.05, color: "#000" }}
              href="#how"
              className="text-gray-600"
            >
              How it works
            </motion.a>
            <GetStartedLink
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg shadow-lg hover:shadow-xl transition-shadow"
            >
              Get Started
            </GetStartedLink>
          </motion.div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="pt-20 pb-16 px-6 relative">
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 180, 360]
            }}
            transition={{ duration: 20, repeat: Infinity }}
            className="absolute -top-1/2 -right-1/2 w-96 h-96 bg-blue-100 rounded-full opacity-20 blur-3xl"
          />
          <motion.div
            animate={{
              scale: [1.2, 1, 1.2],
              rotate: [360, 180, 0]
            }}
            transition={{ duration: 15, repeat: Infinity }}
            className="absolute -bottom-1/2 -left-1/2 w-96 h-96 bg-blue-50 rounded-full opacity-20 blur-3xl"
          />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full mb-6 cursor-pointer"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <Zap className="w-4 h-4 text-blue-600" />
                </motion.div>
                <span className="text-sm text-blue-600 font-medium">Telegram growth platform</span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-5xl md:text-6xl font-bold mb-6 leading-tight text-gray-900"
              >
                Boost your Telegram<br />engagement effortlessly
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-xl text-gray-600 max-w-2xl mx-auto mb-8"
              >
                Connect with <span className="text-blue-600 font-medium">thousands of users</span>, exchange engagement, and grow your community with our <span className="text-blue-500 font-medium">powerful platform</span> designed for <span className="text-blue-700 font-medium">real results</span>.
              </motion.p>
              <GetStartedLink
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(59, 130, 246, 0.3)" }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 bg-blue-600 text-white rounded-lg inline-flex items-center gap-2 shadow-lg hover:bg-blue-700 transition-colors"
              >
                Start growing now
                <motion.div
                  animate={{ x: [0, 5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <ArrowRight className="w-5 h-5" />
                </motion.div>
              </GetStartedLink>
            </motion.div>
          </div>

          {/* Dashboard Mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="relative"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="flex gap-1.5">
                  <motion.div
                    whileHover={{ scale: 1.5 }}
                    className="w-3 h-3 rounded-full bg-red-400 cursor-pointer"
                  />
                  <motion.div
                    whileHover={{ scale: 1.5 }}
                    className="w-3 h-3 rounded-full bg-yellow-400 cursor-pointer"
                  />
                  <motion.div
                    whileHover={{ scale: 1.5 }}
                    className="w-3 h-3 rounded-full bg-green-400 cursor-pointer"
                  />
                </div>
                <div className="flex-1 text-center text-sm text-gray-500">Dashboard</div>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-6">
                <StatCard
                  icon={Send}
                  label="Total Exchanges"
                  value={2847}
                  trend="+24.5%"
                  color="blue"
                  delay={0.6}
                />
                <StatCard
                  icon={Users}
                  label="Active Users"
                  value={1218}
                  trend="+18.2%"
                  color="green"
                  delay={0.7}
                />
                <StatCard
                  icon={Heart}
                  label="Engagement"
                  value={94}
                  suffix="%"
                  trend="+5.1%"
                  color="purple"
                  delay={0.8}
                />
                <StatCard
                  icon={TrendingUp}
                  label="Growth Rate"
                  value={156}
                  suffix="%"
                  trend="+32.8%"
                  color="orange"
                  delay={0.9}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1 }}
                  className="bg-white border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      <span className="font-medium text-gray-900">Engagement Analytics</span>
                    </div>
                  </div>
                  <InteractiveChart data={chartData} />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.1 }}
                  className="bg-white border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4" />
                      <span className="font-medium text-gray-900">Recent Activity</span>
                    </div>
                  </div>
                  <ActivityFeed activities={activities} />
                </motion.div>
              </div>
            </motion.div>

            {/* Floating Elements */}
            <motion.div
              animate={{
                y: [0, -20, 0],
                rotate: [0, 5, 0]
              }}
              transition={{ duration: 4, repeat: Infinity }}
              className="absolute -top-8 -right-8 bg-blue-600 rounded-2xl p-4 shadow-xl"
            >
              <Eye className="w-6 h-6 text-white" />
              <div className="text-white text-sm font-bold mt-2">Live</div>
            </motion.div>

            <motion.div
              animate={{
                y: [0, 20, 0],
                rotate: [0, -5, 0]
              }}
              transition={{ duration: 5, repeat: Infinity }}
              className="absolute -bottom-8 -left-8 bg-blue-500 rounded-2xl p-4 shadow-xl"
            >
              <Share2 className="w-6 h-6 text-white" />
              <div className="text-white text-sm font-bold mt-2">+156</div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-12 px-6 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto text-center">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-sm text-gray-500 mb-6"
          >
            Trusted by the <span className="text-blue-600 font-medium">world leaders</span>
          </motion.p>
          <div className="flex items-center justify-center gap-12 flex-wrap">
            {["TechCorp", "CloudCo", "DataFlow", "SocialHub"].map((brand, i) => (
              <motion.div
                key={brand}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 0.4, y: 0 }}
                whileHover={{ opacity: 1, scale: 1.1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-2xl font-bold text-gray-400 cursor-pointer"
              >
                {brand}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 rounded-full mb-4">
              <Zap className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">Features</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
              Features designed to<br />empower your workflow
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Stay ahead with <span className="text-blue-600 font-medium">tools</span> that prioritize your <span className="text-blue-500 font-medium">needs</span>, integrating <span className="text-blue-700 font-medium">insights</span> and efficiency into one powerful platform.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: TrendingUp,
                title: "Real-time analytics",
                description: "Track your engagement growth with detailed analytics and insights to optimize your strategy.",
                gradient: "from-blue-500 to-blue-600"
              },
              {
                icon: Users,
                title: "Collaborate together",
                description: "Connect with your team, share updates instantly, and achieve your goals faster.",
                gradient: "from-blue-400 to-blue-500"
              },
              {
                icon: Shield,
                title: "Safe & secure",
                description: "Your data is protected with enterprise-grade security and encrypted exchanges.",
                gradient: "from-blue-600 to-blue-700"
              },
              {
                icon: Zap,
                title: "Lightning fast",
                description: "Experience instant exchanges and real-time updates with our optimized platform.",
                gradient: "from-blue-500 to-cyan-500"
              },
              {
                icon: BarChart3,
                title: "Smart insights",
                description: "Get actionable recommendations based on your engagement patterns and growth metrics.",
                gradient: "from-indigo-500 to-blue-600"
              },
              {
                icon: MessageCircle,
                title: "Easy communication",
                description: "Seamlessly connect with other users and manage all your exchanges in one place.",
                gradient: "from-blue-400 to-indigo-500"
              }
            ].map((feature, i) => (
              <FloatingCard key={i} delay={i * 0.1} className="group">
                <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-2xl transition-all duration-300 h-full">
                  <motion.div
                    whileHover={{ rotate: 360, scale: 1.1 }}
                    transition={{ duration: 0.5 }}
                    className={`w-12 h-12 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center mb-4`}
                  >
                    <feature.icon className="w-6 h-6 text-white" />
                  </motion.div>
                  <h3 className="mb-2 text-lg font-semibold text-gray-900 transition-colors group-hover:text-blue-600">{feature.title}</h3>
                  <p className="text-gray-600 text-sm">{feature.description}</p>
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: "100%" }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 + 0.3, duration: 0.5 }}
                    className={`h-1 bg-gradient-to-r ${feature.gradient} rounded-full mt-4`}
                  />
                </div>
              </FloatingCard>
            ))}
          </div>
        </div>
      </section>

      {/* How Exchange Works - Animation */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full mb-4">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-600 font-medium">See it in action</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
              How the exchange works
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Simple <span className="text-blue-600 font-medium">give and take</span>. Engage with others, earn credits, and grow your presence.
            </p>
          </div>

          <ExchangeAnimation />
        </div>
      </section>

      {/* How It Works */}
      <section id="how" className="py-20 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 rounded-full mb-4">
              <CheckCircle2 className="w-4 h-4 text-purple-600" />
              <span className="text-sm text-purple-600 font-medium">How it works</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
              Get started in minutes
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Simple <span className="text-blue-600 font-medium">setup</span>, powerful <span className="text-blue-700 font-medium">results</span>. Start growing your Telegram presence today.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {[
              {
                step: "01",
                title: "Create account",
                description: "Sign up with your Telegram account in seconds. No credit card required to get started.",
                icon: Users,
                color: "blue"
              },
              {
                step: "02",
                title: "Choose exchange type",
                description: "Select what you want to exchange - likes, shares, comments, or followers. Set your preferences.",
                icon: CheckCircle2,
                color: "blue"
              },
              {
                step: "03",
                title: "Watch growth happen",
                description: "Start receiving real engagement from our network of active users. Track everything in real-time.",
                icon: TrendingUp,
                color: "blue"
              }
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                onViewportEnter={() => setActiveTab(i)}
                className="relative"
              >
                <FloatingCard delay={i * 0.1}>
                  <motion.div
                    animate={{
                      borderColor: activeTab === i ? "#3B82F6" : "#E5E7EB"
                    }}
                    className="bg-white rounded-xl p-8 border-2 transition-all"
                  >
                    <motion.div
                      animate={{
                        scale: activeTab === i ? 1.2 : 1,
                        rotate: activeTab === i ? 360 : 0
                      }}
                      transition={{ duration: 0.5 }}
                      className="text-5xl font-bold text-blue-600/10 mb-4"
                    >
                      {item.step}
                    </motion.div>
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 360 }}
                      transition={{ duration: 0.5 }}
                      className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600"
                    >
                      <item.icon className="w-6 h-6 text-white" />
                    </motion.div>
                    <h3 className="mb-3 text-xl font-semibold text-gray-900">{item.title}</h3>
                    <p className="text-gray-600">{item.description}</p>
                  </motion.div>
                </FloatingCard>
                {i < 2 && (
                  <motion.div
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15 + 0.5, duration: 0.5 }}
                    className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-blue-500 origin-left"
                  >
                    <motion.div
                      animate={{ x: [0, 8, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-600 rounded-full"
                    />
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full mb-4">
              <Zap className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-600 font-medium">Pricing</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
              Choose your perfect plan
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Start <span className="text-blue-600 font-medium">free</span> and upgrade as you grow. All plans include our core features.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <PricingCard
              name="Free"
              price="Free"
              description="Perfect for getting started"
              features={[
                "50 exchanges per month",
                "Basic analytics",
                "Community support",
                "Standard exchange speed",
                "Mobile app access"
              ]}
              delay={0}
            />

            <PricingCard
              name="Starter"
              price="$9"
              description="For growing your presence"
              features={[
                "500 exchanges per month",
                "Advanced analytics",
                "Priority support",
                "Faster exchange speed",
                "Custom targeting",
                "Remove watermark"
              ]}
              delay={0.1}
            />

            <PricingCard
              name="Pro"
              price="$29"
              description="For serious growth"
              popular={true}
              features={[
                "2,000 exchanges per month",
                "Real-time analytics",
                "24/7 priority support",
                "Instant exchange speed",
                "Advanced targeting",
                "API access",
                "Team collaboration",
                "Custom branding"
              ]}
              delay={0.2}
            />

            <PricingCard
              name="Enterprise"
              price="$99"
              description="For maximum reach"
              features={[
                "Unlimited exchanges",
                "Custom analytics dashboard",
                "Dedicated account manager",
                "Lightning-fast speed",
                "AI-powered targeting",
                "Full API access",
                "Unlimited team members",
                "White-label solution",
                "Custom integrations"
              ]}
              delay={0.3}
            />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="text-center mt-12"
          >
            <p className="text-gray-600">
              All plans include a <span className="text-blue-600 font-medium">14-day money-back guarantee</span>. No questions asked.
            </p>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative overflow-x-hidden px-6 py-20">
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 5, repeat: Infinity }}
          className="absolute inset-0 bg-blue-600"
        />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white/10 backdrop-blur-md rounded-3xl p-12 border border-white/20"
          >
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-4xl md:text-5xl font-bold mb-6 text-white"
            >
              Ready to grow your<br />Telegram presence?
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="text-xl text-white/90 mb-8"
            >
              Join <span className="font-bold">50,000+ users</span> who are already growing with Exchange Tunnel
            </motion.p>
            <GetStartedLink
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              whileHover={{ scale: 1.05, boxShadow: "0 20px 60px rgba(255, 255, 255, 0.3)" }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 bg-white text-blue-600 rounded-lg font-semibold inline-flex items-center gap-2 shadow-2xl"
            >
              Get started free
              <motion.div
                animate={{ x: [0, 5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <ArrowRight className="w-5 h-5" />
              </motion.div>
            </GetStartedLink>
          </motion.div>
        </div>

        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            animate={{
              y: [0, -30, 0],
              x: [0, Math.random() * 20 - 10, 0],
              opacity: [0, 1, 0]
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: i * 0.5
            }}
            className="absolute w-2 h-2 bg-white rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              bottom: 0
            }}
          />
        ))}
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-12 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
                className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"
              >
                <Send className="w-5 h-5 text-white" />
              </motion.div>
              <span className="text-xl font-semibold text-gray-900">Exchange Tunnel</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-sm text-gray-500"
            >
              © 2026 Exchange Tunnel. All rights reserved.
            </motion.div>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}