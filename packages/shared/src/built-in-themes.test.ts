import { describe, expect, it } from "vitest";
import {
  BUILT_IN_THEMES,
  builtInThemeBase,
  isScenicBuiltInTheme,
} from "./built-in-themes.js";

describe("built-in themes", () => {
  it("keeps Twilight Mountains opt-in while resolving it against the dark base", () => {
    expect(BUILT_IN_THEMES.map((theme) => theme.id)).toEqual([
      "system",
      "light",
      "dark",
      "twilight-mountains",
      "alpine-light",
      "obsidian-horizon",
      "emerald-afterglow",
    ]);
    expect(builtInThemeBase("twilight-mountains")).toBe("dark");
    expect(isScenicBuiltInTheme("twilight-mountains")).toBe(true);
    expect(isScenicBuiltInTheme("dark")).toBe(false);
    expect(builtInThemeBase("alpine-light")).toBe("light");
    expect(isScenicBuiltInTheme("alpine-light")).toBe(true);
    expect(builtInThemeBase("obsidian-horizon")).toBe("dark");
    expect(isScenicBuiltInTheme("obsidian-horizon")).toBe(true);
    expect(builtInThemeBase("emerald-afterglow")).toBe("dark");
    expect(isScenicBuiltInTheme("emerald-afterglow")).toBe(true);
  });
});
