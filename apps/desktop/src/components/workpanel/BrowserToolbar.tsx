import { useEffect, useRef, useState } from "react";
import type { BrowserAction, BrowserState } from "@pi-desktop/shared";
import type { WorkPanelPresentation } from "../../lib/work-panel-presentation";
import { api } from "../../lib/api";
import { IconChevronLeft, IconChevronRight, IconRefresh, IconSquare, IconMore } from "../icons";

export function BrowserToolbar({ presentation, browserState, panelState, busy, disabled = false, sessionId, committedLocation, onNavigate, onAction, onScreenshot, onOpenExternal, onCopyLocation, onOpenDiagnostics, onMenuOpenChange }: { presentation: WorkPanelPresentation; browserState: BrowserState | null; panelState: string; busy: boolean; disabled?: boolean; sessionId?: string; committedLocation?: string; onNavigate: (url: string) => Promise<void>; onAction: (action: BrowserAction) => Promise<void>; onScreenshot: () => Promise<void>; onOpenExternal: () => Promise<void>; onCopyLocation: () => Promise<void>; onOpenDiagnostics?: () => void; onMenuOpenChange?: (open: boolean) => void }) {
  // Accessible labels: Go back, Go forward, Reload page, Stop loading, Browser address, Capture screenshot, Open in default browser, More Browser actions.
  const inputRef = useRef<HTMLInputElement | null>(null);
  const addressDirtyRef = useRef(false);
  const [draft, setDraft] = useState(committedLocation ?? browserState?.url ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { onMenuOpenChange?.(menuOpen); return () => onMenuOpenChange?.(false); }, [menuOpen, onMenuOpenChange]);
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef<{ label: string } | null>(null);
  useEffect(() => { if (document.activeElement !== inputRef.current || !addressDirtyRef.current) { addressDirtyRef.current = false; setDraft(committedLocation ?? browserState?.url ?? ""); } }, [browserState?.url, committedLocation]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l" && document.activeElement !== inputRef.current) { event.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  const run = async (label: string, fn: () => Promise<void>) => {
    if (busy || (pendingRef.current && !(label === "stop" && pendingRef.current.label === "navigate"))) return;
    const operation = { label };
    pendingRef.current = operation;
    setPending(label);
    try { await fn(); } finally { if (pendingRef.current === operation) { pendingRef.current = null; setPending(null); } }
  };
  const ready = panelState === "ready" || panelState === "loading";
  const canBack = ready && !busy && !pending && Boolean(browserState?.canGoBack);
  const canForward = ready && !busy && !pending && Boolean(browserState?.canGoForward);
  const loading = Boolean(browserState?.isLoading) || panelState === "loading";
  const canReload = ready && !busy && !pending && !loading;
  const canStop = ready && loading && !busy && (!pending || pending === "navigate");
  const submit = () => { const value = draft.trim(); if (!value) return; addressDirtyRef.current = false; void run("navigate", () => onNavigate(value)); };
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (!menuOpen) return; const first = menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)'); first?.focus(); const key = (event: KeyboardEvent) => { const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []); const index = items.indexOf(document.activeElement as HTMLButtonElement); if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); menuTriggerRef.current?.focus(); } else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const next = items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]; next?.focus(); } else if (event.key === "Home") { event.preventDefault(); items[0]?.focus(); } else if (event.key === "End") { event.preventDefault(); items.at(-1)?.focus(); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [menuOpen]);
  return (
    <div className={`browser-toolbar browser-toolbar--${presentation}`} role="toolbar" aria-label="Browser controls" data-browser-toolbar-disabled={disabled || undefined}>
      <div className="browser-toolbar-actions">
        <button type="button" disabled={!canBack} aria-label="Go back" title="Go back" onClick={() => void run("back", () => onAction("back"))}><IconChevronLeft size={15} /></button>
        <button type="button" disabled={!canForward} aria-label="Go forward" title="Go forward" onClick={() => void run("forward", () => onAction("forward"))}><IconChevronRight size={15} /></button>
        <button type="button" disabled={!canReload && !canStop} aria-label={canStop ? "Stop loading" : "Reload page"} title={canStop ? "Stop loading" : "Reload page"} onClick={() => void run(canStop ? "stop" : "reload", () => onAction(canStop ? "stop" : "reload"))}>{canStop ? <IconSquare size={13} /> : <IconRefresh size={14} />}</button>
      </div>
      <form className="browser-toolbar-address" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <span className="browser-address-site" aria-hidden="true">{draft && draft !== "about:blank" ? "◉" : "⌂"}</span>
        <input ref={inputRef} type="url" aria-label="Browser address" value={draft} spellCheck={false} autoCorrect="off" autoCapitalize="off" placeholder="Enter a URL…" onChange={(event) => { addressDirtyRef.current = true; setDraft(event.target.value); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); addressDirtyRef.current = false; setDraft(committedLocation ?? browserState?.url ?? ""); inputRef.current?.blur(); } }} disabled={disabled || panelState === "starting" || panelState === "unavailable" || panelState === "policy-blocked" || Boolean(pending)} />
      </form>
      <div className="browser-toolbar-overflow">
        <button ref={menuTriggerRef} type="button" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="More Browser actions" title="More Browser actions" onClick={() => setMenuOpen((open) => !open)}><IconMore size={15} /></button>
        {menuOpen && <div ref={menuRef} className="browser-toolbar-menu" role="menu"><button type="button" role="menuitem" disabled={!browserState?.url} onClick={() => { setMenuOpen(false); void onOpenExternal(); }}>Open in default browser</button><button type="button" role="menuitem" disabled={!browserState?.url} onClick={() => { setMenuOpen(false); void onCopyLocation(); }}>Copy safe address</button><button type="button" role="menuitem" disabled={!ready || Boolean(pending)} onClick={() => { setMenuOpen(false); void run("screenshot", onScreenshot); }}>Capture screenshot</button><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenDiagnostics?.(); }}>Diagnostics</button></div>}
      </div>
    </div>
  );
}
