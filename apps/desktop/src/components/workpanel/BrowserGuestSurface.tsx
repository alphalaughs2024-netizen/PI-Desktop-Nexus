import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

export function BrowserGuestSurface({ sessionId, blocked = false, transitioning = false }: { sessionId?: string; blocked?: boolean; transitioning?: boolean }) {
  const { t } = useTranslation();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let frame = 0;
    let last = "";
    const report = () => {
      if (blocked || transitioning) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = surface.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const visible = !blocked;
        const key = `${rect.x}:${rect.y}:${rect.width}:${rect.height}:${visible}:${sessionId ?? ""}`;
        if (key === last) return;
        last = key;
        void api.browserCoreSurfaceSet({ sessionId, visible, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
      });
    };
    const observer = new ResizeObserver(report);
    observer.observe(surface);
    report();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); void api.browserCoreSurfaceSet({ sessionId, visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } }); };
  }, [blocked, sessionId, transitioning]);
  return <div ref={surfaceRef} className="browser-guest-surface" aria-label={t("panel.tabs.browser")} />;
}
