import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

export function BrowserCoreTab({ sessionId, location, blocked = false }: { sessionId?: string; location?: string; blocked?: boolean }) {
  const { t } = useTranslation();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<string>("starting");
  useEffect(() => api.onBrowserState((next) => setState(next?.state ?? "starting")), []);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const report = () => { const rect = surface.getBoundingClientRect(); void api.pluginViewSetBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }); };
    const observer = new ResizeObserver(report); observer.observe(surface); report();
    void api.pluginViewSetVisible("pi.browser", "browser", !blocked, sessionId);
    return () => { observer.disconnect(); void api.pluginViewSetVisible("pi.browser", "browser", false, sessionId); };
  }, [blocked, sessionId]);
  return <div className="work-plugin-view browser-core-view" data-browser-readiness={state} data-browser-location={location ?? ""}><div ref={surfaceRef} className="work-plugin-view-surface" aria-label={t("panel.tabs.browser")} /><div className="browser-core-status" role="status">{state === "ready" ? "Browser ready" : state === "loading" ? "Loading page…" : state === "unavailable" ? "Browser unavailable" : "Starting browser…"}</div></div>;
}
