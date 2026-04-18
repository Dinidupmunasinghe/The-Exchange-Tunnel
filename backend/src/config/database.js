const { Sequelize } = require("sequelize");
const env = require("./env");

const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: "mysql",
  logging: false,
  dialectOptions: env.db.ssl
    ? {
        ssl: {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false"
        }
      }
    : {}
});

module.exports = sequelize;
