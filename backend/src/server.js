const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const env = require("./config/env");
const db = require("./models");
const { activateDueCampaigns } = require("./services/campaignScheduler");
const { auditSubscribeEngagements } = require("./services/subscriptionAuditService");
const { auditCommentMembershipEngagements } = require("./services/commentMembershipAuditService");
const { auditLikeEngagements } = require("./services/likeEngagementAuditService");
const { auditCommentDeletions } = require("./services/commentDeletionAuditService");

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  const columns = await queryInterface.describeTable(tableName);
  if (!Object.prototype.hasOwnProperty.call(columns, columnName)) {
    await queryInterface.addColumn(tableName, columnName, definition);
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
    type: db.sequelize.Sequelize.ENUM("like", "comment", "share"),
    allowNull: true
  });
}

async function bootstrap() {
  try {
    await db.sequelize.authenticate();
    await ensureDevSchema();
    await db.sequelize.sync(env.dbSyncAlter ? { alter: true } : undefined);
    await activateDueCampaigns();
    await auditSubscribeEngagements().catch(() => ({ scanned: 0, reversed: 0 }));
    await auditCommentMembershipEngagements().catch(() => ({ scanned: 0, reversed: 0 }));
    await auditLikeEngagements().catch(() => ({ scanned: 0, reversed: 0 }));
    await auditCommentDeletions().catch(() => ({ scanned: 0, reversed: 0 }));
    setInterval(() => {
      activateDueCampaigns().catch(() => undefined);
    }, 60 * 1000);
    setInterval(() => {
      auditSubscribeEngagements().catch(() => undefined);
    }, 30 * 1000);
    setInterval(() => {
      auditCommentMembershipEngagements().catch(() => undefined);
    }, 30 * 1000);
    setInterval(() => {
      auditLikeEngagements().catch(() => undefined);
    }, 30 * 1000);
    setInterval(() => {
      auditCommentDeletions().catch(() => undefined);
    }, 30 * 1000);
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
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

bootstrap();
