const { execSync } = require("node:child_process");

const isLinux = process.platform === "linux";

try {
  if (isLinux) {
    console.log("[postinstall] Rebuilding sqlite3 from source on Linux...");
    execSync("npm rebuild sqlite3 --build-from-source", { stdio: "inherit" });
  } else {
    console.log("[postinstall] Refreshing sqlite3 binary for local platform...");
    execSync("npm rebuild sqlite3 --update-binary", { stdio: "inherit" });
  }
} catch (error) {
  console.error("[postinstall] sqlite3 rebuild failed:", error.message);
  process.exit(1);
}
