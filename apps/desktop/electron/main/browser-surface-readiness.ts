import type { BrowserViewState } from "@pi-desktop/shared";
import type { BrowserPane } from "./browser-view";

export function resolveBrowserSurfaceReadiness(
  readiness: BrowserViewState["readiness"],
  surface: ReturnType<BrowserPane["surfaceStatus"]>,
): BrowserViewState["readiness"] {
  if (readiness !== "ready") return readiness;
  if (surface.paint === "blank") return "unavailable";
  if (surface.attachment === "attached" && surface.visibility === "visible" && surface.paint === "painted") return "ready";
  return "loading";
}
