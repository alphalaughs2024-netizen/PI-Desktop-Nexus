export type BrowserViewport = { reset: true } | { width: number; height: number; mobile: boolean; reset?: false };
export type BrowserViewportMode = "panel" | "desktop" | "mobile";

export const BROWSER_VIEWPORTS: Record<BrowserViewportMode, BrowserViewport> = {
  panel: { reset: true },
  desktop: { width: 1440, height: 900, mobile: false },
  mobile: { width: 390, height: 844, mobile: true },
};

export function browserViewportMode(value: BrowserViewport | null): BrowserViewportMode | "custom" | null {
  if (!value) return null;
  if (value.reset) return "panel";
  if (value.width === 1440 && value.height === 900 && !value.mobile) return "desktop";
  if (value.width === 390 && value.height === 844 && value.mobile) return "mobile";
  return "custom";
}
