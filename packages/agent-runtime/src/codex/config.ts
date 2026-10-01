import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import type { EngineSession, ThinkingLevel } from "@pi-desktop/shared";
import type { RuntimeProviderConfig } from "../provider-binding.js";
export const CODEX_VERSION = "0.157.1";
export type CodexLaunch = { command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv };
export type CodexConfig = {
  sessionId: string;
  dataDir: string;
  workspace: string;
  provider: RuntimeProviderConfig;
  permissionMode: "ask" | "accept-edits" | "auto" | "full-access";
  scratchDir?: string;
  developerInstructions?: string;
  nexusToolsAvailable?: boolean;
  toolBridge?: { url: string; token: string };
  restrictedTools?: string[];
  maxModelRequests?: number;
  serviceCatalogKey?: string;
};
export function sessionDescriptor(config: CodexConfig): EngineSession {
  return { sessionId: config.sessionId, engine: "codex", version: CODEX_VERSION, workspace: resolve(config.workspace), providerId: config.provider.id, modelId: config.provider.modelId,
    capabilities: { imageInput: config.provider.modelConfig?.input.includes("image") === true, nativeTools: !config.restrictedTools, recovery: true, steering: true, browser: config.nexusToolsAvailable === true, managedPreview: false } };
}
/** Preserve the selected endpoint effort; never silently spend at a higher level. */
export function nativeEffort(provider: RuntimeProviderConfig, level?: ThinkingLevel): string | undefined {
  if (level === undefined) return undefined;
  if (!provider.supportsReasoning) {
    if (level !== "off") throw new Error("CODEX_REASONING_UNSUPPORTED");
    return undefined;
  }
  if (!provider.supportedThinkingLevels.includes(level)) throw new Error("CODEX_REASONING_LEVEL_UNSUPPORTED: " + level);
  const mapped = provider.modelConfig?.thinkingLevelMap?.[level];
  return mapped === null || level === "off" ? "none" : mapped ?? level;
}
export function codexPermissionMode(value: unknown): CodexConfig["permissionMode"] {
  if (value === undefined) return "ask";
  if (value === "ask" || value === "accept-edits" || value === "auto" || value === "full-access") return value;
  throw new Error("CODEX_PERMISSION_MODE_UNSUPPORTED: use Ask, Accept edits, Auto or Full access");
}
export function nativePolicy(mode: CodexConfig["permissionMode"]) {
  return { approvalPolicy: mode === "auto" || mode === "full-access" ? "never" : "on-request",
    sandbox: mode === "full-access" ? "danger-full-access" : mode === "ask" ? "read-only" : "workspace-write" };
}
/** Bypass the npm shim on Windows: its native child is not spawned hidden. */
export async function resolveCodexEntrypoint(packageRoot: string, platform: NodeJS.Platform = process.platform, arch: string = process.arch): Promise<{ command: string; prefix: string[] }> {
  if (platform !== "win32") {
    const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    const entry = resolve(packageRoot, typeof metadata.bin === "string" ? metadata.bin : metadata.bin.codex);
    await access(entry);
    return { command: process.execPath, prefix: [entry] };
  }
  if (arch !== "x64" && arch !== "arm64") throw new Error("CODEX_PLATFORM_UNSUPPORTED: " + arch);
  const nativePackage = "@openai/codex-win32-" + arch;
  let vendorRoot = join(packageRoot, "vendor");
  let nativeMetadataPath: string | undefined;
  try { nativeMetadataPath = createRequire(join(packageRoot, "package.json")).resolve(nativePackage + "/package.json"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error; }
  if (nativeMetadataPath) {
    const metadata = JSON.parse(await readFile(nativeMetadataPath, "utf8"));
    if (metadata.version !== CODEX_VERSION + "-win32-" + arch) throw new Error("CODEX_VERSION_MISMATCH: native package must match " + CODEX_VERSION);
    vendorRoot = join(dirname(nativeMetadataPath), "vendor");
  }
  const triple = arch === "x64" ? "x86_64-pc-windows-msvc" : "aarch64-pc-windows-msvc";
  const command = join(vendorRoot, triple, "bin", "codex.exe");
  try { await access(command); }
  catch { throw new Error("CODEX_NATIVE_BINARY_MISSING: install the pinned Windows Codex package"); }
  return { command, prefix: [] };
}
export async function prepareLaunch(config: CodexConfig, directory: string): Promise<CodexLaunch> {
  if (config.provider.authKind && !["api-key", "api_key", "api_key_and_base_url", "none"].includes(config.provider.authKind)) throw new Error("CODEX_PROVIDER_UNSUPPORTED: select an API-key Responses endpoint for this prototype");
  if (config.provider.apiStyle && !/responses/i.test(config.provider.apiStyle)) throw new Error("CODEX_RESPONSES_REQUIRED: configure this provider with the Responses API");
  if (!config.provider.apiKey && config.provider.authKind !== "none") throw new Error("CODEX_PROVIDER_KEY_REQUIRED");
  if (!config.provider.baseUrl) throw new Error("CODEX_ENDPOINT_REQUIRED");
  const endpoint = new URL(config.provider.baseUrl);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !["https:", "http:"].includes(endpoint.protocol)) throw new Error("CODEX_ENDPOINT_INVALID");
  const packageRoot = join(process.env.APPDATA ?? join(homedir(), ".local", "lib"), "npm", "node_modules", "@openai", "codex");
  const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  if (metadata.version !== CODEX_VERSION) throw new Error("CODEX_VERSION_MISMATCH: this prototype requires " + CODEX_VERSION);
  const executable = await resolveCodexEntrypoint(packageRoot);
  await mkdir(directory, { recursive: true });
  const contextWindow = config.provider.modelConfig?.contextWindow ?? config.provider.modelConfig?.limit?.context ?? 32768;
  const input = sessionDescriptor(config).capabilities.imageInput ? ["text", "image"] : ["text"];
  const descriptor = {
    slug: config.provider.modelId, display_name: config.provider.modelId, description: "Nexus custom provider",
    default_reasoning_level: null, supported_reasoning_levels: config.provider.supportsReasoning ? config.provider.supportedThinkingLevels.map(level => ({ effort: nativeEffort(config.provider, level), description: level })) : [], shell_type: "unified_exec", visibility: "list", supported_in_api: true, priority: 0,
    availability_nux: null, upgrade: null,
    model_messages: { instructions_template: "You are a coding agent in Nexus. Inspect inputs, use available native tools, preserve work and report failures accurately. Never claim actions succeeded without evidence." },
    include_skills_usage_instructions: false, include_apps_usage_instructions: false, include_plugin_usage_instructions: false,
    supports_reasoning_summary_parameter: false, default_reasoning_summary: "none", support_verbosity: false, default_verbosity: null,
    apply_patch_tool_type: "freeform", truncation_policy: { mode: "bytes", limit: 10000 }, supports_parallel_tool_calls: true,
    context_window: contextWindow, max_context_window: contextWindow, experimental_supported_tools: [], input_modalities: input,
    use_responses_lite: false, prefer_websockets: false, multi_agent_version: null, tool_mode: null,
  };
  const catalog = join(directory, "model-catalog.json");
  await writeFile(catalog, JSON.stringify({ models: [descriptor] }), { mode: 0o600 });
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/API_KEY|AUTH_TOKEN|ACCESS_TOKEN|OPENAI_BASE_URL|ANTHROPIC_BASE_URL|CODEX_HOME/.test(key)) delete env[key];
  env.CODEX_HOME = join(directory, "native");
  await mkdir(env.CODEX_HOME, { recursive: true });
  // Credential lives only in the child environment; no plaintext config or argv.
  env.NEXUS_CODEX_PROVIDER_KEY = config.provider.apiKey;
  if (process.platform === "win32") {
    delete env.ELECTRON_RUN_AS_NODE;
    for (const key of ["CODEX_MANAGED_BY_NPM", "CODEX_MANAGED_BY_BUN", "CODEX_MANAGED_BY_PNPM", "CODEX_MANAGED_BY_VITE_PLUS"]) delete env[key];
    env.CODEX_MANAGED_PACKAGE_ROOT = packageRoot;
    env.CODEX_MANAGED_BY_NPM = "1";
  } else env.ELECTRON_RUN_AS_NODE = "1";
  const setting = (key: string, value: unknown) => ["-c", key + "=" + JSON.stringify(value)];
  const args = [...executable.prefix, "app-server",
    ...setting("model_provider", "nexus"), ...setting("model", config.provider.modelId),
    ...setting("model_catalog_json", catalog.replaceAll("\\", "/")),
    ...setting("model_context_window", contextWindow),
    ...setting("model_max_output_tokens", config.provider.modelConfig?.maxTokens ?? 8192),
    ...setting("features.enable_request_compression", false),
    ...setting("features.multi_agent", false),
    ...setting("shell_environment_policy.exclude", ["NEXUS_CODEX_*", "*_API_KEY", "*_AUTH_TOKEN"]),
    ...setting("model_providers.nexus.name", "Nexus provider"),
    ...setting("model_providers.nexus.base_url", endpoint.toString().replace(/\/$/, "")),
    ...setting("model_providers.nexus.wire_api", "responses"),
    ...(config.provider.apiKey ? setting("model_providers.nexus.env_key", "NEXUS_CODEX_PROVIDER_KEY") : []),
    ...setting("model_providers.nexus.requires_openai_auth", false),
  ];
  if (config.toolBridge) {
    env.NEXUS_CODEX_TOOL_TOKEN = config.toolBridge.token;
    args.push(...setting("mcp_servers.nexus.url", config.toolBridge.url),
      ...setting("mcp_servers.nexus.bearer_token_env_var", "NEXUS_CODEX_TOOL_TOKEN"),
      ...setting("mcp_servers.nexus.startup_timeout_sec", 20),
      ...setting("mcp_servers.nexus.tool_timeout_sec", 240),
      ...setting("mcp_servers.nexus.required", true),
      ...setting("mcp_servers.nexus.default_tools_approval_mode", "approve"));
  }
  if (config.restrictedTools) args.push(...setting("features.shell_tool", false));
  // Additional headers are private inherited environment values, never config values.
  const envHeaders: Record<string, string> = {};
  let headerIndex = 0;
  for (const [name, value] of Object.entries(config.provider.headers ?? {})) {
    const key = "NEXUS_CODEX_HEADER_" + headerIndex++;
    env[key] = value; envHeaders[name] = key;
  }
  for (const [name, key] of Object.entries(envHeaders)) args.push(...setting("model_providers.nexus.env_http_headers." + JSON.stringify(name), key));
  if (process.platform === "win32") args.push(...setting("windows.sandbox", "unelevated"));
  return { command: executable.command, args, env, cwd: config.workspace };
}
