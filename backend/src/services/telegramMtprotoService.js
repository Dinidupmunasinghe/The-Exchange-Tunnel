const { spawn } = require("child_process");
const path = require("path");
const env = require("../config/env");

const SCRIPT_PATH = path.resolve(__dirname, "../scripts/telegram_mtproto_bridge.py");
const BRIDGE_TIMEOUT_MS = 30_000;
// Each Python bridge process loads Telethon (~70-100MB). On constrained
// hosts (e.g. Render free 512MB) running many in parallel will OOM. Default
// to 1 globally; override with MTPROTO_MAX_CONCURRENT in env.
const MAX_CONCURRENT_BRIDGES = Math.max(1, Number(process.env.MTPROTO_MAX_CONCURRENT || 1));
const MAX_BRIDGE_QUEUE = Math.max(8, Number(process.env.MTPROTO_MAX_QUEUE || 32));

let activeBridgeCount = 0;
const bridgeQueue = [];

function acquireSlot() {
  return new Promise((resolve, reject) => {
    if (activeBridgeCount < MAX_CONCURRENT_BRIDGES) {
      activeBridgeCount += 1;
      resolve();
      return;
    }
    if (bridgeQueue.length >= MAX_BRIDGE_QUEUE) {
      const err = new Error("Telegram bridge queue is full; please retry shortly.");
      err.code = "BRIDGE_QUEUE_FULL";
      reject(err);
      return;
    }
    bridgeQueue.push(resolve);
  });
}

function releaseSlot() {
  const next = bridgeQueue.shift();
  if (next) {
    next();
    return;
  }
  activeBridgeCount = Math.max(0, activeBridgeCount - 1);
}

async function runBridge(operation, payload) {
  await acquireSlot();
  try {
    return await spawnBridge(operation, payload);
  } finally {
    releaseSlot();
  }
}

function spawnBridge(operation, payload) {
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
