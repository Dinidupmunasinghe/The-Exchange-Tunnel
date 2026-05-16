const http = require("http");
const app = require("./app");
const env = require("./config/env");
const db = require("./models");
const { activateDueCampaigns } = require("./services/campaignScheduler");

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  const columns = await queryInterface.describeTable(tableName);
  if (!Object.prototype.hasOwnProperty.call(columns, columnName)) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function addIndexIfMissing(queryInterface, tableName, indexName, fields) {
  const indexes = await queryInterface.showIndex(tableName);
  if (!indexes.some((idx) => idx.name === indexName)) {
    await queryInterface.addIndex(tableName, fields, { name: indexName });
  }
}

/** Safe additive columns — runs in all environments (including production). */
async function ensureSchemaPatches() {
  const qi = db.sequelize.getQueryInterface();
  await addColumnIfMissing(qi, "users", "profilePhotoUrl", {
    type: db.sequelize.Sequelize.TEXT,
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
  } catch {
    // Best effort only; the cursor feed still works if a hosted DB blocks DDL.
  }
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

const AUDIT_INTERVAL_MS = Number(process.env.AUDIT_INTERVAL_MS || 10 * 60 * 1000);

function staggerInterval(fn, intervalMs, offsetMs) {
  setTimeout(() => {
    fn().catch(() => undefined);
    setInterval(() => {
      fn().catch(() => undefined);
    }, intervalMs);
  }, offsetMs);
}

async function bootstrap() {
  try {
    await db.sequelize.authenticate();
    await ensureSchemaPatches();
    await ensureDevSchema();
    await ensureActionKindColumnCompatibility();
    await db.sequelize.sync(env.dbSyncAlter ? { alter: true } : undefined);
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

    if (!env.auditsEnabled) return;
    const { auditSubscribeEngagements, auditSubscriptionMemory } = require("./services/subscriptionAuditService");
    const { auditCommentMembershipEngagements } = require("./services/commentMembershipAuditService");
    const { auditLikeEngagements } = require("./services/likeEngagementAuditService");
    const { auditCommentDeletions } = require("./services/commentDeletionAuditService");
    const { auditShareDeletions } = require("./services/shareDeletionAuditService");
    staggerInterval(auditSubscribeEngagements, AUDIT_INTERVAL_MS, 30_000);
    staggerInterval(auditSubscriptionMemory, AUDIT_INTERVAL_MS, 60_000);
    staggerInterval(auditCommentMembershipEngagements, AUDIT_INTERVAL_MS, 90_000);
    staggerInterval(auditLikeEngagements, AUDIT_INTERVAL_MS, 120_000);
    staggerInterval(auditCommentDeletions, AUDIT_INTERVAL_MS, 150_000);
    staggerInterval(auditShareDeletions, AUDIT_INTERVAL_MS, 180_000);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

bootstrap();
