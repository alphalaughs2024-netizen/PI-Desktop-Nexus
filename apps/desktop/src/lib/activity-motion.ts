import type { ToolAction } from "./tool-display";

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
