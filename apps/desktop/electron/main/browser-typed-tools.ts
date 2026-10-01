import type { BrowserBroker } from "./browser-broker";
import { BROWSER_TOOL_NAMES } from "@pi-desktop/shared";

export const BROWSER_TYPED_TOOL_NAMES = BROWSER_TOOL_NAMES;
export const BROWSER_PLAN_SAFE_TOOLS = new Set(["browser_capabilities", "browser_list_tabs", "browser_open", "browser_navigate", "browser_snapshot", "browser_screenshot", "browser_wait", "browser_console", "browser_interact", "browser_page", "browser_downloads", "browser_annotations", "browser_webmcp", "browser_dialog"]);

const guidance = "Use browser_snapshot before interaction. Browser results identify the resolved browserId; omit browserId to use this chat's active tab or use an exact ID from browser_list_tabs. Never invent tab IDs. Refs are scoped to browserId and snapshotId; navigation invalidates refs. After a click, use browser_wait or browser_snapshot to observe navigation. After BROWSER_POSSIBLY_APPLIED, snapshot before retrying. Plan mode can inspect but cannot interact, evaluate, or use CDP.";

export function createBrowserTypedTools(broker: BrowserBroker) {
  const tool = (name: string, description: string, execute: (args: any, context: any) => Promise<unknown>) => ({ name, description: `${description} ${guidance}`, planSafe: BROWSER_PLAN_SAFE_TOOLS.has(name), execute });
  const contextFor = (args: any, context: any) => ({ sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args?.browserId, actor: "agent" as const });
  return [
    tool("browser_capabilities", "Inspect the built-in Browser's supported operations and limits before choosing a workflow.", async () => ({ ok: true, capabilities: { backend: "electron-built-in", tools: BROWSER_TOOL_NAMES, interactions: "Playwright locators, nested frames and actionability", screenshots: "real image blocks, crops, full page, PNG/JPEG", developer: "explicit per-site approval; network/performance/CDP events", uploads: "user-selected files only", downloads: "session scratch; 32 MiB limit", externalProfiles: false, webmcp: "feature-detected per document", profile: "shared persistent browser profile; tabs are chat-owned", clipboard: "page keyboard copy/paste; no unrestricted OS clipboard tool" } })),
    tool("browser_list_tabs", "List retained core Browser tabs. This tool never navigates or opens a requested site.", async (_args, context) => ({ ok: true, tabs: broker.listTabs(context.sessionId), sessionId: context.sessionId })),
    tool("browser_open", "Open or reuse the active core Browser tab. Omit url for a blank tab, or supply an HTTP(S) URL to navigate it. Use browser_list_tabs to get the browserId for follow-up tools.", (args, context) => broker.open(args?.url ? { url: String(args.url) } : { url: "about:blank" }, { sessionId: context.sessionId, mode: context.mode, signal: context.signal })),
    tool("browser_navigate", "Always navigate the Browser to the supplied validated URL or workspace file; verify final URL with browser_snapshot before reporting success.", (args, context) => broker.navigate({ url: String(args.url ?? "") }, context.sessionId, { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId })),
    tool("browser_snapshot", "Return the bounded accessibility snapshot and generation metadata.", (_args, context) => broker.snapshot({ sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: _args.browserId })),
    tool("browser_screenshot", "Capture a bounded Browser screenshot and return its saved path with viewport metadata.", (args, context) => broker.screenshot(args ?? {}, context.sessionId, { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args?.browserId })),
    tool("browser_click", "Click a current snapshot ref; Agent-only.", (args, context) => broker.click(String(args.ref ?? args.uid ?? ""), { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId, snapshotId: args.snapshotId }, args.button)),
    tool("browser_fill", "Fill a current snapshot ref; Agent-only.", (args, context) => broker.fill(String(args.ref ?? args.uid ?? ""), String(args.text ?? ""), { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId, snapshotId: args.snapshotId })),
    tool("browser_type", "Type text into a current or focused target; Agent-only.", (args, context) => broker.type(args.ref ?? args.uid, String(args.text ?? ""), Boolean(args.clearFirst), { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId, snapshotId: args.snapshotId })),
    tool("browser_keypress", "Send a bounded keypress; Agent-only.", (args, context) => broker.keypress(args.ref ?? args.uid, String(args.key ?? ""), args.modifiers, { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId, snapshotId: args.snapshotId })),
    tool("browser_wait", "Wait for one bounded URL, text, or page-load condition.", (args, context) => broker.wait(args.condition, { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId }, args.timeoutMs)),
    tool("browser_set_viewport", "Set a bounded desktop/mobile viewport or reset to panel size; Agent-only.", (args, context) => broker.viewport(args, { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId })),
    tool("browser_console", "Read filtered Browser console output with duplicate counts; optionally clear retained messages.", (args, context) => broker.console(args?.limit, contextFor(args, context), args)),
    tool("browser_evaluate", "Evaluate bounded JavaScript; Agent-only.", (args, context) => broker.evaluate(String(args.expression ?? ""), { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId })),
    tool("browser_cdp", "Call one allowlisted CDP method; Agent-only.", (args, context) => broker.cdp(String(args.method ?? ""), args.params, { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId })),
    tool("browser_tabs", "Create, select, close or mark a chat-owned tab as temporary, deliverable or handoff. Create returns its exact ID; navigate it separately.", (args, context) => broker.tabs(args.operation, args, contextFor(args, context))),
    tool("browser_interact", "Use semantic role/name, label, text, placeholder, testId or CSS locators, optionally nested frame selectors. Click/hover/drag/fill/check/select/press auto-wait for actionability. Inspect and wait are Plan-safe. Coordinates are CSS pixels.", (args, context) => broker.interact(args, contextFor(args, context))),
    ...(["dialog", "developer", "events", "downloads", "upload", "page", "annotations", "styles", "webmcp"] as const).map(name => tool(`browser_${name}`, ({
      dialog: "Inspect, accept or dismiss a JavaScript dialog. Acceptance/dismissal require Agent mode.",
      developer: "Request explicit current-site approval for network/performance diagnostics, inspect status or revoke access. Site changes require a new approval.",
      events: "Read bounded Developer events after a cursor, with method filters, historyLost and hasMore. Requires current-site Developer approval.",
      downloads: "List this tab's managed downloads or pause/resume/cancel one by ID. Completed files remain in chat scratch.",
      upload: "Ask the user to select local files, then upload only those files through a locator. The agent cannot choose arbitrary local paths.",
      page: "Read page text and links, inventory assets, save a listed asset or export the page as HTML/text/PDF into chat scratch.",
      annotations: "Start visual element annotation, read selected elements and their CSS rectangles, or clear marks. The user chooses page elements.",
      styles: "Apply or clear a temporary bounded CSS style preview. Navigation removes it; it never edits source files.",
      webmcp: "Feature-detect and list this document's WebMCP tools, or call a listed tool with explicit user approval and matching documentUrl. Unsupported pages report supported=false.",
    })[name], (args, context) => broker.service(name, args, contextFor(args, context)))),
  ];
}
