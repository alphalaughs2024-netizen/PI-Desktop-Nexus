import type { BrowserBroker } from "./browser-broker";

export const BROWSER_TYPED_TOOL_NAMES = ["browser_list_tabs", "browser_open", "browser_navigate", "browser_snapshot", "browser_screenshot", "browser_click", "browser_fill", "browser_type", "browser_keypress", "browser_wait", "browser_console", "browser_evaluate", "browser_cdp"] as const;
export const BROWSER_PLAN_SAFE_TOOLS = new Set(["browser_list_tabs", "browser_open", "browser_navigate", "browser_snapshot", "browser_screenshot", "browser_wait", "browser_console"]);

const guidance = "Use browser_snapshot before interaction. Refs are scoped to browserId and snapshotId; navigation invalidates refs. After BROWSER_POSSIBLY_APPLIED, snapshot before retrying. Plan mode can inspect but cannot interact, evaluate, or use CDP.";

export function createBrowserTypedTools(broker: BrowserBroker) {
  const tool = (name: string, description: string, execute: (args: any, context: any) => Promise<unknown>) => ({ name, description: `${description} ${guidance}`, planSafe: BROWSER_PLAN_SAFE_TOOLS.has(name), execute });
  return [
    tool("browser_list_tabs", "List the current core Browser tab.", async (_args, context) => ({ ok: true, tabs: broker.listTabs(), sessionId: context.sessionId })),
    tool("browser_open", "Open or reuse the current core Browser tab.", (args, context) => broker.open(args?.url ? { url: String(args.url) } : undefined, { sessionId: context.sessionId, mode: context.mode })),
    tool("browser_navigate", "Navigate the Browser to a validated URL or workspace file.", (args, context) => broker.navigate({ url: String(args.url ?? "") }, context.sessionId, { sessionId: context.sessionId, mode: context.mode, browserId: args.browserId })),
    tool("browser_snapshot", "Return the bounded accessibility snapshot and generation metadata.", (_args, context) => broker.snapshot({ sessionId: context.sessionId, mode: context.mode, browserId: _args.browserId })),
    tool("browser_screenshot", "Capture a bounded Browser screenshot with viewport metadata.", (args, context) => broker.screenshot(args ?? {}, context.sessionId, { sessionId: context.sessionId, mode: context.mode, browserId: args.browserId })),
    tool("browser_click", "Click a current snapshot ref; Agent-only.", (args, context) => broker.click(String(args.ref ?? args.uid ?? ""), { sessionId: context.sessionId, mode: context.mode, browserId: args.browserId })),
    tool("browser_fill", "Fill a current snapshot ref; Agent-only.", (args, context) => broker.fill(String(args.ref ?? args.uid ?? ""), String(args.text ?? ""), { sessionId: context.sessionId, mode: context.mode, browserId: args.browserId })),
    tool("browser_type", "Type text into a current/focused target; Agent-only.", (args, context) => broker.type(args.ref ?? args.uid, String(args.text ?? ""), { sessionId: context.sessionId, mode: context.mode, browserId: args.browserId })),
    tool("browser_keypress", "Send a bounded keypress; Agent-only.", (args, context) => broker.keypress(args.ref ?? args.uid, String(args.key ?? ""), { sessionId: context.sessionId, mode: context.mode, browserId: args.browserId })),
    tool("browser_wait", "Wait for one bounded URL, text, or page-load condition.", (args, context) => broker.wait(args.condition, { sessionId: context.sessionId, mode: context.mode, browserId: args.browserId })),
    tool("browser_console", "Read bounded Browser console output.", (args, context) => broker.console(args?.limit, { sessionId: context.sessionId, mode: context.mode, browserId: args?.browserId })),
    tool("browser_evaluate", "Evaluate bounded JavaScript; Agent-only.", (args, context) => broker.evaluate(String(args.expression ?? ""), { sessionId: context.sessionId, mode: context.mode, browserId: args.browserId })),
    tool("browser_cdp", "Call one allowlisted CDP method; Agent-only.", (args, context) => broker.cdp(String(args.method ?? ""), args.params, { sessionId: context.sessionId, mode: context.mode, browserId: args.browserId })),
  ];
}
