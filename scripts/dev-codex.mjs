import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profile = resolve(process.env.NEXUS_CODEX_PROFILE || join(homedir(), ".nexus-codex-phase2", "profile"));
if (profile.toLowerCase() === resolve(homedir(), ".pi-desktop-nexus").toLowerCase()) throw new Error("Choose a separate Codex test profile.");
await mkdir(profile, { recursive: true });
const packageManager = process.env.npm_execpath;
if (!packageManager) throw new Error("Run this launcher with pnpm dev:codex.");
await access(packageManager);
const script = /\.[cm]?js$/i.test(packageManager);
console.log("Codex Phase 2 profile: " + profile);
console.log("The engine is opt-in. Configure an API-key Responses provider in this profile.");
const managerArgs = script ? [packageManager] : [];
const env = { ...process.env, NEXUS_AGENT_ENGINE: "codex", PI_DESKTOP_DATA_DIR: profile };
if (process.env.PI_DESKTOP_HOST_BIN) {
  await access(process.env.PI_DESKTOP_HOST_BIN);
  console.log("Reusing explicitly supplied host binary: " + process.env.PI_DESKTOP_HOST_BIN);
  const preparation = spawn(script ? process.execPath : packageManager, [...managerArgs, "--filter", "@pi-desktop/desktop", "run", "build:deps"], { cwd: root, stdio: "inherit", windowsHide: true, env });
  const prepared = await new Promise((resolve, reject) => { preparation.on("error", reject); preparation.on("exit", resolve); });
  if (prepared !== 0) process.exit(Number(prepared) || 1);
}
const child = spawn(process.env.PI_DESKTOP_HOST_BIN ? process.execPath : script ? process.execPath : packageManager,
  process.env.PI_DESKTOP_HOST_BIN ? [join(root, "scripts/dev-electron.mjs")] : [...managerArgs, "dev"], {
  cwd: root, stdio: "inherit", windowsHide: true,
  env,
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
