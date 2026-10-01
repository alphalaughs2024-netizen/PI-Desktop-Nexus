import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { useBrowserMenu } from "../../lib/browser-menu";
import type { BrowserTab } from "../../lib/browser-tabs";
import { IconClose, IconGlobe } from "../icons";

type ContextMenuState = { browserId: string; left: number; top: number };
export function BrowserTabStrip({ tabs, activeId, sessionId, enabled = true, onActivate, onClose, onNew, onReload, onDuplicate, onCloseOthers, onContextMenuOpenChange }: { sessionId?: string; enabled?: boolean; tabs: BrowserTab[]; activeId: string | null; onActivate: (browserId: string) => void; onClose: (browserId: string) => void; onNew: () => void; onReload: (browserId: string) => void; onDuplicate: (browserId: string) => void; onCloseOthers: (browserId: string) => void; onContextMenuOpenChange?: (open: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const contextOriginRef = useRef<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  useEffect(() => { onContextMenuOpenChange?.(Boolean(contextMenu)); return () => onContextMenuOpenChange?.(false); }, [contextMenu, onContextMenuOpenChange]);
  const focusTab = (browserId: string) => { window.setTimeout(() => ref.current?.querySelector<HTMLElement>(`[data-browser-tab="${browserId}"]`)?.focus(), 0); };
  const closeActiveTab = () => {
    if (!activeId) return;
    const index = tabs.findIndex((tab) => tab.browserId === activeId);
    const next = tabs[index + 1] ?? tabs[index - 1];
    onClose(activeId);
    if (next) focusTab(next.browserId);
  };
  const focusLastTab = () => window.setTimeout(() => { const items = ref.current?.querySelectorAll<HTMLElement>("[data-browser-tab]"); items?.item(items.length - 1)?.focus(); }, 0);
  const closeContextMenu = (restoreFocus = true) => { const origin = contextOriginRef.current; setContextMenu(null); contextOriginRef.current = null; if (restoreFocus && origin) focusTab(origin); };
  const openContextMenu = (browserId: string, left: number, top: number) => { contextOriginRef.current = browserId; onActivate(browserId); setContextMenu({ browserId, left: Math.max(8, Math.min(left, window.innerWidth - 232)), top: Math.max(8, Math.min(top, window.innerHeight - 220)) }); };
  const runContextAction = (action: () => void) => { const origin = contextOriginRef.current; closeContextMenu(false); action(); if (origin) focusTab(origin); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!enabled || contextMenu) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "t") { event.preventDefault(); onNew(); focusLastTab(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") { event.preventDefault(); closeActiveTab(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key === "Tab" && tabs.length > 1) {
        event.preventDefault();
        const current = Math.max(0, tabs.findIndex((tab) => tab.browserId === activeId));
        const delta = event.shiftKey ? -1 : 1;
        const next = tabs[(current + delta + tabs.length) % tabs.length];
        onActivate(next.browserId);
        focusTab(next.browserId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, onClose, onNew, onActivate, tabs, enabled, contextMenu]);
  const moveFocus = (browserId: string, delta: number) => {
    const index = tabs.findIndex((tab) => tab.browserId === browserId);
    if (index < 0 || tabs.length < 2) return;
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    onActivate(next.browserId);
    focusTab(next.browserId);
  };
  const focusEdge = (edge: "first" | "last") => {
    const next = edge === "first" ? tabs[0] : tabs.at(-1);
    if (!next) return;
    onActivate(next.browserId);
    focusTab(next.browserId);
  };
  const contextTab = tabs.find((tab) => tab.browserId === contextMenu?.browserId);
  useBrowserMenu({
    open: Boolean(contextMenu && contextTab), sessionId, title: `Actions for ${contextTab?.title || "Browser tab"}`,
    anchor: () => ({ left: contextMenu?.left ?? 8, top: contextMenu?.top ?? 8 }),
    triggerContains: target => Boolean(ref.current?.contains(target)),
    items: [
      { id: "new", label: "New tab", icon: "plus", shortcut: "Ctrl+T" },
      { id: "reload", label: "Reload tab", icon: "reload", disabled: !contextTab?.url || contextTab.loading },
      { id: "duplicate", label: "Duplicate tab", icon: "duplicate", disabled: !contextTab?.url },
      { id: "close", label: "Close tab", icon: "close", separatorBefore: true, shortcut: "Ctrl+W" },
      { id: "close-others", label: "Close other tabs", icon: "close-others", disabled: tabs.length <= 1 },
    ],
    onClose: closeContextMenu,
    onSelect: action => {
      if (!contextTab) return;
      if (action === "new") runContextAction(() => { onNew(); focusLastTab(); });
      else if (action === "reload") runContextAction(() => onReload(contextTab.browserId));
      else if (action === "duplicate") runContextAction(() => onDuplicate(contextTab.browserId));
      else if (action === "close-others") runContextAction(() => onCloseOthers(contextTab.browserId));
      else if (action === "close") {
        const index = tabs.findIndex(tab => tab.browserId === contextTab.browserId);
        const next = tabs[index + 1] ?? tabs[index - 1];
        closeContextMenu(false); onClose(contextTab.browserId); if (next) focusTab(next.browserId);
      }
    },
  });
  return <div className="browser-tab-band">
    <div ref={ref} className="browser-tab-strip" role="tablist" aria-label="Browser tabs">
      {tabs.map(tab => <div key={tab.browserId} data-browser-tab={tab.browserId} className={`browser-tab${tab.browserId === activeId ? " is-active" : ""}`} role="tab" aria-selected={tab.browserId === activeId} aria-haspopup="menu" aria-expanded={contextMenu?.browserId === tab.browserId || undefined} tabIndex={tab.browserId === activeId ? 0 : -1}
        onContextMenu={event => { event.preventDefault(); openContextMenu(tab.browserId, event.clientX, event.clientY); }}
        onClick={event => { event.currentTarget.focus(); onActivate(tab.browserId); }}
        onKeyDown={event => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); openContextMenu(tab.browserId, rect.left + 8, rect.bottom + 4); }
          else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActivate(tab.browserId); }
          else if (event.key === "ArrowRight") { event.preventDefault(); moveFocus(tab.browserId, 1); }
          else if (event.key === "ArrowLeft") { event.preventDefault(); moveFocus(tab.browserId, -1); }
          else if (event.key === "Home") { event.preventDefault(); focusEdge("first"); }
          else if (event.key === "End") { event.preventDefault(); focusEdge("last"); }
        }}>
        <span className="browser-tab-icon" aria-hidden>{tab.loading ? <LoaderCircle size={13} className="browser-tab-spinner" /> : <IconGlobe size={13} />}</span>
        <span className="browser-tab-title" title={tab.title}>{tab.title || "New tab"}</span>
        <button type="button" className="browser-tab-close" aria-label={`Close ${tab.title || "Browser tab"}`} onClick={event => { event.stopPropagation(); const index = tabs.findIndex(candidate => candidate.browserId === tab.browserId); const next = tabs[index + 1] ?? tabs[index - 1]; onClose(tab.browserId); if (next) focusTab(next.browserId); }}><IconClose size={12} /></button>
      </div>)}
    </div>
    <button type="button" className="browser-tab-new" aria-label="New Browser tab" title="New Browser tab" onClick={() => { onNew(); focusLastTab(); }}><Plus size={18} /></button>
  </div>;
}
