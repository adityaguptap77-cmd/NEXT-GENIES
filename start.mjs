import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

// Hostinger may start this file directly without running a separate build step.
// Build the Vite frontend first so backend/server.js can serve dist/index.html.
execFileSync(npmCommand, ["run", "build"], {
  cwd: projectRoot,
  shell: process.platform === "win32",
  stdio: "inherit",
});

await import("./backend/server.js");
