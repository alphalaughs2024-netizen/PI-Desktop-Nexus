import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { browserGuestRectKey, normalizeBrowserGuestRect } from "../../lib/browser-guest-rect";

export function BrowserGuestSurface({ sessionId, blocked = false, transitioning = false }: { sessionId?: string; blocked?: boolean; transitioning?: boolean }) {
  const { t } = useTranslation();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let frame = 0;
    let last = "";
    let generation = 0;
    let mounted = true;
    const report = () => {
      if (blocked || transitioning) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!mounted) return;
        const rect = surface.getBoundingClientRect();
        const visible = !blocked;
        const normalized = normalizeBrowserGuestRect({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible, sessionId });
        if (!normalized) return;
        const key = browserGuestRectKey(normalized);
        if (key === last) return;
        last = key;
        const currentGeneration = generation;
        void api.browserCoreSurfaceSet({ sessionId, visible, bounds: { x: normalized.x, y: normalized.y, width: normalized.width, height: normalized.height } }).then(() => { if (!mounted || currentGeneration !== generation) return; });
      });
    };
    const observer = new ResizeObserver(report);
    observer.observe(surface);
    report();
    generation += 1;
    return () => { mounted = false; generation += 1; cancelAnimationFrame(frame); observer.disconnect(); void api.browserCoreSurfaceSet({ sessionId, visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } }); };
  }, [blocked, sessionId, transitioning]);
  return <div ref={surfaceRef} className="browser-guest-surface" aria-label={t("panel.tabs.browser")} />;
}
