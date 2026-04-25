const jwt = require("jsonwebtoken");
const env = require("../config/env");

function issueAdminToken() {
  return jwt.sign({ scope: "admin" }, env.jwt.secret, { expiresIn: "12h" });
}

async function adminLogin(req, res) {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");

  if (!env.adminLoginEmail || !env.adminLoginPassword) {
    return res.status(503).json({ message: "Admin login is not configured" });
  }
  if (email !== env.adminLoginEmail || password !== env.adminLoginPassword) {
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
  return res.json({ message: "Admin logged out" });
}

module.exports = { adminLogin, adminMe, adminLogout };
