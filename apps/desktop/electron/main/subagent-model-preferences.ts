import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SubagentModelPin } from "@pi-desktop/shared";

type Preferences = Record<string, SubagentModelPin>;

function preferencePath(dataDir: string): string {
  return join(dataDir, "agent-capabilities", "builtin-subagent-models.json");
}

export function builtinSubagentModels(dataDir: string): Preferences {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(preferencePath(dataDir), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("Cannot read saved built-in subagent models", { cause: error });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid built-in subagent model preferences");
  const preferences: Preferences = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || !("providerId" in value) || !("modelId" in value) ||
      typeof value.providerId !== "string" || !value.providerId.trim() || typeof value.modelId !== "string" || !value.modelId.trim()) {
      throw new Error("Invalid saved subagent model: " + id);
    }
    preferences[id] = { providerId: value.providerId, modelId: value.modelId };
  }
  return preferences;
}

export function setBuiltinSubagentModel(dataDir: string, id: string, model: SubagentModelPin | null): void {
  const preferences = builtinSubagentModels(dataDir);
  if (model) preferences[id] = { ...model };
  else delete preferences[id];
  const path = preferencePath(dataDir);
  mkdirSync(join(dataDir, "agent-capabilities"), { recursive: true });
  const temporary = path + ".tmp";
  writeFileSync(temporary, JSON.stringify(preferences, null, 2) + "\n", "utf8");
  renameSync(temporary, path);
}
