const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { revokeAdminToken } = require("../middleware/adminAuth");

function issueAdminToken() {
  return jwt.sign({ scope: "admin", jti: crypto.randomUUID() }, env.adminJwtSecret, {
    expiresIn: "12h"
  });
}

/** Constant-time string comparison (hash first so lengths always match). */
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

async function adminLogin(req, res) {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");

  if (!env.adminLoginEmail || !env.adminLoginPassword || !env.adminJwtSecret) {
    return res.status(503).json({
      message:
        "Admin login is not configured. Set ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD on backend."
    });
  }
  // Evaluate both comparisons so timing does not reveal which part was wrong.
  const emailOk = safeEqual(email, env.adminLoginEmail);
  const passwordOk = safeEqual(password, env.adminLoginPassword);
  if (!emailOk || !passwordOk) {
    return res.status(401).json({ message: "Invalid admin credentials" });
  }

  const token = issueAdminToken();
  return res.json({
    message: "Admin login successful",
    token,
    admin: { email: env.adminLoginEmail }
  });
}

async function adminMe(req, res) {
  return res.json({ admin: { email: env.adminLoginEmail } });
}

async function adminLogout(req, res) {
  revokeAdminToken(req.admin);
  return res.json({ message: "Admin logged out" });
}

module.exports = { adminLogin, adminMe, adminLogout };
