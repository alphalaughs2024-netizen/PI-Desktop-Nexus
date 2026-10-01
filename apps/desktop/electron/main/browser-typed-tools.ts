import type { BrowserBroker } from "./browser-broker";

export const BROWSER_TYPED_TOOL_NAMES = ["browser_list_tabs", "browser_open", "browser_navigate", "browser_snapshot", "browser_screenshot", "browser_click", "browser_fill", "browser_type", "browser_keypress", "browser_wait", "browser_console", "browser_set_viewport", "browser_evaluate", "browser_cdp"] as const;
export const BROWSER_PLAN_SAFE_TOOLS = new Set(["browser_list_tabs", "browser_open", "browser_navigate", "browser_snapshot", "browser_screenshot", "browser_wait", "browser_console"]);

const guidance = "Use browser_snapshot before interaction. Refs are scoped to browserId and snapshotId; navigation invalidates refs. After a click, use browser_wait or browser_snapshot to observe navigation. After BROWSER_POSSIBLY_APPLIED, snapshot before retrying. Plan mode can inspect but cannot interact, evaluate, or use CDP.";

export function createBrowserTypedTools(broker: BrowserBroker) {
  const tool = (name: string, description: string, execute: (args: any, context: any) => Promise<unknown>) => ({ name, description: `${description} ${guidance}`, planSafe: BROWSER_PLAN_SAFE_TOOLS.has(name), execute });
  return [
    tool("browser_list_tabs", "List retained core Browser tabs. This tool never navigates or opens a requested site.", async (_args, context) => ({ ok: true, tabs: broker.listTabs(context.sessionId), sessionId: context.sessionId })),
    tool("browser_open", "Open or reuse the active core Browser tab. Omit url for a blank tab, or supply an HTTP(S) URL to navigate it. Use browser_list_tabs to get the browserId for follow-up tools.", (args, context) => broker.open(args?.url ? { url: String(args.url) } : { url: "about:blank" }, { sessionId: context.sessionId, mode: context.mode, signal: context.signal })),
    tool("browser_navigate", "Always navigate the Browser to the supplied validated URL or workspace file; verify final URL with browser_snapshot before reporting success.", (args, context) => broker.navigate({ url: String(args.url ?? "") }, context.sessionId, { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId })),
    tool("browser_snapshot", "Return the bounded accessibility snapshot and generation metadata.", (_args, context) => broker.snapshot({ sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: _args.browserId })),
    tool("browser_screenshot", "Capture a bounded Browser screenshot and return its saved path with viewport metadata.", (args, context) => broker.screenshot(args ?? {}, context.sessionId, { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args?.browserId })),
    tool("browser_click", "Click a current snapshot ref; Agent-only.", (args, context) => broker.click(String(args.ref ?? args.uid ?? ""), { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId, snapshotId: args.snapshotId })),
    tool("browser_fill", "Fill a current snapshot ref; Agent-only.", (args, context) => broker.fill(String(args.ref ?? args.uid ?? ""), String(args.text ?? ""), { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId, snapshotId: args.snapshotId })),
    tool("browser_type", "Type text into a current or focused target; Agent-only.", (args, context) => broker.type(args.ref ?? args.uid, String(args.text ?? ""), Boolean(args.clearFirst), { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId, snapshotId: args.snapshotId })),
    tool("browser_keypress", "Send a bounded keypress; Agent-only.", (args, context) => broker.keypress(args.ref ?? args.uid, String(args.key ?? ""), args.modifiers, { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId, snapshotId: args.snapshotId })),
    tool("browser_wait", "Wait for one bounded URL, text, or page-load condition.", (args, context) => broker.wait(args.condition, { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId }, args.timeoutMs)),
    tool("browser_set_viewport", "Set a bounded desktop/mobile viewport or reset to panel size; Agent-only.", (args, context) => broker.viewport(args, { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId })),
    tool("browser_console", "Read bounded Browser console output.", (args, context) => broker.console(args?.limit, { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args?.browserId })),
    tool("browser_evaluate", "Evaluate bounded JavaScript; Agent-only.", (args, context) => broker.evaluate(String(args.expression ?? ""), { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId })),
    tool("browser_cdp", "Call one allowlisted CDP method; Agent-only.", (args, context) => broker.cdp(String(args.method ?? ""), args.params, { sessionId: context.sessionId, mode: context.mode, signal: context.signal, browserId: args.browserId })),
  ];
}
