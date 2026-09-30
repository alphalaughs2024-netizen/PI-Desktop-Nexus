/** Schemas for main-owned tools, advertised by the same registry that executes them. */
const str = { type: "string" };
const bool = { type: "boolean" };
const number = { type: "number" };
const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const target = { browserId: str };
const ref = { ...target, snapshotId: str, ref: str };
export const NEXUS_LOCAL_TOOL_SCHEMAS: Record<string, { description: string; parameters: Record<string, unknown> }> = {
 BrowserPreview: { description: "Open an HTML file inside this session workspace or scratch directory in Nexus Browser with live reload.", parameters: schema({ path: str }, ["path"]) },
 browser_list_tabs: { description: "List Nexus Browser tabs and their browserId. Does not navigate.", parameters: schema({}) },
 browser_open: { description: "Open or reuse Nexus Browser; supply url to navigate. Return browserId for subsequent calls.", parameters: schema({ url: str }) },
 browser_navigate: { description: "Navigate a specific Nexus Browser tab. Verify the final URL using browser_snapshot.", parameters: schema({ ...target, url: str }, ["browserId", "url"]) },
 browser_snapshot: { description: "Read the bounded accessibility tree. References are scoped to browserId and snapshotId; refresh after navigation.", parameters: schema(target, ["browserId"]) },
 browser_screenshot: { description: "Capture Nexus Browser. Vision-capable models receive the actual image along with its path and dimensions.", parameters: schema({ ...target, fullPage: bool }, ["browserId"]) },
 browser_click: { description: "Click a reference from the current snapshot. Never retry an ambiguously applied action without inspecting the page.", parameters: schema({ ...ref, button: str }, ["browserId", "snapshotId", "ref"]) },
 browser_fill: { description: "Replace a current snapshot field's text.", parameters: schema({ ...ref, text: str }, ["browserId", "snapshotId", "ref", "text"]) },
 browser_type: { description: "Type text into a current reference or focused element.", parameters: schema({ ...ref, text: str, clearFirst: bool }, ["browserId", "text"]) },
 browser_keypress: { description: "Send a bounded keypress to Nexus Browser.", parameters: schema({ ...ref, key: str, modifiers: { type: "array", items: str } }, ["browserId", "key"]) },
 browser_wait: { description: "Wait for a bounded URL, text, or load condition.", parameters: schema({ ...target, condition: { type: "object", properties: { kind: { type: "string", enum: ["url", "text", "page_load"] }, match: { type: "string", enum: ["equals", "contains"] }, value: str }, required: ["kind"], additionalProperties: false }, timeoutMs: number }, ["browserId", "condition"]) },
 browser_set_viewport: { description: "Set the browser CSS viewport for desktop/mobile verification; reset=true restores panel sizing.", parameters: schema({ ...target, width: { type: "integer", minimum: 240, maximum: 3840 }, height: { type: "integer", minimum: 240, maximum: 2160 }, mobile: bool, reset: bool }, ["browserId"]) },
 browser_console: { description: "Read bounded browser console diagnostics.", parameters: schema({ ...target, limit: number }, ["browserId"]) },
 browser_evaluate: { description: "Evaluate JavaScript in the explicit browser tab; results are bounded and sanitized.", parameters: schema({ ...target, expression: str }, ["browserId", "expression"]) },
 browser_cdp: { description: "Call an allowlisted CDP method. Cookies, storage, targets and interception remain denied.", parameters: schema({ ...target, method: str, params: { type: "object", additionalProperties: true } }, ["browserId", "method"]) },
 Skill: { description: "Load a skill document by an id in this session's skill catalog. Guidance grants no permissions.", parameters: schema({ id: str }, ["id"]) },
 Workflow: { description: "Inspect, activate or dismiss a Nexus workflow.", parameters: schema({ operation: { type: "string", enum: ["status", "list", "activate", "dismiss"] }, id: str }, ["operation"]) },
 GitWorktree: { description: "Manage a Nexus-owned worktree in the current project; confirmations remain visible.", parameters: schema({ operation: { type: "string", enum: ["status", "create", "merge", "cleanup"] }, branch: str }, ["operation", "branch"]) },
 PluginScaffold: { description: "Scaffold a Nexus plugin in the specified directory.", parameters: schema({ template: str, directory: str, id: str, name: str }, ["template", "directory"]) },
 PluginCheck: { description: "Validate a local Nexus plugin.", parameters: schema({ directory: str }, ["directory"]) },
 PluginPack: { description: "Package a local Nexus plugin.", parameters: schema({ directory: str }, ["directory"]) },
};
