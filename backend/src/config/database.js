const { Sequelize } = require("sequelize");
const env = require("./env");

const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false";

const baseOptions = {
  dialect: env.db.dialect,
  logging: false,
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
