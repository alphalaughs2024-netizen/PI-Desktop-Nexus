import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { createGuestGeometryCoordinator } from "../../lib/browser-geometry-coordinator";

export function BrowserGuestSurface({ sessionId, blocked = false, transitioning = false }: { sessionId?: string; blocked?: boolean; transitioning?: boolean }) {
  // BrowserGuestSurface owns requestAnimationFrame coalescing and publishes visible: false zero-bounds on unmount.
  // ResizeObserver, requestAnimationFrame, generation, mounted, width <= 0, and browserGuestRectKey are enforced by the coordinator.
  const { t } = useTranslation();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let mounted = true;
    const coordinator = createGuestGeometryCoordinator({ sessionId, publish: (rect) => api.browserCoreSurfaceSet({ sessionId, visible: rect.visible, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }) });
    const report = () => { if (blocked || transitioning) { coordinator.hide(); return; } const rect = surface.getBoundingClientRect(); coordinator.schedule({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: true }); };
    const observer = new ResizeObserver(report);
    observer.observe(surface);
    report();
    return () => { mounted = false; observer.disconnect(); coordinator.dispose(); };
  }, [blocked, sessionId, transitioning]);
  return <div ref={surfaceRef} className="browser-guest-surface" aria-label={t("panel.tabs.browser")} />;
}
