function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  const body = {
    message: err.message || "Internal server error"
  };
  if (err.code) body.code = err.code;
  if (err.required != null) body.required = err.required;
  if (err.balance != null) body.balance = err.balance;
  if (err.freeCreditCap != null) body.freeCreditCap = err.freeCreditCap;
  if (err.lifetimeCreditsSpent != null) body.lifetimeCreditsSpent = err.lifetimeCreditsSpent;
  return res.status(status).json(body);
}

module.exports = errorHandler;
