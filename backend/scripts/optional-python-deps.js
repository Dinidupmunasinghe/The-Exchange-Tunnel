/**
 * Installs Telethon for MTProto user session (like/comment/subscribe actions).
 * Set SKIP_PYTHON_DEPS=true on hosts where build memory is too tight; earn actions
 * that need Python will fail until deps are installed another way.
 */
const { execSync } = require("child_process");
const path = require("path");

if (process.env.SKIP_PYTHON_DEPS === "true") {
  console.log("[postinstall] SKIP_PYTHON_DEPS=true — skipping Telethon install.");
  process.exit(0);
}

const reqPath = path.join(__dirname, "../src/scripts/requirements.txt");
const attempts = [
  "python3 -m pip install --no-cache-dir -r " + JSON.stringify(reqPath),
  "python -m pip install --no-cache-dir -r " + JSON.stringify(reqPath)
];

for (const cmd of attempts) {
  try {
    execSync(cmd, { stdio: "inherit" });
    process.exit(0);
  } catch {
    // try next python binary
  }
}

console.warn(
  "[postinstall] Could not install Telethon. MTProto features need Python 3 + pip on the server."
);
