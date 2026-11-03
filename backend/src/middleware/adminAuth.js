const jwt = require("jsonwebtoken");
const env = require("../config/env");

/** jti -> expiry (ms). Revoked admin tokens until they would have expired anyway. */
const revoked = new Map();
const MAX_REVOKED = 1000;

function sweepRevoked() {
  const now = Date.now();
  for (const [jti, exp] of revoked) {
    if (exp <= now) revoked.delete(jti);
  }
}
setInterval(sweepRevoked, 10 * 60 * 1000).unref();

function revokeAdminToken(admin) {
  if (!admin?.jti) return;
  if (revoked.size >= MAX_REVOKED) sweepRevoked();
  revoked.set(admin.jti, Number(admin.exp || 0) * 1000 || Date.now() + 12 * 60 * 60 * 1000);
}

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: "Missing admin token" });
  }
  if (!env.adminJwtSecret) {
    return res.status(503).json({ message: "Admin access is not configured" });
  }
  try {
    const payload = jwt.verify(token, env.adminJwtSecret);
    if (!payload || payload.scope !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    if (payload.jti && revoked.has(payload.jti)) {
      return res.status(401).json({ message: "Admin session ended. Please sign in again." });
    }
    req.admin = {
      scope: "admin",
      email: env.adminLoginEmail || "",
      jti: payload.jti || null,
      exp: payload.exp || null
    };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid admin token" });
  }
}

module.exports = adminAuth;
module.exports.revokeAdminToken = revokeAdminToken;
