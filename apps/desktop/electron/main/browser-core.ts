/** Phase 1 core Browser registration seam. */
export const CORE_BROWSER_TOOL_NAME = "Browser" as const;
export const CORE_BROWSER_VIEW_ID = "browser" as const;
export const CORE_BROWSER_CAPABILITY = "browser" as const;
export const CORE_BROWSER_TOOL_NAMES = [CORE_BROWSER_TOOL_NAME, "browser_list_tabs", "browser_open", "browser_navigate", "browser_snapshot", "browser_screenshot", "browser_click", "browser_fill", "browser_type", "browser_keypress", "browser_wait", "browser_console", "browser_evaluate", "browser_cdp"] as const;
export function isReservedBrowserTool(name: string): boolean { return (CORE_BROWSER_TOOL_NAMES as readonly string[]).includes(name); }
export function isReservedBrowserView(pluginId: string, viewId: string): boolean { return (pluginId === "pi.browser" && viewId === CORE_BROWSER_VIEW_ID) || viewId === "core://browser"; }
