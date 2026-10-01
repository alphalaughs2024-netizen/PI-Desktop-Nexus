import { useEffect } from "react";
import { IPC } from "@pi-desktop/shared";
import { BROWSER_COMPOSER_ACTIONS, type BrowserComposerSnapshot } from "../../common/browser-composer";
import { materializeDraftSession, useAppStore } from "../stores/app-store";
import { readComposerDraft, writeComposerDraft } from "./composer-draft-cache";
import { latestTurnContextInspector } from "./latest-turn-context";
import { toolTokenUsage } from "./context-usage";
import { runPaletteCommand } from "./commands";

export async function browserComposerRequest<T = unknown>(input: unknown): Promise<T> {
  if (!window.piDesktop) throw new Error("Composer bridge unavailable");
  const result = await window.piDesktop.invoke<T>(IPC.invoke.browserComposer, input);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

export function isBrowserFullView(state: ReturnType<typeof useAppStore.getState>): boolean {
  return state.page === "chat" && state.workPanelOpen && state.workPanelPresentation === "maximized"
    && !(state.subagentPanel && state.subagentPanel.sessionId === state.activeSessionId)
    && state.workPanelTabs.some(tab => tab.id === state.activeWorkPanelTabId && tab.kind === "browser");
}

const fields = [
  "activeSessionId", "settings", "sessions", "workspace", "providers", "providerModels",
  "messages", "runningSessions", "planningStates", "sessionCompactions", "composerPrefill",
  "planCheckpoints", "pendingAsks", "queuedPrompts", "queueingDisabledSessions",
  "draftConfiguration", "latestTurnResults", "pendingPermissions",
] as const;

export function useBrowserComposerBridge(blocked: boolean): void {
  useEffect(() => {
    void browserComposerRequest({ kind: "blocked", blocked }).catch(() => {});
  }, [blocked]);
  useEffect(() => {
    if (!window.piDesktop) return;
    let generation = 0;
    let visible = false;
    let sessionId = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous: ReturnType<typeof useAppStore.getState> | undefined;
    const publish = () => {
      timer = undefined;
      const store = useAppStore.getState();
      if (isBrowserFullView(store) && store.activeSessionId && store.pendingPermissions[store.activeSessionId]?.length) {
        store.dockWorkPanel();
        return;
      }
      const nextVisible = isBrowserFullView(store);
      const nextSession = store.activeSessionId ?? "";
      const changedOwner = nextVisible !== visible || nextSession !== sessionId;
      if (changedOwner) generation++;
      visible = nextVisible; sessionId = nextSession;
      const state: Record<string, unknown> = {};
      for (const key of fields) if (changedOwner || previous?.[key] !== store[key]) state[key] = store[key];
      // Compute whole-turn totals before bounding the input surface's reply data.
      const context = latestTurnContextInspector(store.messages, store.providerModels, store.providers, store.sessionCompactions[nextSession]);
      const contextUsage = context ? { ...context, tools: context.tools.map(tool => ({
        id: tool.id, role: tool.role, content: "", createdAt: tool.createdAt,
        toolName: tool.toolName, toolDurationMs: tool.toolDurationMs, toolUsage: toolTokenUsage(tool),
      })) } : null;
      if (state.messages) state.messages = store.messages.slice(-8).map(message => ({ ...message, content: message.role === "assistant" ? message.content.slice(-12000) : "", thinking: "", execution: undefined, attachments: undefined, toolArgs: undefined, toolResult: undefined }));
      const computed = getComputedStyle(document.documentElement);
      const styleTokens = Object.fromEntries(Array.from(computed).filter(key => /^(--ds-|--scenic-|--font-)/.test(key)).map(key => [key, computed.getPropertyValue(key)]));
      const snapshot: BrowserComposerSnapshot = {
        generation, sessionId, visible, state,
        ...(changedOwner && visible ? { draft: readComposerDraft(sessionId) ?? { text: "", fileReferences: [] } } : {}),
        theme: document.documentElement.dataset.theme ?? "dark",
        font: computed.getPropertyValue("--font-sans"),
        scenicTheme: document.documentElement.dataset.scenicTheme,
        styleTokens,
        contextUsage,
      };
      void browserComposerRequest({ kind: "snapshot", snapshot }).catch(() => {
        if (visible && generation === snapshot.generation) {
          store.dockWorkPanel();
          store.showToast("Browser Full view could not open its composer", { variant: "error" });
        }
      });
      previous = store;
    };
    const unsubscribe = useAppStore.subscribe(store => {
      if (!previous || isBrowserFullView(store) !== visible || (store.activeSessionId ?? "") !== sessionId) {
        if (timer) clearTimeout(timer);
        publish();
      } else if (visible && fields.some(key => previous?.[key] !== store[key]) && !timer) {
        timer = setTimeout(publish, 80);
      }
    });
    const bridge = window.piDesktop;
    const off = bridge.on(IPC.event.browserComposer, async (raw) => {
      const input = raw as any;
      const store = useAppStore.getState();
      if (input.kind === "failed") { store.dockWorkPanel(); store.showToast("The floating composer stopped. Your chat is still available.", { variant: "error" }); return; }
      if (input.kind === "toggle-full-view") { if (store.workPanelPresentation === "maximized") store.dockWorkPanel(); else store.maximizeWorkPanel(); return; }
      if (!visible || input.generation !== generation || input.sessionId !== sessionId) {
        if (input.kind === "action") await browserComposerRequest({ kind: "result", id: input.id, error: "Browser composer session changed; the action was not run" });
        return;
      }
      if (input.kind === "draft") { writeComposerDraft(sessionId, input.draft); return; }
      if (input.kind !== "action" || !BROWSER_COMPOSER_ACTIONS.includes(input.action)) return;
      try {
        const actionName = input.action as typeof BROWSER_COMPOSER_ACTIONS[number];
        const action = actionName === "runPaletteCommand" ? runPaletteCommand
          : actionName === "materializeDraftSession" ? materializeDraftSession
          : store[actionName];
        const value = await (action as (...args: any[]) => unknown)(...input.args);
        await browserComposerRequest({ kind: "result", id: input.id, value });
      } catch (error) {
        await browserComposerRequest({ kind: "result", id: input.id, error: error instanceof Error ? error.message : String(error) });
      }
    });
    publish();
    return () => { unsubscribe(); off(); if (timer) clearTimeout(timer); };
  }, []);
}
