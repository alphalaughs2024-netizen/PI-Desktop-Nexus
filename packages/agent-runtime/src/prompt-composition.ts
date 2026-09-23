import type { PromptCompositionScope, PromptCompositionSnapshot } from "@pi-desktop/shared";

export type PromptSectionInput = {
  id: string;
  source: string;
  scope: PromptCompositionScope;
  content?: string;
  reason?: string;
  reloadTrigger: string;
  sensitive?: boolean;
};

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function composePromptSections(
  inputs: PromptSectionInput[],
  reloadReason: string,
  transform: (prompt: string) => string = (prompt) => prompt,
): { prompt: string; snapshot: PromptCompositionSnapshot } {
  const started = performance.now();
  const sections = inputs.map((input, order) => {
    const content = input.content?.trim() ?? "";
    return {
      id: input.id,
      source: input.source,
      scope: input.scope,
      order,
      included: content.length > 0,
      reason: content ? (input.reason ?? "included") : (input.reason ?? "empty"),
      characters: content.length,
      estimatedTokens: Math.ceil(content.length / 4),
      hash: hashText(content),
      reloadTrigger: input.reloadTrigger,
      sensitive: input.sensitive ?? false,
    };
  });
  const prompt = transform(inputs.map((input) => input.content?.trim()).filter(Boolean).join("\n\n"));
  return {
    prompt,
    snapshot: {
      version: 1,
      hash: hashText(prompt),
      composedAt: Date.now(),
      durationMs: Math.max(0, performance.now() - started),
      characters: prompt.length,
      estimatedTokens: Math.ceil(prompt.length / 4),
      reloadReason,
      sections,
    },
  };
}
