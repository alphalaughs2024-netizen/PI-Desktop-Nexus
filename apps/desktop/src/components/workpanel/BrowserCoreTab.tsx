import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import type { WorkPanelPresentation } from "../../lib/work-panel-presentation";

export function BrowserCoreTab({ sessionId, location, blocked = false, presentation = "docked", transitioning = false }: { sessionId?: string; location?: string; blocked?: boolean; presentation?: WorkPanelPresentation; transitioning?: boolean }) {
  const { t } = useTranslation();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<string>("starting");
  useEffect(() => api.onBrowserState((next) => setState(next?.state ?? "starting")), []);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let frame = 0;
    let last = "";
    const report = () => {
      if (transitioning) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = surface.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const key = `${rect.x}:${rect.y}:${rect.width}:${rect.height}:${blocked}`;
        if (key === last) return;
        last = key;
        void api.browserCoreSurfaceSet({ sessionId, visible: !blocked, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
      });
    };
    const observer = new ResizeObserver(report); observer.observe(surface); report();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); void api.browserCoreSurfaceSet({ sessionId, visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } }); };
  }, [blocked, presentation, sessionId, transitioning]);
  return <div className="work-browser-view browser-core-view" data-browser-presentation={presentation} data-browser-readiness={state} data-browser-location={location ?? ""}><div ref={surfaceRef} className="work-browser-view-surface" aria-label={t("panel.tabs.browser")} /><div className="browser-core-status" role="status">{state === "ready" ? "Browser ready" : state === "loading" ? "Loading page…" : state === "unavailable" ? "Browser unavailable" : state === "blocked" ? "Browser capability disabled" : "Starting browser…"}</div></div>;
}
