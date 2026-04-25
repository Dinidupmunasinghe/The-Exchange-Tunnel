const db = require("../models");

function safeStringify(value) {
  if (value == null) return null;
  try {
    const json = JSON.stringify(value);
    if (json == null) return null;
    return json.length > 4000 ? `${json.slice(0, 4000)}…` : json;
  } catch {
    return null;
  }
}

function extractIp(req) {
  if (!req) return null;
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.connection?.remoteAddress || null;
}

/** Persist an admin write action. Never throws so callers don't fail on audit issues. */
async function logAdminAction({ req, action, targetType = null, targetId = null, payload = null, transaction = null }) {
  try {
    await db.AdminAuditLog.create(
      {
        adminEmail: String(req?.admin?.email || "unknown"),
        action: String(action || "unknown_action").slice(0, 120),
        targetType: targetType ? String(targetType).slice(0, 60) : null,
        targetId: targetId != null ? String(targetId).slice(0, 60) : null,
        payload: safeStringify(payload),
        ip: extractIp(req),
        userAgent: req?.headers?.["user-agent"] ? String(req.headers["user-agent"]).slice(0, 255) : null
      },
      transaction ? { transaction } : undefined
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[adminAuditService] failed to write audit log", err?.message || err);
  }
}

module.exports = { logAdminAction };
