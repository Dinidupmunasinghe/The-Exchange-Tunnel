const jwt = require("jsonwebtoken");
const env = require("../config/env");

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: "Missing admin token" });
  }
  try {
    const payload = jwt.verify(token, env.jwt.secret);
    if (!payload || payload.scope !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    req.admin = { scope: "admin", email: env.adminLoginEmail || "" };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid admin token" });
  }
}

module.exports = adminAuth;
