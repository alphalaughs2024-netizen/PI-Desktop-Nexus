import type { NexusFeatureFlags } from "./types.js";

/** Stable defaults for the additive Phase 1 diagnostics surfaces. */
export const DEFAULT_NEXUS_FEATURE_FLAGS: Readonly<NexusFeatureFlags> = {
  structuredComposition: true,
  lifecycleTimeline: true,
  lifecyclePersistence: true,
  contextProvenance: true,
  statefulSteering: true,
};

export function normalizeNexusFeatureFlags(
  value: Partial<NexusFeatureFlags> | undefined,
): NexusFeatureFlags {
  return {
    ...DEFAULT_NEXUS_FEATURE_FLAGS,
    ...(value ?? {}),
  };
}
