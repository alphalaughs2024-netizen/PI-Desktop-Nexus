import type { ThemePreference } from "./types.js";

export type ThemeColorScheme = "light" | "dark";
export type BuiltinThemePreference = Exclude<ThemePreference, `plugin:${string}`>;
export type BuiltinTheme = {
  id: ThemeColorScheme;
  base: ThemeColorScheme;
  windowBackground: string;
};

const BUILTIN_THEME_BY_ID: Record<ThemeColorScheme, BuiltinTheme> = {
  light: { id: "light", base: "light", windowBackground: "#ffffff" },
  dark: { id: "dark", base: "dark", windowBackground: "#181818" },
};

export function isThemeColorScheme(value: unknown): value is ThemeColorScheme {
  return value === "light" || value === "dark";
}

export function isBuiltinThemePreference(value: unknown): value is BuiltinThemePreference {
  return value === "system" || isThemeColorScheme(value);
}

export function builtinWindowBackground(scheme: ThemeColorScheme): string {
  return BUILTIN_THEME_BY_ID[scheme].windowBackground;
}
