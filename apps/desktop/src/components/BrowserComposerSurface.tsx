import { useEffect, useLayoutEffect, useState } from "react";
import { IPC } from "@pi-desktop/shared";
import { BROWSER_COMPOSER_ACTIONS, type BrowserComposerSnapshot, type BrowserComposerDraft } from "../../common/browser-composer";
import { useAppStore } from "../stores/app-store";
import { writeComposerDraft } from "../lib/composer-draft-cache";
import { Composer } from "./Composer";
import { VoiceModeProvider } from "./VoiceConversation";
import { browserComposerRequest } from "../lib/browser-composer-bridge";

export function BrowserComposerSurface() {
  const [snapshot, setSnapshot] = useState<BrowserComposerSnapshot | null>(null);
  useEffect(() => {
    if (!window.piDesktop) return;
    let current: BrowserComposerSnapshot | null = null;
    let disposed = false;
    const apply = (next: BrowserComposerSnapshot | null) => {
      if (!next || disposed || (current && next.generation < current.generation)) return;
      if (next.generation !== current?.generation && next.draft) writeComposerDraft(next.sessionId, next.draft);
      document.documentElement.dataset.theme = next.theme;
      if (next.scenicTheme) document.documentElement.dataset.scenicTheme = next.scenicTheme;
      else delete document.documentElement.dataset.scenicTheme;
      for (const key of Object.keys(current?.styleTokens ?? {})) if (!next.styleTokens?.[key]) document.documentElement.style.removeProperty(key);
      for (const [key, value] of Object.entries(next.styleTokens ?? {})) document.documentElement.style.setProperty(key, value);
      current = next;
      document.documentElement.style.setProperty("--font-sans", next.font);
      useAppStore.setState(next.state);
      setSnapshot(next);
    };
    const actions = Object.fromEntries(BROWSER_COMPOSER_ACTIONS.map(action => [action, (...args: unknown[]) => {
      const result = current?.visible
        ? browserComposerRequest({ kind: "action", action, args, generation: current.generation, sessionId: current.sessionId })
        : Promise.reject(new Error("Browser composer is inactive"));
      // Some existing store commands are fire-and-forget; awaited callers still receive failures.
      void result.catch(() => {});
      return result;
    }]));
    useAppStore.setState(actions);
    const off = window.piDesktop.on(IPC.event.browserComposer, raw => {
      const event = raw as { kind: string; snapshot: BrowserComposerSnapshot; height: number };
      if (event.kind === "reset") { current = null; setSnapshot(null); }
      else if (event.kind === "viewport") document.documentElement.style.setProperty("--browser-composer-window-height", `${event.height}px`);
      else if (event.kind === "snapshot") apply(event.snapshot);
    });
    void browserComposerRequest<BrowserComposerSnapshot>({ kind: "ready" }).then(apply).catch(() => {});
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") { event.preventDefault(); void useAppStore.getState().dockWorkPanel(); } };
    window.addEventListener("keydown", key);
    return () => { disposed = true; off(); window.removeEventListener("keydown", key); };
  }, []);

  useLayoutEffect(() => {
    if (!snapshot?.visible) return;
    let frame = 0;
    let lastHeight = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const elements = document.querySelectorAll<HTMLElement>(".composer-stack, .composer-model-menu, .composer-plus-menu, .composer-permission-menu, .composer-autocomplete, .context-inspector-popover, .overlay, .speech-overlay, .ui-tooltip");
        let top = window.innerHeight;
        for (const element of elements) {
          const rect = element.getBoundingClientRect();
          if (rect.height > 0) top = Math.min(top, rect.top);
        }
        const height = document.querySelector(".overlay") ? Math.max(190, Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--browser-composer-window-height")) - 100) : Math.ceil(window.innerHeight - top + 12);
        if (height === lastHeight) return;
        lastHeight = height;
        void browserComposerRequest({ kind: "height", height, generation: snapshot.generation, sessionId: snapshot.sessionId }).catch(() => {});
      });
    };
    const observer = new ResizeObserver(measure);
    const mutations = new MutationObserver(measure);
    observer.observe(document.getElementById("root")!);
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", measure);
    measure();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect(); window.removeEventListener("resize", measure); };
  }, [snapshot?.generation, snapshot?.visible]);

  const draftChanged = (draft: BrowserComposerDraft) => {
    if (!snapshot?.visible) return;
    void browserComposerRequest({ kind: "draft", draft, generation: snapshot.generation, sessionId: snapshot.sessionId }).catch(() => {});
  };
  const requestAction = <T,>(action: "runPaletteCommand" | "materializeDraftSession", args: unknown[]) =>
    browserComposerRequest<T>({ kind: "action", action, args, generation: snapshot?.generation, sessionId: snapshot?.sessionId });
  return snapshot?.visible ? <VoiceModeProvider><Composer key={`${snapshot.sessionId}:${snapshot.generation}`} onDraftChange={draftChanged} contextUsage={snapshot.contextUsage ?? null}
    executeCommand={commandId => requestAction<void>("runPaletteCommand", [commandId])}
    ensureSession={() => requestAction<string | null>("materializeDraftSession", [])} /></VoiceModeProvider> : null;
}
