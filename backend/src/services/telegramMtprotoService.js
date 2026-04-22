const { spawn } = require("child_process");
const path = require("path");
const env = require("../config/env");

const SCRIPT_PATH = path.resolve(__dirname, "../scripts/telegram_mtproto_bridge.py");

function runBridge(operation, payload) {
  return new Promise((resolve, reject) => {
    const python = spawn(env.telegram.mtproto.pythonBinary, [SCRIPT_PATH, operation], {
      cwd: path.resolve(__dirname, ".."),
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    python.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    python.on("error", (error) => {
      reject(new Error(`Failed to start Python bridge: ${error.message}`));
    });
    python.on("close", (code) => {
      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `bridge exited with code ${code}`;
        reject(new Error(detail));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Invalid JSON response from Telegram bridge"));
      }
    });

    python.stdin.write(JSON.stringify(payload || {}));
    python.stdin.end();
  });
}

module.exports = {
  runBridge
};
