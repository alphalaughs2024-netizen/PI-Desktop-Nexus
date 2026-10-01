import { useEffect, useRef, useState } from "react";
import { Camera, Code2, Copy, ExternalLink, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { IPC } from "@pi-desktop/shared";
import type { BrowserMenuSnapshot } from "../../common/browser-menu";

const icons = { external: ExternalLink, copy: Copy, camera: Camera, inspect: Code2, plus: Plus, reload: RefreshCw, duplicate: Copy, close: X, "close-others": Trash2 };
export function BrowserMenuSurface() {
  const [snapshot, setSnapshot] = useState<BrowserMenuSnapshot | null>(null);
  const current = useRef(snapshot);
  current.current = snapshot;
  const menu = useRef<HTMLDivElement>(null);
  const request = (kind: "action" | "dismiss", extra: Record<string, unknown> = {}) => {
    const value = current.current;
    if (value) void window.piDesktop?.invoke(IPC.invoke.browserMenu, { kind, id: value.id, sessionId: value.sessionId, ...extra }).catch(() => {});
  };
  useEffect(() => {
    if (!window.piDesktop) return;
    let disposed = false;
    const apply = (next: BrowserMenuSnapshot | null) => {
      if (!next || disposed || (current.current && current.current.id > next.id)) return;
      document.documentElement.dataset.theme = next.theme;
      if (next.scenicTheme) document.documentElement.dataset.scenicTheme = next.scenicTheme;
      else delete document.documentElement.dataset.scenicTheme;
      for (const key of Object.keys(current.current?.styleTokens ?? {})) if (!(key in next.styleTokens)) document.documentElement.style.removeProperty(key);
      for (const [key, value] of Object.entries(next.styleTokens)) document.documentElement.style.setProperty(key, value);
      current.current = next; setSnapshot(next);
    };
    const off = window.piDesktop.on(IPC.event.browserMenu, raw => {
      const event = raw as { kind: string; snapshot: BrowserMenuSnapshot };
      if (event.kind === "snapshot") apply(event.snapshot);
      else if (event.kind === "reset") { current.current = null; setSnapshot(null); }
    });
    void window.piDesktop.invoke<BrowserMenuSnapshot | null>(IPC.invoke.browserMenu, { kind: "ready" }).then(result => { if (result.ok) apply(result.data); }).catch(() => {});
    const blur = () => request("dismiss", { restoreFocus: false });
    window.addEventListener("blur", blur);
    return () => { disposed = true; off(); window.removeEventListener("blur", blur); };
  }, []);
  useEffect(() => { menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }, [snapshot?.id]);
  if (!snapshot) return null;
  return <div ref={menu} className="browser-native-menu" data-browser-menu-id={snapshot.id} role="menu" aria-label={snapshot.title} onKeyDown={event => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); request("dismiss", { restoreFocus: true }); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); }
    else if (event.key === "Home" || event.key === "End") { event.preventDefault(); (event.key === "Home" ? items[0] : items.at(-1))?.focus(); }
  }}>{snapshot.items.map(item => {
    const Icon = icons[item.icon];
    return <button type="button" role="menuitem" key={item.id} disabled={item.disabled} className={`${item.separatorBefore ? "has-separator " : ""}${item.danger ? "is-danger" : ""}`} onClick={() => request("action", { itemId: item.id })}><Icon size={16} aria-hidden="true" /><span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>;
  })}</div>;
}
