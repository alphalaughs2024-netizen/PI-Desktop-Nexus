export type BrowserSurfaceMeasurement = { coordinateSpace: "renderer-viewport-css"; rect: { x: number; y: number; width: number; height: number }; viewport: { width: number; height: number; devicePixelRatio: number }; sessionId?: string; visible: boolean };
export type BrowserRect = { x: number; y: number; width: number; height: number };
export type BrowserSurfaceValidation = { ok: false; reason: "invalid" | "empty"; submitted: BrowserRect };

export function convertBrowserSurfaceMeasurement(measurement: BrowserSurfaceMeasurement, contentBounds: BrowserRect, scaleFactor: number): BrowserRect | BrowserSurfaceValidation {
  const submitted = { x: measurement.rect.x * scaleFactor, y: measurement.rect.y * scaleFactor, width: measurement.rect.width * scaleFactor, height: measurement.rect.height * scaleFactor };
  if (![...Object.values(submitted), ...Object.values(contentBounds), scaleFactor].every(Number.isFinite) || scaleFactor <= 0) return { ok: false, reason: "invalid", submitted };
  if (!measurement.visible || submitted.width <= 0 || submitted.height <= 0) return { ok: false, reason: "empty", submitted };
  const x = Math.max(contentBounds.x, submitted.x);
  const y = Math.max(contentBounds.y, submitted.y);
  const right = Math.min(contentBounds.x + contentBounds.width, submitted.x + submitted.width);
  const bottom = Math.min(contentBounds.y + contentBounds.height, submitted.y + submitted.height);
  const result = { x: Math.round(x), y: Math.round(y), width: Math.floor(right - x), height: Math.floor(bottom - y) };
  if (result.width <= 0 || result.height <= 0) return { ok: false, reason: "empty", submitted };
  return result;
}
