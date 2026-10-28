import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";

console.log("🚀 Starting backend and frontend in parallel...");

const backend = spawn(npmCmd, ["run", "backend"], { stdio: "inherit", shell: true });
const frontend = spawn(npmCmd, ["run", "dev"], { stdio: "inherit", shell: true });

function cleanExit() {
  backend.kill();
  frontend.kill();
  process.exit();
}

process.on("SIGINT", cleanExit);
process.on("SIGTERM", cleanExit);

