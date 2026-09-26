export type WorkPanelPresentation = "docked" | "maximized";
export type WorkPanelTransition = "idle" | "maximizing" | "maximized" | "docking";

export async function commitWorkPanelPresentation({
  reservation,
  isCurrent,
  commit,
}: {
  reservation: Promise<unknown>;
  isCurrent: () => boolean;
  commit: () => void;
}): Promise<boolean> {
  try {
    await reservation;
  } catch {
    return false;
  }
  if (!isCurrent()) return false;
  commit();
  return true;
}

export function isMaximizedPresentation(presentation: WorkPanelPresentation): boolean {
  return presentation === "maximized";
}

export function nextWorkPanelPresentation(
  presentation: WorkPanelPresentation,
  action: "maximize" | "dock",
): WorkPanelPresentation {
  if (action === "maximize") return "maximized";
  return "docked";
}

export function nextWorkPanelTransition(
  presentation: WorkPanelPresentation,
  action: "maximize" | "dock",
): WorkPanelTransition {
  if (action === "maximize" && presentation === "docked") return "maximizing";
  if (action === "dock" && presentation === "maximized") return "docking";
  return presentation === "maximized" ? "maximized" : "idle";
}
