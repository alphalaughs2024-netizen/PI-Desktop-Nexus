import type { UiMessage } from "@pi-desktop/shared";
import { getToolAction, getToolDisplayName, getToolSummaryValue, type ToolAction } from "./tool-display.ts";

export type ActivityIconKind =
  | "terminal" | "search" | "delegate" | "completed" | "reasoning"
  | "waiting" | "paused" | "failed" | "file" | "folder" | "edit" | "web" | "tool";

export function toolActivityIcon(action: ToolAction): ActivityIconKind {
  switch (action) {
    case "read": return "file";
    case "list": return "folder";
    case "search": return "search";
    case "write":
    case "edit": return "edit";
    case "run": return "terminal";
    case "fetch": return "web";
    case "fork":
    case "delegate": return "delegate";
    default: return "tool";
  }
}

export function turnActivityIcon(phase: string, action?: ToolAction): ActivityIconKind {
  switch (phase) {
    case "completed": return "completed";
    case "failed": return "failed";
    case "interrupted":
    case "unavailable":
    case "waiting-approval":
    case "waiting-input": return "paused";
    case "reasoning": return "reasoning";
    case "waiting-subagents": return "delegate";
    case "tool": return action ? toolActivityIcon(action) : "tool";
    case "answering": return "edit";
    default: return "waiting";
  }
}

/** Describe reported work without printing a shell executable or raw arguments. */
export function toolProgressDetail(message: Pick<UiMessage, "toolName" | "toolArgs">): string {
  const args = message.toolArgs && typeof message.toolArgs === "object"
    ? message.toolArgs as Record<string, unknown> : {};
  const supplied = [args.description, args.title].find(value => typeof value === "string" && value.trim());
  const summary = supplied ?? (getToolAction(message.toolName) === "run"
    ? getToolDisplayName(message.toolName)
    : typeof args.id === "string" ? args.id : getToolSummaryValue(message.toolName, message.toolArgs));
  const text = String(summary || getToolDisplayName(message.toolName)).replace(/\s+/g, " ").trim();
  return text.length > 100 ? `${text.slice(0, 99).trimEnd()}…` : text;
}
