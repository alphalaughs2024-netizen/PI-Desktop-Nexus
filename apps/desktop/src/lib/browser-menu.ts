import { useEffect, useRef } from "react";
import { IPC } from "@pi-desktop/shared";
import type { BrowserMenuEvent, BrowserMenuItem, BrowserMenuSnapshot } from "../../common/browser-menu";

let nextMenu = 0;
export function useBrowserMenu(options: {
  open: boolean; sessionId?: string; title: string; items: BrowserMenuItem[];
  anchor: () => { left: number; top: number };
  triggerContains: (target: Node) => boolean;
  onSelect: (id: string) => void;
  onClose: (restoreFocus: boolean) => void;
}): void {
  const latest = useRef(options);
  latest.current = options;
  const items = JSON.stringify(options.items);
  useEffect(() => {
    if (!options.open || !window.piDesktop) return;
    const id = ++nextMenu;
    const bridge = window.piDesktop;
    let disposed = false;
    const style = getComputedStyle(document.documentElement);
    const snapshot: BrowserMenuSnapshot = {
      id, sessionId: options.sessionId ?? "", title: options.title,
      anchor: latest.current.anchor(), items: JSON.parse(items),
      theme: document.documentElement.dataset.theme ?? "dark",
      scenicTheme: document.documentElement.dataset.scenicTheme,
      styleTokens: Object.fromEntries(Array.from(style).filter(key => /^(--ds-|--browser-|--font-)/.test(key)).map(key => [key, style.getPropertyValue(key)])),
    };
    const off = bridge.on(IPC.event.browserMenu, (raw) => {
      const event = raw as BrowserMenuEvent;
      if (disposed || event.id !== id || !latest.current.open || (latest.current.sessionId ?? "") !== snapshot.sessionId) return;
      if (event.kind === "action" && event.itemId) latest.current.onSelect(event.itemId);
      else if (event.kind === "closed") latest.current.onClose(event.restoreFocus === true);
    });
    const close = () => latest.current.onClose(false);
    const outside = (event: PointerEvent) => { if (!latest.current.triggerContains(event.target as Node)) close(); };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    void bridge.invoke<{ ok: boolean }>(IPC.invoke.browserMenu, { kind: "show", snapshot }).then(result => {
      if (!disposed && !result.ok) close();
    }).catch(() => { if (!disposed) close(); });
    return () => {
      disposed = true; off();
      window.removeEventListener("pointerdown", outside); window.removeEventListener("resize", close);
      void bridge.invoke(IPC.invoke.browserMenu, { kind: "close", id }).catch(() => {});
    };
  }, [options.open, options.sessionId, options.title, items]);
}
