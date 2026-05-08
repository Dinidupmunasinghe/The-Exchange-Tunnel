const dotenv = require("dotenv");

dotenv.config();

const explicitDialect = String(process.env.DB_DIALECT || "").toLowerCase();
const databaseUrl = process.env.DATABASE_URL || "";
const inferredDialect = explicitDialect
  ? explicitDialect
  : databaseUrl.startsWith("postgres")
    ? "postgres"
    : "mysql";

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
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
    secret: process.env.JWT_SECRET || "dev-secret-change-me",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  },
  adminLoginEmail: String(process.env.ADMIN_LOGIN_EMAIL || process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase(),
  adminLoginPassword: String(process.env.ADMIN_LOGIN_PASSWORD || process.env.ADMIN_PASSWORD || ""),
  adminEmail: String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase(),
  encryptionSecret: process.env.ENCRYPTION_SECRET || "12345678901234567890123456789012",
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
  }
};

module.exports = env;
