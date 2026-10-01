import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = resolve(process.argv[2] ?? join(process.env.USERPROFILE, ".nexus-codex-phase2", "browser-surface-" + Date.now()));
await mkdir(directory, { recursive: true });
const requireRuntime = createRequire(join(root, "packages/agent-runtime/package.json"));
await requireRuntime("esbuild").build({ entryPoints: [fileURLToPath(new URL("browser-surface-fixture.ts", import.meta.url))], bundle: true, platform: "node", format: "cjs", external: ["electron"], outfile: join(directory, "fixture.cjs") });
const electron = createRequire(join(root, "apps/desktop/package.json"))("electron");
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [join(directory, "fixture.cjs"), directory], { env, windowsHide: true, stdio: "inherit" });
const timer = setTimeout(() => { child.kill(); process.exitCode = 1; }, 45_000);
child.on("error", error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { clearTimeout(timer); process.exitCode = code ?? 1; });
