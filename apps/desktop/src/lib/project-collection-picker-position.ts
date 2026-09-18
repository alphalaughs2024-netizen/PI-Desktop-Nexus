export type ProjectCollectionPickerPlacement = {
  top: number;
  left: number;
  side: "left" | "right";
};

type PlacementInput = {
  anchor: { left: number; right: number; top: number; bottom: number };
  panel: { width: number; height: number };
  viewport: { width: number; height: number };
  protected: { top: number; right: number; bottom: number; left: number };
  preferredSide?: "left" | "right";
  gap?: number;
};

export function placeProjectCollectionPicker({
  anchor,
  panel,
  viewport,
  protected: safe,
  preferredSide = "right",
  gap = 8,
}: PlacementInput): ProjectCollectionPickerPlacement {
  const rightLimit = viewport.width - safe.right;
  const bottomLimit = viewport.height - safe.bottom;
  const rightCandidate = anchor.right + gap;
  const leftCandidate = anchor.left - panel.width - gap;
  const rightFits = rightCandidate + panel.width <= rightLimit;
  const leftFits = leftCandidate >= safe.left;
  const side = preferredSide === "right"
    ? rightFits || !leftFits ? "right" : "left"
    : leftFits || !rightFits ? "left" : "right";
  const rawLeft = side === "right" ? rightCandidate : leftCandidate;
  const maxLeft = Math.max(safe.left, rightLimit - panel.width);
  const left = Math.round(Math.min(Math.max(safe.left, rawLeft), maxLeft));
  const maxTop = Math.max(safe.top, bottomLimit - panel.height);
  const top = Math.round(Math.min(Math.max(safe.top, anchor.top), maxTop));
  return { top, left, side };
}
