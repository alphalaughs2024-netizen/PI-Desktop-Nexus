import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Maximize2 } from "lucide-react";
import { IPC } from "@pi-desktop/shared";
import { BROWSER_COMPOSER_ACTIONS, type BrowserComposerSnapshot, type BrowserComposerDraft } from "../../common/browser-composer";
import { useAppStore } from "../stores/app-store";
import { writeComposerDraft } from "../lib/composer-draft-cache";
import { Composer } from "./Composer";
import { VoiceModeProvider } from "./VoiceConversation";
import { browserComposerRequest } from "../lib/browser-composer-bridge";
import { Markdown } from "./Markdown";

export function BrowserComposerSurface() {
  const [snapshot, setSnapshot] = useState<BrowserComposerSnapshot | null>(null);
  const [historyHeight, setHistoryHeight] = useState(0);
  const [windowHeight, setWindowHeight] = useState(800);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const resizeHandleRef = useRef<HTMLDivElement | null>(null);
  const lastOpenHeight = useRef(320);
  const pinned = useRef(true);
  const resize = useRef<{ screenY: number; height: number; pointerId: number } | null>(null);
  const stopResizing = useCallback(() => {
    const pointerId = resize.current?.pointerId;
    resize.current = null;
    if (conversationRef.current) delete conversationRef.current.dataset.resizing;
    if (pointerId !== undefined && resizeHandleRef.current?.hasPointerCapture(pointerId)) resizeHandleRef.current.releasePointerCapture(pointerId);
  }, []);
  const maxHistory = Math.max(0, Math.min(560, windowHeight - 340));
  const displayedHeight = Math.min(historyHeight, maxHistory);
  if (displayedHeight) lastOpenHeight.current = displayedHeight;
  const retainedHeight = Math.min(lastOpenHeight.current, maxHistory);
  const changeHeight = (value: number) => setHistoryHeight(Math.max(0, Math.min(value, maxHistory)));
  useEffect(() => {
    const collapse = () => { stopResizing(); setHistoryHeight(0); };
    const outside = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(".browser-floating-shell, .overlay, .speech-overlay, .ui-tooltip")) collapse();
    };
    window.addEventListener("blur", collapse);
    window.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("blur", collapse); window.removeEventListener("pointerdown", outside); };
  }, [stopResizing]);
  useLayoutEffect(() => { stopResizing(); pinned.current = true; setHistoryHeight(0); }, [snapshot?.sessionId, snapshot?.visible, stopResizing]);
  useLayoutEffect(() => {
    const element = historyRef.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [snapshot?.history, displayedHeight]);
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
      else if (event.kind === "collapse-history") { stopResizing(); setHistoryHeight(0); }
      else if (event.kind === "viewport") { document.documentElement.style.setProperty("--browser-composer-window-height", `${event.height}px`); setWindowHeight(event.height); }
      else if (event.kind === "snapshot") apply(event.snapshot);
    });
    void browserComposerRequest<BrowserComposerSnapshot>({ kind: "ready" }).then(apply).catch(() => {});
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") { event.preventDefault(); void useAppStore.getState().dockWorkPanel(); } };
    window.addEventListener("keydown", key);
    return () => { disposed = true; off(); window.removeEventListener("keydown", key); };
  }, [stopResizing]);

  useLayoutEffect(() => {
    if (!snapshot?.visible) return;
    let frame = 0;
    let lastHeight = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const elements = document.querySelectorAll<HTMLElement>(".browser-floating-shell, .composer-stack, .composer-model-menu, .composer-actions-menu, .composer-plus-menu, .composer-permission-menu, .composer-autocomplete, .context-inspector-popover, .overlay, .speech-overlay, .ui-tooltip");
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
    const shell = document.querySelector('.browser-floating-shell');
    if (shell) observer.observe(shell);
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
  return snapshot?.visible ? <VoiceModeProvider><div className="browser-floating-shell" onPointerDownCapture={event => {
    if ((event.target as HTMLElement).closest(".composer-dock") && !displayedHeight) { pinned.current = true; changeHeight(Math.min(320, maxHistory)); }
  }} onFocusCapture={event => {
    if ((event.target as HTMLElement).closest('.composer-input[contenteditable="true"]') && !displayedHeight) { pinned.current = true; changeHeight(Math.min(320, maxHistory)); }
  }}>
    <div ref={conversationRef} className="browser-floating-conversation" style={{ height: displayedHeight ? displayedHeight + 44 : 0 }} inert={!displayedHeight} aria-hidden={!displayedHeight}>
    <div ref={resizeHandleRef} className="browser-floating-resize" role="separator" aria-label="Resize floating chat" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={maxHistory} aria-valuenow={displayedHeight} tabIndex={0}
      onPointerDown={event => { if (event.button !== 0) return; resize.current = { screenY: event.screenY, height: displayedHeight, pointerId: event.pointerId }; if (conversationRef.current) conversationRef.current.dataset.resizing = "true"; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }}
      onPointerMove={event => { const drag = resize.current; if (drag?.pointerId === event.pointerId) changeHeight(drag.height + drag.screenY - event.screenY); }}
      onPointerUp={stopResizing}
      onPointerCancel={stopResizing} onLostPointerCapture={stopResizing}
      onKeyDown={event => { if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) { event.preventDefault(); changeHeight(event.key === "Home" ? 0 : event.key === "End" ? maxHistory : displayedHeight + (event.key === "ArrowUp" ? 40 : -40)); } }}><span /></div>
    <header className="browser-floating-heading">
      <button type="button" title={displayedHeight ? "Collapse conversation" : "Expand conversation"} aria-label={displayedHeight ? "Collapse conversation" : "Expand conversation"} aria-expanded={displayedHeight > 0} aria-controls="browser-floating-history" onClick={() => { pinned.current = true; changeHeight(displayedHeight ? 0 : Math.min(320, maxHistory)); }}>{displayedHeight ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>
      <span title={snapshot.history?.title}>{snapshot.history?.title ?? "Chat"}</span>
      <button type="button" title="Open full chat" aria-label="Open full chat" onClick={() => void useAppStore.getState().dockWorkPanel()}><Maximize2 size={16} /></button>
    </header>
    <div id="browser-floating-history" className="browser-floating-history" ref={historyRef} style={{ height: retainedHeight }} role="region" aria-label="Current conversation" onScroll={event => { const element = event.currentTarget; pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 32; }}>
      {snapshot.history?.truncated && <button type="button" className="browser-floating-earlier" onClick={() => void useAppStore.getState().dockWorkPanel()}>Earlier messages</button>}
      {snapshot.history?.messages.map(message => <article key={message.id} className={`browser-floating-message browser-floating-message--${message.role}`} aria-label={message.role === "user" ? "You" : "Assistant"}>{message.role === "user" ? <p>{message.content}</p> : <div className="markdown"><Markdown source={message.content} renderDiagrams={false} /></div>}</article>)}
    </div>
    </div>
    <Composer compactModelSelector key={`${snapshot.sessionId}:${snapshot.generation}`} onDraftChange={draftChanged} contextUsage={snapshot.contextUsage ?? null}
    executeCommand={commandId => requestAction<void>("runPaletteCommand", [commandId])}
    ensureSession={() => requestAction<string | null>("materializeDraftSession", [])} />
  </div></VoiceModeProvider> : null;
}
