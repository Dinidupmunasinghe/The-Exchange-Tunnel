const { Sequelize } = require("sequelize");
const env = require("./env");

// Default to NOT verifying the CA when the host's cert is self-signed
// (Render Postgres, Heroku, Railway public proxies, etc.).
// Override by setting DB_SSL_REJECT_UNAUTHORIZED=true.
const explicitReject = process.env.DB_SSL_REJECT_UNAUTHORIZED;
const sslRejectUnauthorized = explicitReject != null
  ? explicitReject === "true"
  : env.db.dialect !== "postgres";

const baseOptions = {
  dialect: env.db.dialect,
  logging: false,
  pool: env.lowMemoryHost
    ? { max: 3, min: 0, acquire: 20000, idle: 10000 }
    : { max: 10, min: 0, acquire: 30000, idle: 10000 },
  dialectOptions: env.db.ssl
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: sslRejectUnauthorized
        }
      }
    : {}
};

const sequelize = env.db.url
  ? new Sequelize(env.db.url, baseOptions)
  : new Sequelize(env.db.name, env.db.user, env.db.password, {
      ...baseOptions,
      host: env.db.host,
      port: env.db.port
    });

module.exports = sequelize;
