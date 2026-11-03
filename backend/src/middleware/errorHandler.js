const env = require("../config/env");

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = Number(err.status || err.statusCode) || 500;
  // Never leak DB/bridge internals to clients on server errors in production.
  const expose = status < 500 || !env.isProduction || err.expose === true;
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(`[${req.method} ${req.originalUrl}]`, err?.stack || err);
  }
  const body = {
    message: expose ? err.message || "Internal server error" : "Something went wrong. Please try again."
  };
  if (err.code && expose) body.code = err.code;
  if (err.required != null) body.required = err.required;
  if (err.balance != null) body.balance = err.balance;
  if (err.freeCreditCap != null) body.freeCreditCap = err.freeCreditCap;
  if (err.lifetimeCreditsSpent != null) body.lifetimeCreditsSpent = err.lifetimeCreditsSpent;
  return res.status(status).json(body);
}

module.exports = errorHandler;
