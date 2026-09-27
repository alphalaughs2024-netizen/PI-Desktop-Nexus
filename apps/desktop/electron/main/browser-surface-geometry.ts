export type BrowserSurfaceMeasurement = { coordinateSpace: "renderer-viewport-css"; rect: { x: number; y: number; width: number; height: number }; viewport: { width: number; height: number; devicePixelRatio: number }; sessionId?: string; visible: boolean };
export type BrowserRect = { x: number; y: number; width: number; height: number };
export type BrowserSurfaceValidation = { ok: false; reason: "invalid" | "empty"; submitted: BrowserRect };

export function convertBrowserSurfaceMeasurement(measurement: BrowserSurfaceMeasurement, contentBounds: BrowserRect): BrowserRect | BrowserSurfaceValidation {
  // Both getBoundingClientRect and Electron View bounds use device-independent pixels.
  // Content bounds may have a screen offset, while View bounds start at (0, 0).
  const submitted = { ...measurement.rect };
  if (measurement.coordinateSpace !== "renderer-viewport-css" || ![...Object.values(submitted), contentBounds.width, contentBounds.height].every(Number.isFinite)) return { ok: false, reason: "invalid", submitted };
  if (!measurement.visible || submitted.width <= 0 || submitted.height <= 0) return { ok: false, reason: "empty", submitted };
  const x = Math.max(0, submitted.x);
  const y = Math.max(0, submitted.y);
  const right = Math.min(contentBounds.width, submitted.x + submitted.width);
  const bottom = Math.min(contentBounds.height, submitted.y + submitted.height);
  const result = { x: Math.round(x), y: Math.round(y), width: Math.floor(right - x), height: Math.floor(bottom - y) };
  if (result.width <= 0 || result.height <= 0) return { ok: false, reason: "empty", submitted };
  return result;
}
