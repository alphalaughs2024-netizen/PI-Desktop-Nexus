import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexPermissionMode, nativeEffort, nativePolicy, prepareLaunch, resolveCodexEntrypoint, sessionDescriptor, type CodexConfig } from "./config.js";
import { CodexController } from "./controller.js";
const dirs: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const config: CodexConfig = { sessionId: "s", dataDir: "profile", workspace: "workspace", permissionMode: "ask", provider: { id: "p", name: "test", apiKey: "transient-secret", modelId: "m", baseUrl: "https://example.test/v1", apiStyle: "openai-responses", authKind: "api_key_and_base_url", supportsReasoning: false, supportedThinkingLevels: [], headers: { "X-Test": "private-header" } } };
it("requires an explicit separate profile", () => {
  vi.stubEnv("PI_DESKTOP_DATA_DIR", ""); expect(() => new CodexController(() => undefined).configure("profile")).toThrow("CODEX_FRESH_PROFILE_REQUIRED");
});
it("does not claim managed preview processes merely because the tool bridge exists", () => {
 expect(sessionDescriptor({ ...config, nexusToolsAvailable: true }).capabilities).toMatchObject({ browser: true, managedPreview: false });
});
it("rejects unsupported endpoint transports and OAuth rather than falling back", async () => {
  await expect(prepareLaunch({ ...config, provider: { ...config.provider, apiStyle: "openai-completions" } }, "unused")).rejects.toThrow("CODEX_RESPONSES_REQUIRED");
  await expect(prepareLaunch({ ...config, provider: { ...config.provider, authKind: "oauth" } }, "unused")).rejects.toThrow("CODEX_PROVIDER_UNSUPPORTED");
});
it("keeps key and private header values out of argv and generated config", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexus-launch-")); dirs.push(root);
  vi.stubEnv("APPDATA", root);
  const { mkdir, writeFile } = await import("node:fs/promises");
  const packageRoot = join(root, "npm/node_modules/@openai/codex"); await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ version: "0.157.1", bin: "codex.js" })); await writeFile(join(packageRoot, "codex.js"), "");
  if (process.platform === "win32") {
    const triple = process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
    const binaryDir = join(packageRoot, "vendor", triple, "bin");
    await mkdir(binaryDir, { recursive: true }); await writeFile(join(binaryDir, "codex.exe"), "");
  }
  const launch = await prepareLaunch(config, join(root, "profile"));
  if (process.platform === "win32") {
    expect(launch.command).toMatch(/codex\.exe$/); expect(launch.args[0]).toBe("app-server");
    expect(launch.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(launch.env.CODEX_MANAGED_PACKAGE_ROOT).toBe(packageRoot);
  }
  expect(launch.env.NEXUS_CODEX_PROVIDER_KEY).toBe("transient-secret"); expect(launch.env.NEXUS_CODEX_HEADER_0).toBe("private-header");
  expect(JSON.stringify(launch.args)).not.toContain("transient-secret"); expect(JSON.stringify(launch.args)).not.toContain("private-header");
  expect(await readFile(join(root, "profile/model-catalog.json"), "utf8")).not.toContain("transient-secret");
});
it("refuses an untested Codex version", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexus-pin-")); dirs.push(root); vi.stubEnv("APPDATA", root);
  const { mkdir, writeFile } = await import("node:fs/promises"); const packageRoot = join(root, "npm/node_modules/@openai/codex"); await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ version: "0.158.0-alpha" }));
  await expect(prepareLaunch(config, join(root, "profile"))).rejects.toThrow("CODEX_VERSION_MISMATCH");
});

it("preserves endpoint effort mappings and rejects unavailable reasoning levels", () => {
  const provider = { ...config.provider, supportsReasoning: true, supportedThinkingLevels: ["medium", "max"] as const };
  expect(nativeEffort({ ...provider, supportedThinkingLevels: [...provider.supportedThinkingLevels] }, "max")).toBe("max");
  expect(() => nativeEffort({ ...provider, supportedThinkingLevels: [...provider.supportedThinkingLevels] }, "low")).toThrow("CODEX_REASONING_LEVEL_UNSUPPORTED");
  const mapped: CodexConfig["provider"] = { ...config.provider, supportsReasoning: true, supportedThinkingLevels: ["off", "medium"], modelConfig: { source: "generic", name: "m", baseUrl: "https://example.test/v1", reasoning: true, input: ["text"], contextWindow: 32768, maxTokens: 8192, thinkingLevelMap: { off: null, medium: "balanced" } } };
  expect(nativeEffort(mapped, "medium")).toBe("balanced");
  expect(nativeEffort(mapped, "off")).toBe("none");
  expect(nativeEffort(config.provider, "off")).toBeUndefined();
  expect(() => nativeEffort(config.provider, "high")).toThrow("CODEX_REASONING_UNSUPPORTED");
});

it("maps explicit Full access to native unrestricted policy without weakening other modes", () => {
  expect(codexPermissionMode("full-access")).toBe("full-access");
  expect(nativePolicy(codexPermissionMode("full-access"))).toEqual({ approvalPolicy: "never", sandbox: "danger-full-access" });
  expect(nativePolicy(codexPermissionMode(undefined))).toEqual({ approvalPolicy: "on-request", sandbox: "read-only" });
  expect(nativePolicy(codexPermissionMode("auto"))).toEqual({ approvalPolicy: "never", sandbox: "workspace-write" });
  expect(() => codexPermissionMode("unknown-mode")).toThrow("CODEX_PERMISSION_MODE_UNSUPPORTED");
});

async function nativeFixture(arch: "x64" | "arm64", hoisted = false, version = "0.157.1-win32-" + arch) {
  const root = await mkdtemp(join(tmpdir(), "nexus-native-launch-")); dirs.push(root);
  const { mkdir, writeFile } = await import("node:fs/promises");
  const packageRoot = join(root, "node_modules/@openai/codex"); await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ version: "0.157.1", bin: "codex.js" }));
  const nativeRoot = join(hoisted ? root : packageRoot, "node_modules/@openai/codex-win32-" + arch);
  await mkdir(nativeRoot, { recursive: true }); await writeFile(join(nativeRoot, "package.json"), JSON.stringify({ version }));
  const triple = arch === "x64" ? "x86_64-pc-windows-msvc" : "aarch64-pc-windows-msvc";
  const binaryDir = join(nativeRoot, "vendor", triple, "bin"); await mkdir(binaryDir, { recursive: true });
  const binary = join(binaryDir, "codex.exe"); await writeFile(binary, "");
  return { packageRoot, binary };
}
it.each(["x64", "arm64"] as const)("launches the pinned Windows %s native binary without a console-creating wrapper", async arch => {
  const { packageRoot, binary } = await nativeFixture(arch);
  expect(await resolveCodexEntrypoint(packageRoot, "win32", arch)).toEqual({ command: binary, prefix: [] });
});
it("resolves hoisted native packages with Node package resolution", async () => {
  const { packageRoot, binary } = await nativeFixture("x64", true);
  expect((await resolveCodexEntrypoint(packageRoot, "win32", "x64")).command).toBe(binary);
});
it("rejects a mismatched native package before starting it", async () => {
  const { packageRoot } = await nativeFixture("x64", false, "0.158.0-win32-x64");
  await expect(resolveCodexEntrypoint(packageRoot, "win32", "x64")).rejects.toThrow("CODEX_VERSION_MISMATCH");
});
it("fails clearly for a missing native executable and unsupported architecture", async () => {
  const { packageRoot, binary } = await nativeFixture("x64"); await rm(binary);
  await expect(resolveCodexEntrypoint(packageRoot, "win32", "x64")).rejects.toThrow("CODEX_NATIVE_BINARY_MISSING");
  await expect(resolveCodexEntrypoint(packageRoot, "win32", "ia32")).rejects.toThrow("CODEX_PLATFORM_UNSUPPORTED");
});
it("keeps the existing JavaScript entrypoint on other platforms", async () => {
  const { packageRoot } = await nativeFixture("x64"); const { writeFile } = await import("node:fs/promises");
  await writeFile(join(packageRoot, "codex.js"), "");
  expect(await resolveCodexEntrypoint(packageRoot, "linux", "x64")).toEqual({ command: process.execPath, prefix: [join(packageRoot, "codex.js")] });
});
