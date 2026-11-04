const dotenv = require("dotenv");

dotenv.config();

const explicitDialect = String(process.env.DB_DIALECT || "").toLowerCase();
const databaseUrl = process.env.DATABASE_URL || "";
const inferredDialect = explicitDialect
  ? explicitDialect
  : databaseUrl.startsWith("postgres")
    ? "postgres"
    : "mysql";

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

const DEV_JWT_SECRET = "dev-secret-change-me";
const DEV_ENCRYPTION_SECRET = "12345678901234567890123456789012";
const WEAK_SECRETS = new Set([
  DEV_JWT_SECRET,
  DEV_ENCRYPTION_SECRET,
  "replace_with_long_secure_secret",
  "replace_with_32_char_secret_key____"
]);

const env = {
  nodeEnv,
  isProduction,
  /** Render free tier etc. — avoid spawning Python/Telethon on background probes. */
  lowMemoryHost:
    process.env.LOW_MEMORY_HOST === "true" ||
    (isProduction && process.env.LOW_MEMORY_HOST !== "false"),
  /** Like/comment pre-existing checks via MTProto (heavy). Off by default on low-memory hosts. */
  telegramDeepSync: process.env.TELEGRAM_DEEP_SYNC === "true",
  /**
   * Re-checks completed actions on Telegram and takes credits back when a worker undoes them
   * (unsubscribe, unlike, deleted comment/repost). On by default everywhere: the cheap Bot API
   * checks need no extra memory and MTProto checks are batched per worker and rate-limited.
   * (The old AUDITS_ENABLED flag is no longer used.)
   */
  engagementAudit: {
    enabled: String(process.env.ENGAGEMENT_AUDITS || "true").toLowerCase() !== "false",
    /** How long an action must be kept; after this it is final and no longer checked. */
    guaranteeDays: Math.max(1, Number(process.env.AUDIT_GUARANTEE_DAYS || 30)),
    /** Time to re-verify the phone before actions that need it can't be checked any more. */
    sessionGraceHours: Math.max(1, Number(process.env.AUDIT_SESSION_GRACE_HOURS || 24)),
    tickMs: Math.max(15_000, Number(process.env.AUDIT_TICK_MS || 60_000)),
    /** Python/Telethon processes the audit may start per tick (one per worker checked). */
    maxBridgeCallsPerTick: Math.max(
      0,
      Number(
        process.env.AUDIT_MAX_BRIDGE_CALLS_PER_TICK ||
          (process.env.LOW_MEMORY_HOST === "true" || isProduction ? 2 : 4)
      )
    )
  },
  port: Number(process.env.PORT || 5000),
  dbSyncAlter: process.env.DB_SYNC_ALTER === "true",
  db: {
    /** "postgres" or "mysql"; inferred from DATABASE_URL when not set. */
    dialect: inferredDialect,
    /** Full connection URL (preferred on Render/Railway/Heroku). */
    url: databaseUrl,
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || (inferredDialect === "postgres" ? 5432 : 3306)),
    name: process.env.DB_NAME || "exchange_tunnel",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    /** Cloud Postgres/MySQL proxies often require TLS. Auto-on for Postgres URLs. */
    ssl: process.env.DB_SSL === "true" || (Boolean(databaseUrl) && inferredDialect === "postgres")
  },
  jwt: {
    secret: process.env.JWT_SECRET || (isProduction ? "" : DEV_JWT_SECRET),
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  },
  /** Separate signing key for admin tokens, so user and admin tokens are never interchangeable.
   *  Set ADMIN_JWT_SECRET to fully decouple it; otherwise it is derived from JWT_SECRET. */
  adminJwtSecret:
    process.env.ADMIN_JWT_SECRET ||
    (process.env.JWT_SECRET || !isProduction
      ? require("crypto")
          .createHmac("sha256", process.env.JWT_SECRET || DEV_JWT_SECRET)
          .update("exchange-tunnel:admin-token-key")
          .digest("hex")
      : ""),
  /** Reverse-proxy hops to trust for client IPs (Render = 1). Used by rate limiters. */
  trustProxy: Number(process.env.TRUST_PROXY ?? (isProduction ? 1 : 0)),
  adminLoginEmail: String(process.env.ADMIN_LOGIN_EMAIL || process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase(),
  adminLoginPassword: String(process.env.ADMIN_LOGIN_PASSWORD || process.env.ADMIN_PASSWORD || ""),
  adminEmail: String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase(),
  encryptionSecret: process.env.ENCRYPTION_SECRET || (isProduction ? "" : DEV_ENCRYPTION_SECRET),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  /** Telegram: bot token = Login Widget HMAC key + getChat / getChatMember. */
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    botName: process.env.TELEGRAM_BOT_NAME || "",
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
    mtproto: {
      pythonBinary: process.env.TELEGRAM_MTPROTO_PYTHON || "python",
      apiId: process.env.TELEGRAM_MTPROTO_API_ID || "",
      apiHash: process.env.TELEGRAM_MTPROTO_API_HASH || ""
    }
  },
  limits: {
    dailyEarnLimit: Number(process.env.DAILY_EARN_LIMIT || 500),
    likeReward: Number(process.env.LIKE_REWARD || 5),
    commentReward: Number(process.env.COMMENT_REWARD || 10),
    shareReward: Number(process.env.SHARE_REWARD || 15)
  },
  frontendUrl: (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")[0]
    .trim(),
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
    mode: process.env.PAYPAL_MODE === "live" ? "live" : "sandbox",
    webhookId: process.env.PAYPAL_WEBHOOK_ID || ""
  }
};

/**
 * Returns fatal configuration problems. In production the server refuses to start when any
 * are present; in development they are printed as warnings.
 */
function validateSecrets() {
  const problems = [];
  const check = (name, value, minLen) => {
    const v = String(value || "");
    if (!v) problems.push(`${name} is not set`);
    else if (WEAK_SECRETS.has(v)) problems.push(`${name} is a default/example value`);
    else if (v.length < minLen) problems.push(`${name} must be at least ${minLen} characters`);
  };
  check("JWT_SECRET", env.jwt.secret, 32);
  check("ENCRYPTION_SECRET", env.encryptionSecret, 32);
  if (process.env.ADMIN_JWT_SECRET) check("ADMIN_JWT_SECRET", env.adminJwtSecret, 32);
  if (env.adminJwtSecret && env.adminJwtSecret === env.jwt.secret) {
    problems.push("ADMIN_JWT_SECRET must differ from JWT_SECRET");
  }
  return problems;
}

env.validateSecrets = validateSecrets;

module.exports = env;
