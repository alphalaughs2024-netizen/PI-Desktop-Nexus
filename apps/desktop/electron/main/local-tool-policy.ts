import { BROWSER_PLAN_SAFE_TOOLS } from "./browser-typed-tools";

const PLANNING_GUIDANCE_TOOLS = new Set(["Skill", "Workflow", "BrowserPreview"]);

export function localToolAllowedInMode(toolName: string, mode: "agent" | "plan" | "goal"): boolean {
  return mode === "agent" || PLANNING_GUIDANCE_TOOLS.has(toolName) || BROWSER_PLAN_SAFE_TOOLS.has(toolName);
}
