import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeEffort, prepareLaunch, type CodexConfig } from "./config.js";
import { CodexController } from "./controller.js";
const dirs: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const config: CodexConfig = { sessionId: "s", dataDir: "profile", workspace: "workspace", permissionMode: "ask", provider: { id: "p", name: "test", apiKey: "transient-secret", modelId: "m", baseUrl: "https://example.test/v1", apiStyle: "openai-responses", authKind: "api_key_and_base_url", supportsReasoning: false, supportedThinkingLevels: [], headers: { "X-Test": "private-header" } } };
it("requires an explicit separate profile", () => {
  vi.stubEnv("PI_DESKTOP_DATA_DIR", ""); expect(() => new CodexController(() => undefined).configure("profile")).toThrow("CODEX_FRESH_PROFILE_REQUIRED");
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
  const launch = await prepareLaunch(config, join(root, "profile"));
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
