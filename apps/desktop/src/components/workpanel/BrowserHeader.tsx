import { useEffect, useRef, useState } from "react";
import { IconGlobe, IconMore } from "../icons";
import type { BrowserPanelState } from "./BrowserReadinessStrip";

const labels: Record<BrowserPanelState, string> = {
  "no-page": "New tab",
  starting: "Starting",
  ready: "Ready",
  loading: "Loading",
  unavailable: "Unavailable",
  "policy-blocked": "Blocked",
  "debugger-unavailable": "Debugger unavailable",
  closed: "Closed",
};

type BrowserHeaderProps = {
  state: BrowserPanelState;
  hasLocation: boolean;
  recoverable: boolean;
  onOpenDiagnostics: () => void;
  onRetry: () => void;
  onReopen: () => void;
  onCopyLocation: () => void;
  onOpenExternal: () => void;
};

/** The single meaningful Browser identity inside the resource card. */
export function BrowserHeader({ state, hasLocation, recoverable, onOpenDiagnostics, onRetry, onReopen, onCopyLocation, onOpenExternal }: BrowserHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const isClosed = state === "closed";
  const canRetry = recoverable && !isClosed;

  useEffect(() => {
    if (!menuOpen) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        triggerRef.current?.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        (event.key === "Home" ? items[0] : items.at(-1))?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <header className="browser-header">
      <div className="browser-header-identity">
        <span className="browser-header-icon" aria-hidden="true"><IconGlobe size={15} /></span>
        <h1>Browser</h1>
      </div>
      <div className={`browser-header-readiness browser-header-readiness--${state}`}>
        <span className="browser-readiness-dot" aria-hidden="true" title={labels[state]} />
        <span className="sr-only">{labels[state]}</span>
      </div>
      <div className="browser-header-menu-wrap">
      <button ref={triggerRef} type="button" className="browser-header-menu" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Browser options" title="Browser options" onClick={() => setMenuOpen((open) => !open)}>
        <IconMore size={16} />
      </button>
      {menuOpen && <div ref={menuRef} className="browser-header-menu-panel" role="menu" aria-label="Browser options">
        <button type="button" role="menuitem" onClick={() => { closeMenu(); onOpenDiagnostics(); }}>Open Browser diagnostics</button>
        {isClosed ? <button type="button" role="menuitem" onClick={() => { closeMenu(); onReopen(); }}>Reopen Browser</button> : <button type="button" role="menuitem" disabled={!canRetry} onClick={() => { closeMenu(); onRetry(); }}>Retry Browser</button>}
        <button type="button" role="menuitem" disabled={!hasLocation} onClick={() => { closeMenu(); onCopyLocation(); }}>Copy safe address</button>
        <button type="button" role="menuitem" disabled={!hasLocation} onClick={() => { closeMenu(); onOpenExternal(); }}>Open in default browser</button>
      </div>}
      </div>
    </header>
  );
}
