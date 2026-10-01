import type { MessageUsage, UiMessage } from "@pi-desktop/shared";

export const BROWSER_COMPOSER_ACTIONS = [
  "sendPrompt", "abort", "steerPrompt", "steerActiveTurn", "removeQueuedPrompt",
  "sendQueuedNow", "moveQueuedPrompt", "moveQueuedPromptTo", "setQueueingEnabled",
  "editQueuedPrompt", "loadProviderModels", "configureActiveSession", "showToast",
  "clearComposerPrefill", "resolvePlan", "resolveAsk", "openWorkPanelTabForSession",
  "dockWorkPanel", "runPaletteCommand", "materializeDraftSession",
  "openFileInWorkPanel", "openUrlInWorkPanel",
] as const;

export type BrowserComposerAction = typeof BROWSER_COMPOSER_ACTIONS[number];
export type BrowserComposerDraft = {
  text: string;
  fileReferences: { path: string; name: string; kind?: "image" | "file"; mimeType?: string; token?: string }[];
};
export type BrowserComposerSnapshot = {
  generation: number;
  sessionId: string;
  visible: boolean;
  state: Record<string, unknown>;
  draft?: BrowserComposerDraft;
  theme: string;
  font: string;
  scenicTheme?: string;
  styleTokens?: Record<string, string>;
  history?: { title: string; messages: UiMessage[]; truncated: boolean };
  contextUsage?: {
    usage: MessageUsage;
    turnUsage: MessageUsage;
    contextWindow: number;
    tools: UiMessage[];
    responseDurationMs?: number;
    responseOutputTokens?: number;
    responseOutputEstimated: boolean;
  } | null;
};
