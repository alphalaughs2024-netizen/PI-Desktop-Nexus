import { bindingFromModelInfo, type ModelInfo, type ModelBinding } from "@pi-desktop/shared";

const NON_CHAT = /(embed|rerank|moderation|whisper|tts|transcri|audio|realtime|speech|image|dall-e|imagen|ocr|guard|deep-research|computer-use)/i;

export function recommendChatModels(models: readonly ModelInfo[]): ModelBinding[] {
  const candidates = models.filter((model) =>
    model.status !== "deprecated" &&
    model.toolCall !== false &&
    (!model.modalities?.output || model.modalities.output.includes("text")) &&
    !NON_CHAT.test(model.modelId),
  );
  if (!candidates.length) return [];
  if (!candidates.some((model) => model.catalogSource === "models.dev")) {
    return [bindingFromModelInfo(candidates[0])];
  }
  const ranked = [...candidates].sort((left, right) => {
    const penalty = (model: ModelInfo) =>
      (model.toolCall === true ? 0 : 1) +
      ((model.cost?.output ?? 0) > 100 ? 4 : 0) +
      (model.experimental || model.status === "beta" || model.status === "alpha" ? 2 : 0);
    const difference = penalty(left) - penalty(right);
    if (difference) return difference;
    return (right.releaseDate ?? right.lastUpdated ?? "").localeCompare(left.releaseDate ?? left.lastUpdated ?? "");
  });
  const picked: ModelBinding[] = [];
  const families = new Set<string>();
  for (const model of ranked) {
    const family = (model.family ?? model.modelId).toLowerCase();
    if (families.has(family)) continue;
    families.add(family);
    picked.push(bindingFromModelInfo(model));
    if (picked.length === 3) break;
  }
  return picked;
}
