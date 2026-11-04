const http = require("http");
const app = require("./app");
const env = require("./config/env");
const db = require("./models");
const { activateDueCampaigns } = require("./services/campaignScheduler");
const {
  defaultEntitlementsForPackage,
  serializeEntitlements
} = require("./utils/packageEntitlements");

/** describeTable, or null when the table does not exist yet (fresh database). */
async function describeTableOrNull(queryInterface, tableName) {
  try {
    return await queryInterface.describeTable(tableName);
  } catch {
    return null;
  }
}

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  const columns = await describeTableOrNull(queryInterface, tableName);
  // Missing table: sync() will create it with every model column, so nothing to patch.
  if (!columns) return;
  if (!Object.prototype.hasOwnProperty.call(columns, columnName)) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function addIndexIfMissing(queryInterface, tableName, indexName, fields, options = {}) {
  if (!(await describeTableOrNull(queryInterface, tableName))) return;
  const indexes = await queryInterface.showIndex(tableName);
  if (!indexes.some((idx) => idx.name === indexName)) {
    await queryInterface.addIndex(tableName, fields, { name: indexName, ...options });
  }
}

/** Safe additive columns — runs in all environments (including production). */
async function ensureSchemaPatches() {
  const qi = db.sequelize.getQueryInterface();
  await addColumnIfMissing(qi, "users", "telegramActingChannelUsername", {
    type: db.sequelize.Sequelize.STRING(64),
    allowNull: true
  });
  await addColumnIfMissing(qi, "users", "profilePhotoUrl", {
    type: db.sequelize.Sequelize.TEXT,
    allowNull: true
  });
  await addColumnIfMissing(qi, "users", "mtprotoSessionLostAt", {
    type: db.sequelize.Sequelize.DATE,
    allowNull: true
  });
  await addColumnIfMissing(qi, "engagements", "nextAuditAt", {
    type: db.sequelize.Sequelize.DATE,
    allowNull: true
  });
  try {
    await addIndexIfMissing(qi, "tasks", "idx_tasks_feed_cursor", ["status", "assignedUserId", "id"]);
    await addIndexIfMissing(qi, "tasks", "idx_tasks_campaign_id", ["campaignId"]);
    await addIndexIfMissing(qi, "campaigns", "idx_campaigns_feed_visibility", [
      "status",
      "userId",
      "scheduledLaunchAt"
    ]);
    await addIndexIfMissing(qi, "engagements", "idx_engagements_user_campaign_status", [
      "userId",
      "campaignId",
      "verificationStatus"
    ]);
    await addIndexIfMissing(qi, "engagements", "idx_engagements_audit_due", ["verificationStatus", "nextAuditAt"]);
  } catch {
    // Best effort only; the cursor feed still works if a hosted DB blocks DDL.
  }
  await ensureCreditPackageColumns(qi);
  await ensureUserSubscriptionColumns(qi);
  await ensureEnumValues(qi, "campaigns", "status", ["pending", "active", "paused", "completed", "cancelled"]);
}

/**
 * Adds missing values to an existing ENUM column (MySQL inline ENUM or Postgres enum type).
 * Fresh databases get the full list from sync(), so a missing table is skipped.
 */
async function ensureEnumValues(queryInterface, tableName, columnName, values) {
  const columns = await describeTableOrNull(queryInterface, tableName);
  if (!columns || !columns[columnName]) return;
  const dialect = db.sequelize.getDialect();
  try {
    if (dialect === "postgres") {
      const typeName = `enum_${tableName}_${columnName}`;
      for (const v of values) {
        await db.sequelize.query(`ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS '${v}'`);
      }
      return;
    }
    const current = String(columns[columnName].type || "");
    if (values.every((v) => current.includes(`'${v}'`))) return;
    const col = columns[columnName];
    await queryInterface.changeColumn(tableName, columnName, {
      type: db.sequelize.Sequelize.ENUM(...values),
      allowNull: col.allowNull,
      defaultValue: col.defaultValue ?? undefined
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[schema] could not extend ${tableName}.${columnName} enum:`, err.message);
  }
}

/** Data seeding/backfills: run after sync() so every table and column exists. */
async function ensureSeedData() {
  await seedDefaultCreditPackages();
  await backfillPackageEntitlements();
}

async function ensureCreditPackageColumns(queryInterface) {
  await addColumnIfMissing(queryInterface, "credit_packages", "tagline", {
    type: db.sequelize.Sequelize.STRING(255),
    allowNull: true
  });
  await addColumnIfMissing(queryInterface, "credit_packages", "priceLabel", {
    type: db.sequelize.Sequelize.STRING(40),
    allowNull: true
  });
  await addColumnIfMissing(queryInterface, "credit_packages", "pricePeriod", {
    type: db.sequelize.Sequelize.STRING(24),
    allowNull: false,
    defaultValue: "/month"
  });
  await addColumnIfMissing(queryInterface, "credit_packages", "features", {
    type: db.sequelize.Sequelize.TEXT,
    allowNull: true
  });
  await addColumnIfMissing(queryInterface, "credit_packages", "isPopular", {
    type: db.sequelize.Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false
  });
  await addColumnIfMissing(queryInterface, "credit_packages", "sortOrder", {
    type: db.sequelize.Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 0
  });
  await addColumnIfMissing(queryInterface, "credit_packages", "entitlements", {
    type: db.sequelize.Sequelize.TEXT,
    allowNull: true
  });
  await addColumnIfMissing(queryInterface, "credit_packages", "paypalPlanId", {
    type: db.sequelize.Sequelize.STRING(80),
    allowNull: true
  });
  await addColumnIfMissing(queryInterface, "credit_packages", "priceUsd", {
    type: db.sequelize.Sequelize.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  });
  await addColumnIfMissing(queryInterface, "credit_packages", "billingInterval", {
    type: db.sequelize.Sequelize.STRING(16),
    allowNull: false,
    defaultValue: "MONTH"
  });
  await addColumnIfMissing(queryInterface, "credit_packages", "isFree", {
    type: db.sequelize.Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false
  });
}

async function ensureUserSubscriptionColumns(queryInterface) {
  const S = db.sequelize.Sequelize;
  await addColumnIfMissing(queryInterface, "users", "lifetimeCreditsSpent", {
    type: S.INTEGER,
    allowNull: false,
    defaultValue: 0
  });
  const userCols = await describeTableOrNull(queryInterface, "users");
  if (userCols && !userCols.freeGrantGivenAt) {
    await queryInterface.addColumn("users", "freeGrantGivenAt", { type: S.DATE, allowNull: true });
    // Existing accounts already received their free credits under the old rules.
    await db.User.update({ freeGrantGivenAt: new Date() }, { where: {} });
  }
  for (const [name, type] of [
    ["resourceId", S.STRING(120)],
    ["creditsGranted", S.INTEGER],
    ["userId", S.INTEGER],
    ["processingAt", S.DATE]
  ]) {
    await addColumnIfMissing(queryInterface, "payment_events", name, { type, allowNull: true });
  }
  await ensureEnumValues(queryInterface, "user_subscriptions", "status", [
    "active",
    "past_due",
    "cancelled",
    "expired",
    "pending",
    "suspended"
  ]);
  try {
    await addIndexIfMissing(
      queryInterface,
      "user_subscriptions",
      "uniq_user_subscriptions_paypal_id",
      ["paypalSubscriptionId"],
      { unique: true }
    );
    await addIndexIfMissing(queryInterface, "engagements", "idx_engagements_user_campaign_action", [
      "userId",
      "campaignId",
      "actionKind"
    ]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[schema] index patch skipped:", err.message);
  }
  try {
    const pkgCols = await describeTableOrNull(queryInterface, "credit_packages");
    if (pkgCols?.priceLkr && pkgCols.priceLkr.allowNull === false) {
      await queryInterface.changeColumn("credit_packages", "priceLkr", {
        type: S.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[schema] priceLkr patch skipped:", err.message);
  }
}

/**
 * One-time migration for packages created before entitlements/priceUsd existed
 * (rows with entitlements IS NULL). Price comes from the display label first; isFree is only
 * inferred for these legacy rows and never overrides what an admin set later.
 */
async function backfillPackageEntitlements() {
  const { priceUsdFromLabel } = require("./utils/packageEntitlements");
  const rows = await db.CreditPackage.findAll({ where: { entitlements: null } });
  for (const row of rows) {
    const label = String(row.priceLabel || "").trim();
    const priceUsd = Number(row.priceUsd) > 0 ? Number(row.priceUsd) : priceUsdFromLabel(label, 0);
    const isFree = Boolean(row.isFree) || label.toLowerCase() === "free" || priceUsd <= 0;
    await row.update({
      priceUsd: isFree ? 0 : priceUsd,
      isFree,
      entitlements: serializeEntitlements(defaultEntitlementsForPackage({ credits: row.credits, isFree }))
    });
  }
}

async function seedDefaultCreditPackages() {
  const count = await db.CreditPackage.count();
  if (count > 0) return;
  const defaults = [
    {
      name: "Free",
      tagline: "Perfect for getting started",
      priceLabel: "Free",
      pricePeriod: "/month",
      credits: 50,
      priceLkr: 0,
      features: JSON.stringify([
        "50 exchanges per month",
        "Basic analytics",
        "Community support",
        "Standard exchange speed",
        "Mobile app access"
      ]),
      isPopular: false,
      sortOrder: 0,
      isActive: true,
      isFree: true,
      priceUsd: 0,
      entitlements: serializeEntitlements(defaultEntitlementsForPackage({ credits: 50, isFree: true }))
    },
    {
      name: "Starter",
      tagline: "For growing your presence",
      priceLabel: "$9",
      pricePeriod: "/month",
      credits: 500,
      priceLkr: 9,
      features: JSON.stringify([
        "500 exchanges per month",
        "Advanced analytics",
        "Priority support",
        "Faster exchange speed",
        "Custom targeting",
        "Remove watermark"
      ]),
      isPopular: false,
      sortOrder: 1,
      isActive: true,
      isFree: false,
      priceUsd: 9,
      entitlements: serializeEntitlements(defaultEntitlementsForPackage({ credits: 500, isFree: false }))
    },
    {
      name: "Pro",
      tagline: "For serious growth",
      priceLabel: "$29",
      pricePeriod: "/month",
      credits: 2000,
      priceLkr: 29,
      features: JSON.stringify([
        "2,000 exchanges per month",
        "Real-time analytics",
        "24/7 priority support",
        "Instant exchange speed",
        "Advanced targeting",
        "API access",
        "Team collaboration",
        "Custom branding"
      ]),
      isPopular: true,
      sortOrder: 2,
      isActive: true,
      isFree: false,
      priceUsd: 29,
      entitlements: serializeEntitlements(
        defaultEntitlementsForPackage({ credits: 2000, isFree: false })
      )
    },
    {
      name: "Enterprise",
      tagline: "For maximum reach",
      priceLabel: "$99",
      pricePeriod: "/month",
      credits: 10000,
      priceLkr: 99,
      features: JSON.stringify([
        "Unlimited exchanges",
        "Custom analytics dashboard",
        "Dedicated account manager",
        "Lightning-fast speed",
        "AI-powered targeting",
        "Full API access",
        "Unlimited team members",
        "White-label solution",
        "Custom integrations"
      ]),
      isPopular: false,
      sortOrder: 3,
      isActive: true,
      isFree: false,
      priceUsd: 99,
      entitlements: serializeEntitlements(
        defaultEntitlementsForPackage({ credits: 10000, isFree: false })
      )
    }
  ];
  await db.CreditPackage.bulkCreate(defaults);
}

async function ensureDevSchema() {
  if (env.nodeEnv === "production") return;

  const qi = db.sequelize.getQueryInterface();

  await addColumnIfMissing(qi, "users", "facebookPageId", {
    type: db.sequelize.Sequelize.STRING(80),
    allowNull: true
  });
  await addColumnIfMissing(qi, "users", "facebookPageName", {
    type: db.sequelize.Sequelize.STRING(160),
    allowNull: true
  });
  await addColumnIfMissing(qi, "users", "facebookPageAccessTokenEncrypted", {
    type: db.sequelize.Sequelize.TEXT,
    allowNull: true
  });
  await addColumnIfMissing(qi, "engagements", "actionKind", {
    type: db.sequelize.Sequelize.STRING(16),
    allowNull: true
  });
}

async function ensureActionKindColumnCompatibility() {
  const qi = db.sequelize.getQueryInterface();
  const dialect = db.sequelize.getDialect();
  const tables = [
    { tableName: "engagements", columnName: "actionKind", allowNull: true },
    { tableName: "user_post_actions", columnName: "actionKind", allowNull: false }
  ];
  for (const t of tables) {
    try {
      const columns = await qi.describeTable(t.tableName);
      const col = columns?.[t.columnName];
      if (!col) continue;
      const typeText = String(col.type || "").toLowerCase();
      if (
        typeText.includes("varchar") ||
        typeText.includes("character varying") ||
        (dialect === "postgres" && typeText.includes("text"))
      ) {
        continue;
      }
      await qi.changeColumn(t.tableName, t.columnName, {
        type: db.sequelize.Sequelize.STRING(16),
        allowNull: t.allowNull
      });
    } catch {
      // best effort: startup should continue even when DB denies schema changes.
    }
  }
}

function assertSecureConfig() {
  const problems = env.validateSecrets();
  if (!problems.length) return;
  if (env.isProduction) {
    // eslint-disable-next-line no-console
    console.error(`Refusing to start: insecure configuration:\n - ${problems.join("\n - ")}`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.warn(`[security] dev-only configuration warnings:\n - ${problems.join("\n - ")}`);
}

async function bootstrap() {
  assertSecureConfig();
  try {
    await db.sequelize.authenticate();
    await ensureSchemaPatches();
    await ensureDevSchema();
    await ensureActionKindColumnCompatibility();
    await db.sequelize.sync(env.dbSyncAlter ? { alter: true } : undefined);
    await ensureSeedData();
    const server = http.createServer(app);

    if (!env.isProduction && process.env.SOCKET_IO_ENABLED === "true") {
      const { Server } = require("socket.io");
      const io = new Server(server, {
        cors: { origin: env.corsOrigin, methods: ["GET", "POST"] }
      });
      io.on("connection", (socket) => {
        socket.emit("welcome", { message: "Connected to engagement exchange socket." });
      });
    }

    server.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`Backend running on http://localhost:${env.port}`);
    });

    setInterval(() => {
      activateDueCampaigns().catch(() => undefined);
    }, 60 * 1000);
    activateDueCampaigns().catch(() => undefined);

    const { expireEndedSubscriptions } = require("./services/subscriptionService");
    setInterval(() => {
      expireEndedSubscriptions().catch(() => undefined);
    }, 60 * 60 * 1000);
    expireEndedSubscriptions().catch(() => undefined);

    // Re-checks completed actions and takes credits back when a worker undoes them on Telegram.
    require("./services/engagementAuditService").startEngagementAudits();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

bootstrap();
