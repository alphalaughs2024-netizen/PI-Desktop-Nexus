import {
  fallbackBuiltinDefinitions,
  type SubagentDefinition,
  type UserSubagentRecord,
} from "@pi-desktop/shared";
import { api } from "../../lib/api";

/** User-owned documents plus the builtins currently winning in the Task catalog. */
export type SubagentPageData = {
  owned: UserSubagentRecord[];
  builtins: SubagentDefinition[];
};

export const EMPTY_SUBAGENT_PAGE: SubagentPageData = {
  owned: [],
  builtins: [],
};

/**
 * Settings lists two sources: the writable global registry, and the shipped
 * defaults that `Task` would actually offer. Catalog load failures must not
 * hide the user list, so builtins fall back to the shared preset catalog.
 */
export async function fetchSubagentPageData(): Promise<SubagentPageData> {
  const ownedResult = await api.listUserSubagents({ level: "global" });
  const owned = ownedResult.subagents ?? [];
  const enabledHandles = new Set(owned.filter((row) => row.enabled).map((row) => row.id));
  try {
    const catalog = await api.subagentCatalog();
    return {
      owned,
      builtins: (catalog.subagents ?? []).filter(
        (item) => item.source === "builtin" && !enabledHandles.has(item.name),
      ),
    };
  } catch {
    return {
      owned,
      builtins: fallbackBuiltinDefinitions().filter((item) => !enabledHandles.has(item.name)),
    };
  }
}
