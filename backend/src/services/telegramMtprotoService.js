const { spawn } = require("child_process");
const path = require("path");
const env = require("../config/env");

const SCRIPT_PATH = path.resolve(__dirname, "../scripts/telegram_mtproto_bridge.py");
const BRIDGE_TIMEOUT_MS = 30_000;

function runBridge(operation, payload) {
  return new Promise((resolve, reject) => {
    const python = spawn(env.telegram.mtproto.pythonBinary, [SCRIPT_PATH, operation], {
      cwd: path.resolve(__dirname, ".."),
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      python.kill("SIGKILL");
      const err = new Error(`Telegram bridge timeout after ${BRIDGE_TIMEOUT_MS}ms`);
      err.code = "BRIDGE_TIMEOUT";
      reject(err);
    }, BRIDGE_TIMEOUT_MS);

    python.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    python.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    python.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const err = new Error(`Failed to start Python bridge: ${error.message}`);
      err.code = "BRIDGE_START_FAILED";
      reject(err);
    });
    python.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const parsedStdout = (() => {
        try {
          return JSON.parse(stdout);
        } catch {
          return null;
        }
      })();
      if (code !== 0) {
        if (parsedStdout && parsedStdout.ok === false) {
          const err = new Error(parsedStdout.message || "Telegram bridge error");
          err.code = parsedStdout.code || "BRIDGE_ERROR";
          if (parsedStdout.waitSeconds != null) err.waitSeconds = Number(parsedStdout.waitSeconds);
          reject(err);
          return;
        }
        const detail = stderr.trim() || stdout.trim() || `bridge exited with code ${code}`;
        const err = new Error(detail);
        err.code = "BRIDGE_EXIT_NONZERO";
        reject(err);
        return;
      }
      if (parsedStdout == null) {
        const err = new Error("Invalid JSON response from Telegram bridge");
        err.code = "BRIDGE_INVALID_JSON";
        reject(err);
        return;
      }
      resolve(parsedStdout);
    });

    python.stdin.write(JSON.stringify(payload || {}));
    python.stdin.end();
  });
}

module.exports = {
  runBridge
};
