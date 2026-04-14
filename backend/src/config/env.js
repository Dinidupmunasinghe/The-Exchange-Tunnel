const dotenv = require("dotenv");

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  dbSyncAlter: process.env.DB_SYNC_ALTER === "true",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || "soundcloud_exchange",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || ""
  },
  jwt: {
    secret: process.env.JWT_SECRET || "dev-secret-change-me",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  },
  encryptionSecret: process.env.ENCRYPTION_SECRET || "12345678901234567890123456789012",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  meta: {
    appId: process.env.META_APP_ID || "",
    appSecret: process.env.META_APP_SECRET || "",
    loginAppId: process.env.META_LOGIN_APP_ID || process.env.META_APP_ID || "",
    loginAppSecret: process.env.META_LOGIN_APP_SECRET || process.env.META_APP_SECRET || "",
    pagesAppId: process.env.META_PAGES_APP_ID || process.env.META_APP_ID || "",
    pagesAppSecret: process.env.META_PAGES_APP_SECRET || process.env.META_APP_SECRET || "",
    graphApiBase: process.env.META_GRAPH_API_BASE || "https://graph.facebook.com/v22.0"
  },
  /** SoundCloud OAuth 2.1 + api.soundcloud.com (PKCE on the client). */
  soundcloud: {
    clientId: process.env.SOUNDCLOUD_CLIENT_ID || "",
    clientSecret: process.env.SOUNDCLOUD_CLIENT_SECRET || "",
    authorizeUrl: process.env.SOUNDCLOUD_AUTHORIZE_URL || "https://secure.soundcloud.com/authorize",
    tokenUrl: process.env.SOUNDCLOUD_TOKEN_URL || "https://secure.soundcloud.com/oauth/token",
    apiBase: process.env.SOUNDCLOUD_API_BASE || "https://api.soundcloud.com"
  },
  limits: {
    dailyEarnLimit: Number(process.env.DAILY_EARN_LIMIT || 500),
    likeReward: Number(process.env.LIKE_REWARD || 5),
    commentReward: Number(process.env.COMMENT_REWARD || 10),
    shareReward: Number(process.env.SHARE_REWARD || 15)
  }
};

module.exports = env;
