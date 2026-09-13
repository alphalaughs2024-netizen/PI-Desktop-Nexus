import { describe, expect, it } from "vitest";
import {
  DEFAULT_TWILIGHT_BACKDROP_BLUR,
  DEFAULT_SCENIC_BACKDROP_BLUR,
  normalizeScenicBackdropBlur,
  normalizeTwilightBackdropBlur,
} from "./types";

describe("Twilight backdrop blur", () => {
  it("defaults missing and invalid values to low", () => {
    expect(DEFAULT_TWILIGHT_BACKDROP_BLUR).toBe("low");
    expect(DEFAULT_SCENIC_BACKDROP_BLUR).toBe("low");
    expect(normalizeTwilightBackdropBlur(undefined)).toBe("low");
    expect(normalizeTwilightBackdropBlur("invalid")).toBe("low");
  });

  it("preserves the supported medium and high values", () => {
    expect(normalizeTwilightBackdropBlur("medium")).toBe("medium");
    expect(normalizeTwilightBackdropBlur("high")).toBe("high");
    expect(normalizeScenicBackdropBlur("medium")).toBe("medium");
  });
});
