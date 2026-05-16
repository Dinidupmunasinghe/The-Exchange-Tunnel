const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const routes = require("./routes");
const errorHandler = require("./middleware/errorHandler");
const env = require("./config/env");

const app = express();

// Allow Vite's default port or the next free port (5173, 5174, …) during local dev.
const corsOrigin =
  env.nodeEnv !== "production"
    ? (origin, callback) => {
        if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        if (origin === env.corsOrigin) {
          return callback(null, true);
        }
        return callback(null, false);
      }
    : env.corsOrigin;

app.use(helmet());
app.use(
  cors({
    origin: corsOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.use("/api", routes);
app.use(errorHandler);

module.exports = app;
