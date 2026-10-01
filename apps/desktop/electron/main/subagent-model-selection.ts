import type { SubagentModelPin, UserSubagentRecord } from "@pi-desktop/shared";
import { loadSubagentDefinitions } from "@pi-desktop/agent-runtime";
import { setBuiltinSubagentModel } from "./subagent-model-preferences";

type Selection = { id: string; source: "builtin" | "user"; model: SubagentModelPin | null };
type Provider = { id: string; enabled?: boolean; models?: { id: string }[]; defaultModelId?: string };
type Host = { call: <T>(method: string, params?: unknown) => Promise<T> };

export async function saveSubagentModelSelection(dataDir: string, host: Host, payload: Selection): Promise<Selection> {
  if (!payload || typeof payload.id !== "string" || !["builtin", "user"].includes(payload.source)) throw new Error("Invalid subagent model selection");
  const model = payload.model;
  if (model !== null) {
    if (!model || typeof model.providerId !== "string" || typeof model.modelId !== "string" || /[\r\n]/.test(model.providerId + model.modelId)) throw new Error("Invalid model pin");
    const { providers } = await host.call<{ providers: Provider[] }>("providers.list", { includeDisabled: false });
    const provider = providers.find(item => item.id === model.providerId && item.enabled !== false);
    const configured = provider?.models?.some(binding => binding.id === model.modelId) ||
      (!provider?.models?.length && provider?.defaultModelId === model.modelId);
    if (!provider || !configured) throw new Error("Selected provider/model is no longer configured; no fallback selected");
  }
  if (payload.source === "builtin") {
    const { builtins } = await loadSubagentDefinitions(null, { userDocuments: [] });
    if (!builtins.some(item => item.name === payload.id)) throw new Error("Built-in subagent not found");
    setBuiltinSubagentModel(dataDir, payload.id, model);
  } else {
    const result = await host.call<{ subagent: UserSubagentRecord | null }>("agents.setModel", {
      id: payload.id, model: model ? `${model.providerId}/${model.modelId}` : "",
    });
    if (!result.subagent) throw new Error("Subagent not found");
  }
  return payload;
}
