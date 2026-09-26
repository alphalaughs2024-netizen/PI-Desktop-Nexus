export type BrowserSurfaceMeasurement = {
  coordinateSpace: "renderer-viewport-css";
  rect: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number; devicePixelRatio: number };
  sessionId?: string;
  visible: boolean;
};

export function createBrowserSurfaceMeasurement(rect: DOMRect, sessionId?: string, visible = true): BrowserSurfaceMeasurement | null {
  const viewport = { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 };
  if (![rect.x, rect.y, rect.width, rect.height, viewport.width, viewport.height, viewport.devicePixelRatio].every(Number.isFinite)) return null;
  if (visible && (rect.width <= 0 || rect.height <= 0)) return null;
  return { coordinateSpace: "renderer-viewport-css", rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, viewport, sessionId, visible };
}
