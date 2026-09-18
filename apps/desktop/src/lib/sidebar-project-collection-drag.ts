export const PROJECT_COLLECTION_DRAG_ARM_PX = 8;

export function projectCollectionDragShouldArm(
  dx: number,
  dy: number,
  thresholdPx = PROJECT_COLLECTION_DRAG_ARM_PX,
): boolean {
  return Math.hypot(dx, dy) >= thresholdPx;
}

export function projectCollectionInsertAfter(
  clientY: number,
  targetTop: number,
  targetHeight: number,
): boolean {
  return clientY >= targetTop + targetHeight / 2;
}

export function projectCollectionDragCancelled(event: KeyboardEvent): boolean {
  return event.key === "Escape";
}

export const projectReorderShouldArm = projectCollectionDragShouldArm;
