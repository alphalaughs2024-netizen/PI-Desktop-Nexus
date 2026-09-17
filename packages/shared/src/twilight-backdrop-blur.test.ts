import { describe, expect, it } from "vitest";
import {
  DEFAULT_TWILIGHT_BACKDROP_BLUR,
  DEFAULT_SCENIC_BACKDROP_BLUR,
  normalizeScenicBackdropBlur,
  normalizeTwilightBackdropBlur,
} from "./types";

describe("Twilight backdrop blur", () => {
  it("defaults missing and invalid values to the standard blur", () => {
    expect(DEFAULT_TWILIGHT_BACKDROP_BLUR).toBe("low");
    expect(DEFAULT_SCENIC_BACKDROP_BLUR).toBe(6);
    expect(normalizeTwilightBackdropBlur(undefined)).toBe("low");
    expect(normalizeTwilightBackdropBlur("invalid")).toBe("low");
  });

  it("normalizes scenic blur values to integer pixels", () => {
    expect(normalizeTwilightBackdropBlur("medium")).toBe("medium");
    expect(normalizeTwilightBackdropBlur("high")).toBe("high");
    expect(normalizeScenicBackdropBlur("medium")).toBe(6);
    expect(normalizeScenicBackdropBlur(0)).toBe(0);
    expect(normalizeScenicBackdropBlur(20)).toBe(20);
    expect(normalizeScenicBackdropBlur(21)).toBe(20);
  });
});
