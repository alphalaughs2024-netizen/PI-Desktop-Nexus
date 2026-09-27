import { useEffect, useRef, useState } from "react";
import type { BrowserTab } from "../../lib/browser-tabs";
import { IconClose, IconPlus, IconGlobe } from "../icons";

type ContextMenuState = { browserId: string; left: number; top: number };
export function BrowserTabStrip({ tabs, activeId, onActivate, onClose, onNew, onReload, onDuplicate, onCloseOthers, onContextMenuOpenChange }: { tabs: BrowserTab[]; activeId: string | null; onActivate: (browserId: string) => void; onClose: (browserId: string) => void; onNew: () => void; onReload: (browserId: string) => void; onDuplicate: (browserId: string) => void; onCloseOthers: (browserId: string) => void; onContextMenuOpenChange?: (open: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
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
  }, [activeId, onClose, onNew, onActivate, tabs]);
  useEffect(() => {
    if (!contextMenu) return;
    contextMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const onKey = (event: KeyboardEvent) => { const items = Array.from(contextMenuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []); const index = items.indexOf(document.activeElement as HTMLButtonElement); if (event.key === "Escape") { event.preventDefault(); closeContextMenu(); } else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); } else if (event.key === "Home" || event.key === "End") { event.preventDefault(); (event.key === "Home" ? items[0] : items.at(-1))?.focus(); } };
    const onPointerDown = (event: PointerEvent) => { if (!contextMenuRef.current?.contains(event.target as Node)) closeContextMenu(); };
    window.addEventListener("keydown", onKey); window.addEventListener("pointerdown", onPointerDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onPointerDown); };
  }, [contextMenu]);
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
  return <div ref={ref} className="browser-tab-strip" role="tablist" aria-label="Browser tabs">{tabs.map((tab) => <div key={tab.browserId} data-browser-tab={tab.browserId} className={`browser-tab${tab.browserId === activeId ? " is-active" : ""}`} role="tab" aria-selected={tab.browserId === activeId} aria-haspopup="menu" aria-expanded={contextMenu?.browserId === tab.browserId || undefined} tabIndex={tab.browserId === activeId ? 0 : -1} onContextMenu={(event) => { event.preventDefault(); openContextMenu(tab.browserId, event.clientX, event.clientY); }} onClick={(event) => { (event.currentTarget as HTMLElement).focus(); onActivate(tab.browserId); }} onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); openContextMenu(tab.browserId, rect.left + 8, rect.bottom + 4); } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActivate(tab.browserId); } else if (event.key === "ArrowRight") { event.preventDefault(); moveFocus(tab.browserId, 1); } else if (event.key === "ArrowLeft") { event.preventDefault(); moveFocus(tab.browserId, -1); } else if (event.key === "Home") { event.preventDefault(); focusEdge("first"); } else if (event.key === "End") { event.preventDefault(); focusEdge("last"); } }}><span className="browser-tab-icon" aria-hidden>{tab.loading ? "◌" : <IconGlobe size={13} />}</span><span className="browser-tab-title" title={tab.title}>{tab.title || "New tab"}</span><button type="button" className="browser-tab-close" aria-label={`Close ${tab.title || "Browser tab"}`} onClick={(event) => { event.stopPropagation(); const index = tabs.findIndex((candidate) => candidate.browserId === tab.browserId); const next = tabs[index + 1] ?? tabs[index - 1]; if (tabs.length <= 1) return; onClose(tab.browserId); if (next) focusTab(next.browserId); }}><IconClose size={12} /></button></div>)}<button type="button" className="browser-tab-new" aria-label="New Browser tab" title="New Browser tab" onClick={() => { onNew(); focusLastTab(); }}><IconPlus size={14} /></button>{contextMenu && contextTab && <div ref={contextMenuRef} id="browser-tab-context-menu" className="browser-tab-context-menu" role="menu" aria-label={`Actions for ${contextTab.title || "Browser tab"}`} style={{ left: contextMenu.left, top: contextMenu.top }}><button type="button" role="menuitem" onClick={() => runContextAction(() => { onNew(); focusLastTab(); })}>New tab</button><button type="button" role="menuitem" disabled={!contextTab.url || contextTab.loading} onClick={() => runContextAction(() => onReload(contextTab.browserId))}>Reload tab</button><button type="button" role="menuitem" disabled={!contextTab.url} onClick={() => runContextAction(() => onDuplicate(contextTab.browserId))}>Duplicate tab</button><button type="button" role="menuitem" disabled={tabs.length <= 1} onClick={() => { const id = contextTab.browserId; const index = tabs.findIndex((tab) => tab.browserId === id); const next = tabs[index + 1] ?? tabs[index - 1]; closeContextMenu(false); onClose(id); if (next) focusTab(next.browserId); }}>Close tab</button><button type="button" role="menuitem" disabled={tabs.length <= 1} onClick={() => runContextAction(() => onCloseOthers(contextTab.browserId))}>Close other tabs</button></div>}</div>;
}
