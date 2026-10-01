/** Phase 1 core Browser registration seam. */
import { BROWSER_TOOL_NAMES } from "@pi-desktop/shared";
export const CORE_BROWSER_TOOL_NAME = "Browser" as const;
export const CORE_BROWSER_VIEW_ID = "browser" as const;
export const CORE_BROWSER_CAPABILITY = "browser" as const;
export const CORE_BROWSER_TOOL_NAMES = [CORE_BROWSER_TOOL_NAME, ...BROWSER_TOOL_NAMES] as const;
export function isReservedBrowserTool(name: string): boolean { return (CORE_BROWSER_TOOL_NAMES as readonly string[]).includes(name); }
export function isReservedBrowserView(pluginId: string, viewId: string): boolean { return (pluginId === "pi.browser" && viewId === CORE_BROWSER_VIEW_ID) || viewId === "core://browser"; }
