export type BrowserGuestRect = { x: number; y: number; width: number; height: number; visible: boolean; sessionId?: string };

export function normalizeBrowserGuestRect(rect: BrowserGuestRect): BrowserGuestRect | null {
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (values.some((value) => !Number.isFinite(value))) return null;
  const normalized = { ...rect, x: Math.round(rect.x * 2) / 2, y: Math.round(rect.y * 2) / 2, width: Math.round(rect.width * 2) / 2, height: Math.round(rect.height * 2) / 2 };
  if (normalized.visible && (normalized.width <= 0 || normalized.height <= 0)) return null;
  return normalized;
}

export function browserGuestRectKey(rect: BrowserGuestRect): string {
  return `${rect.x}:${rect.y}:${rect.width}:${rect.height}:${rect.visible}:${rect.sessionId ?? ""}`;
}
