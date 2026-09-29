import type { Models } from "@earendil-works/pi-ai";
import { clampOpenAIPromptCacheKey } from "@earendil-works/pi-ai/api/openai-prompt-cache";

const KEYED_APIS = new Set(["openai-responses", "openai-codex-responses"]);

/** Compaction uses Models.completeSimple directly, bypassing the turn stream. */
export function withCompactionSessionKey(models: Models, sessionId: string): Models {
  const completeSimple: Models["completeSimple"] = (model, context, options) => {
    if (!KEYED_APIS.has(model.api)) return models.completeSimple(model, context, options);
    const previousOnPayload = options?.onPayload;
    return models.completeSimple(model, context, {
      ...options,
      onPayload: async (payload, requestModel) => {
        const replacement = await previousOnPayload?.(payload, requestModel);
        const body = replacement === undefined ? payload : replacement;
        if (!body || typeof body !== "object" || Array.isArray(body)) return replacement;
        const record = body as Record<string, unknown>;
        if (record.prompt_cache_key != null) return replacement;
        const key = clampOpenAIPromptCacheKey(sessionId);
        return key ? { ...record, prompt_cache_key: key } : replacement;
      },
    });
  };
  return new Proxy(models, {
    get: (target, property, receiver) =>
      property === "completeSimple" ? completeSimple : Reflect.get(target, property, receiver),
  });
}
