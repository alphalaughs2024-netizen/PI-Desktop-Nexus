import { useEffect, useRef } from "react";
import type { BrowserTab } from "../../lib/browser-tabs";
import { IconClose, IconPlus, IconGlobe } from "../icons";
export function BrowserTabStrip({ tabs, activeId, onActivate, onClose, onNew }: { tabs: BrowserTab[]; activeId: string | null; onActivate: (browserId: string) => void; onClose: (browserId: string) => void; onNew: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const focusTab = (browserId: string) => { window.setTimeout(() => ref.current?.querySelector<HTMLElement>(`[data-browser-tab="${browserId}"]`)?.focus(), 0); };
  const closeActiveTab = () => {
    if (!activeId) return;
    const index = tabs.findIndex((tab) => tab.browserId === activeId);
    const next = tabs[index + 1] ?? tabs[index - 1];
    onClose(activeId);
    if (next) focusTab(next.browserId);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "t") { event.preventDefault(); onNew(); return; }
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
  return <div ref={ref} className="browser-tab-strip" role="tablist" aria-label="Browser tabs">{tabs.map((tab) => <div key={tab.browserId} data-browser-tab={tab.browserId} className={`browser-tab${tab.browserId === activeId ? " is-active" : ""}`} role="tab" aria-selected={tab.browserId === activeId} tabIndex={tab.browserId === activeId ? 0 : -1} onClick={(event) => { (event.currentTarget as HTMLElement).focus(); onActivate(tab.browserId); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActivate(tab.browserId); } else if (event.key === "ArrowRight") { event.preventDefault(); moveFocus(tab.browserId, 1); } else if (event.key === "ArrowLeft") { event.preventDefault(); moveFocus(tab.browserId, -1); } else if (event.key === "Home") { event.preventDefault(); focusEdge("first"); } else if (event.key === "End") { event.preventDefault(); focusEdge("last"); } }}><span className="browser-tab-icon" aria-hidden>{tab.loading ? "◌" : <IconGlobe size={13} />}</span><span className="browser-tab-title" title={tab.title}>{tab.title || "New tab"}</span><button type="button" className="browser-tab-close" aria-label={`Close ${tab.title || "Browser tab"}`} onClick={(event) => { event.stopPropagation(); const index = tabs.findIndex((candidate) => candidate.browserId === tab.browserId); const next = tabs[index + 1] ?? tabs[index - 1]; onClose(tab.browserId); if (next) focusTab(next.browserId); }}><IconClose size={12} /></button></div>)}<button type="button" className="browser-tab-new" aria-label="New Browser tab" title="New Browser tab" onClick={onNew}><IconPlus size={14} /></button></div>;
}
