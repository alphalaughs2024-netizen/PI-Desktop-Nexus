import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const bundleRoot = new URL(
  "../../../packages/agent-runtime/dist-bundle/",
  import.meta.url,
);

test("clean-profile packaged sidecar boots as ESM", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-sidecar-clean-"));
  const entry = join(root, "sidecar.js");
  const boundary = join(root, "package.json");
  try {
    await copyFile(new URL("sidecar.js", bundleRoot), entry);
    await copyFile(new URL("package.json", bundleRoot), boundary);
    assert.deepEqual(JSON.parse(await readFile(boundary, "utf8")), {
      type: "module",
    });

    const child = spawn(process.execPath, [entry], {
      cwd: root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`sidecar did not boot: ${stderr}`)),
        10_000,
      );
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code, signal) => {
        clearTimeout(timer);
        reject(new Error(`sidecar exited before ready: ${code}/${signal}: ${stderr}`));
      });
      const onData = () => {
        if (!stderr.includes("ready (host-proxy mode)")) return;
        child.stderr.off("data", onData);
        clearTimeout(timer);
        resolve();
      };
      child.stderr.on("data", onData);
    });
    assert.doesNotMatch(stderr, /MODULE_TYPELESS_PACKAGE_JSON/);
    assert.match(stderr, /ready \(host-proxy mode\)/);
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
