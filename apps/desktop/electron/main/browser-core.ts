/** Phase 1 core Browser registration seam. */
export const CORE_BROWSER_TOOL_NAME = "Browser" as const;
export const CORE_BROWSER_VIEW_ID = "browser" as const;
export const CORE_BROWSER_CAPABILITY = "browser" as const;
export function isReservedBrowserTool(name: string): boolean { return name === CORE_BROWSER_TOOL_NAME; }
export function isReservedBrowserView(pluginId: string, viewId: string): boolean { return pluginId === "pi.browser" && viewId === CORE_BROWSER_VIEW_ID; }
