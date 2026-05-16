const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const env = require("./config/env");
const db = require("./models");
const { activateDueCampaigns } = require("./services/campaignScheduler");
const { auditSubscribeEngagements, auditSubscriptionMemory } = require("./services/subscriptionAuditService");
const { auditCommentMembershipEngagements } = require("./services/commentMembershipAuditService");
const { auditLikeEngagements } = require("./services/likeEngagementAuditService");
const { auditCommentDeletions } = require("./services/commentDeletionAuditService");
const { auditShareDeletions } = require("./services/shareDeletionAuditService");

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  const columns = await queryInterface.describeTable(tableName);
  if (!Object.prototype.hasOwnProperty.call(columns, columnName)) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

/** Safe additive columns — runs in all environments (including production). */
async function ensureSchemaPatches() {
  const qi = db.sequelize.getQueryInterface();
  await addColumnIfMissing(qi, "users", "profilePhotoUrl", {
    type: db.sequelize.Sequelize.TEXT,
    allowNull: true
  });
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
// On constrained hosts the per-audit Python (Telethon) spawns can OOM the
// service. Default OFF in production; users can opt in by setting
// AUDITS_ENABLED=true. Audits are not required for normal operation — the
// pre-existing detection probes run on demand when users open /earn.
const AUDITS_ENABLED =
  String(process.env.AUDITS_ENABLED || (env.nodeEnv === "production" ? "false" : "true"))
    .toLowerCase() === "true";

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
    const io = new Server(server, {
      cors: { origin: env.corsOrigin, methods: ["GET", "POST"] }
    });

    io.on("connection", (socket) => {
      socket.emit("welcome", { message: "Connected to engagement exchange socket." });
    });

    server.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`Backend running on http://localhost:${env.port}`);
    });

    setInterval(() => {
      activateDueCampaigns().catch(() => undefined);
    }, 60 * 1000);
    activateDueCampaigns().catch(() => undefined);

    if (!AUDITS_ENABLED) return;
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
