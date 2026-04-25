const env = require("../config/env");

function requireAdmin(req, res, next) {
  const configuredAdminEmail = env.adminEmail;
  if (!configuredAdminEmail) {
    return res.status(503).json({ message: "Admin access is not configured" });
  }

  const userEmail = String(req.user?.email || "")
    .trim()
    .toLowerCase();

  if (!userEmail || userEmail !== configuredAdminEmail) {
    return res.status(403).json({ message: "Admin access required" });
  }

  return next();
}

module.exports = requireAdmin;
