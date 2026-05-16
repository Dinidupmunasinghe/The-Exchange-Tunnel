const jwt = require("jsonwebtoken");
const env = require("../config/env");
const db = require("../models");

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Missing authentication token" });
  }

  try {
    const payload = jwt.verify(token, env.jwt.secret);
    let user;
    try {
      user = await db.User.findByPk(payload.sub);
    } catch (dbError) {
      // eslint-disable-next-line no-console
      console.error("authMiddleware user lookup failed:", dbError.message);
      return res.status(503).json({
        message: "Account lookup failed. The server may need a database update — try again shortly."
      });
    }
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid authentication token" });
    }
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Session expired. Please sign in again." });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid authentication token" });
    }
    return res.status(401).json({ message: "Invalid authentication token" });
  }
}

module.exports = authMiddleware;
