export type WorkflowWidgetPosition = { x: number; y: number };
export type WorkflowWidgetBounds = { left: number; right: number; top: number; bottom: number };

const STORAGE_KEY = "pi.desktop.workflowWidgetPosition";
export const DEFAULT_WORKFLOW_POSITION: WorkflowWidgetPosition = { x: 1, y: 0 };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function workflowWidgetBounds(
  width: number, height: number, widgetWidth: number, widgetHeight: number, toolbarHeight: number,
): WorkflowWidgetBounds {
  const left = Math.min(12, Math.max(0, width - widgetWidth));
  const top = Math.min(toolbarHeight + 12, Math.max(0, height - widgetHeight));
  return {
    left, top,
    right: Math.max(left, width - widgetWidth - 12),
    bottom: Math.max(top, height - widgetHeight - 12),
  };
}

export function workflowWidgetPoint(position: WorkflowWidgetPosition, bounds: WorkflowWidgetBounds) {
  return {
    left: bounds.left + clamp(position.x, 0, 1) * (bounds.right - bounds.left),
    top: bounds.top + clamp(position.y, 0, 1) * (bounds.bottom - bounds.top),
  };
}

export function workflowWidgetPosition(left: number, top: number, bounds: WorkflowWidgetBounds): WorkflowWidgetPosition {
  return {
    x: bounds.right > bounds.left ? clamp((left - bounds.left) / (bounds.right - bounds.left), 0, 1) : 1,
    y: bounds.bottom > bounds.top ? clamp((top - bounds.top) / (bounds.bottom - bounds.top), 0, 1) : 0,
  };
}

export function readWorkflowWidgetPosition(): WorkflowWidgetPosition {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) {
      return { x: clamp(value.x, 0, 1), y: clamp(value.y, 0, 1) };
    }
  } catch { /* Position is optional when storage is unavailable. */ }
  return DEFAULT_WORKFLOW_POSITION;
}

export function rememberWorkflowWidgetPosition(position: WorkflowWidgetPosition): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(position)); }
  catch { /* Storage failure must not interrupt dragging. */ }
}
