const env = require("../config/env");

/**
 * Message safe to send to clients. 4xx messages are written for users; 5xx messages may
 * contain DB/bridge internals, so in production they are replaced with the fallback.
 */
function clientErrorMessage(err, fallback) {
  const status = Number(err?.status || err?.statusCode) || 500;
  if (status < 500 || !env.isProduction || err?.expose === true) {
    return err?.message || fallback;
  }
  // eslint-disable-next-line no-console
  console.error(fallback, err?.stack || err);
  return fallback;
}

module.exports = { clientErrorMessage };
