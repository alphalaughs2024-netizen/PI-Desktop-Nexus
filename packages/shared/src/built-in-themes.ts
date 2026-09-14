/**
 * First-party theme metadata. A scenic theme retains a compatible base palette
 * so native controls and contributed plugin panels can keep using the same
 * light/dark contract as ordinary built-in themes.
 */
export const BUILT_IN_THEMES = [
  { id: "system", base: "system" },
  { id: "light", base: "light" },
  { id: "dark", base: "dark" },
  {
    id: "twilight-mountains",
    base: "dark",
    scenic: true,
    backdropBlur: true,
    nativeFallback: "twilight-mountains",
  },
  {
    id: "alpine-light",
    base: "light",
    scenic: true,
    backdropBlur: true,
    nativeFallback: "alpine-light",
  },
  {
    id: "obsidian-horizon",
    base: "dark",
    scenic: true,
    backdropBlur: true,
    nativeFallback: "obsidian-horizon",
  },
  {
    id: "emerald-afterglow",
    base: "dark",
    scenic: true,
    backdropBlur: true,
    nativeFallback: "emerald-afterglow",
  },
] as const;

export type BuiltInThemeId = (typeof BUILT_IN_THEMES)[number]["id"];
export type ResolvedThemeBase = "system" | "light" | "dark";

export function builtInThemeBase(theme: BuiltInThemeId): ResolvedThemeBase {
  return BUILT_IN_THEMES.find((entry) => entry.id === theme)?.base ?? "system";
}

export function isScenicBuiltInTheme(theme: BuiltInThemeId): boolean {
  return BUILT_IN_THEMES.some(
    (entry) => entry.id === theme && "scenic" in entry && entry.scenic === true,
  );
}

export function builtInThemeMetadata(theme: BuiltInThemeId) {
  return BUILT_IN_THEMES.find((entry) => entry.id === theme);
}

export function supportsScenicBackdropBlur(theme: string): boolean {
  return BUILT_IN_THEMES.some(
    (entry) => entry.id === theme && "backdropBlur" in entry && entry.backdropBlur === true,
  );
}
