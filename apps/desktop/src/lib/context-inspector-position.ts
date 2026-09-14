export const CONTEXT_INSPECTOR_MARGIN = 16;
export const CONTEXT_INSPECTOR_GAP = 8;

export type ContextInspectorPlacement = { top: number; left: number; maxWidth: number };

export function placeContextInspector({
  trigger, popover, pane, viewport, margin = CONTEXT_INSPECTOR_MARGIN, gap = CONTEXT_INSPECTOR_GAP,
}: {
  trigger: { left: number; top: number; bottom: number };
  popover: { width: number; height: number };
  pane: { left: number; right: number } | null;
  viewport: { width: number; height: number };
  margin?: number;
  gap?: number;
}): ContextInspectorPlacement | null {
  const left = (pane?.left ?? 0) + margin;
  const right = (pane?.right ?? viewport.width) - margin;
  const maxWidth = Math.floor(right - left);
  if (maxWidth <= 0) return null;
  const width = Math.min(popover.width, maxWidth);
  const maximumLeft = Math.max(left, right - width);
  const clampedLeft = Math.min(Math.max(left, trigger.left), maximumLeft);
  const above = trigger.top - popover.height - gap;
  const below = trigger.bottom + gap;
  const maximumTop = Math.max(margin, viewport.height - popover.height - margin);
  const top = above >= margin && above <= maximumTop ? above : below >= margin && below <= maximumTop ? below : Math.min(Math.max(margin, below), maximumTop);
  return { top, left: clampedLeft, maxWidth };
}
