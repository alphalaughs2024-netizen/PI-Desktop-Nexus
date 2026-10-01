export const BROWSER_MENU_ICONS = ["external", "copy", "camera", "inspect", "plus", "reload", "duplicate", "close", "close-others"] as const;
export type BrowserMenuIcon = typeof BROWSER_MENU_ICONS[number];
export type BrowserMenuItem = { id: string; label: string; icon: BrowserMenuIcon; disabled?: boolean; danger?: boolean; separatorBefore?: boolean; shortcut?: string };
export type BrowserMenuSnapshot = {
  id: number;
  sessionId: string;
  title: string;
  anchor: { left: number; top: number };
  items: BrowserMenuItem[];
  theme: string;
  scenicTheme?: string;
  styleTokens: Record<string, string>;
};
export type BrowserMenuEvent = { id: number; kind: "action" | "closed"; itemId?: string; restoreFocus?: boolean };
