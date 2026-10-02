import type { ThinkingLevel } from "@pi-desktop/shared";

export const REASONING_LABELS: Record<ThinkingLevel, string> = {
  off: "Off", minimal: "Minimal", low: "Low", medium: "Medium",
  high: "High", xhigh: "Extra high", max: "Max",
};

export function reasoningIntensity(levels: readonly ThinkingLevel[], index: number): number {
  const positive = levels.filter((level) => level !== "off");
  const level = levels[index];
  if (!level || level === "off") return 0;
  return (positive.indexOf(level) + 1) / positive.length;
}

type RGB = readonly [number, number, number];
export interface ReasoningPalette {
  stops: readonly { from: RGB; to: RGB }[];
  text: readonly RGB[];
  particle: RGB;
}

export const REASONING_PALETTES: Record<string, ReasoningPalette> = {
  "twilight-mountains": {
    stops: [{ from: [51,111,224], to: [115,161,251] }, { from: [86,98,238], to: [172,151,255] }, { from: [126,107,248], to: [94,213,239] }],
    text: [[133,180,255], [193,172,255], [131,224,244]], particle: [215,237,255],
  },
  "obsidian-horizon": {
    stops: [{ from: [23,21,20], to: [58,52,47] }, { from: [43,34,28], to: [98,88,79] }, { from: [30,28,26], to: [145,137,128] }],
    text: [[194,183,173], [217,205,192], [241,232,221]], particle: [255,248,238],
  },
  "emerald-afterglow": {
    stops: [{ from: [19,128,133], to: [63,198,179] }, { from: [24,165,142], to: [127,226,176] }, { from: [57,178,139], to: [213,222,139] }],
    text: [[91,215,198], [143,234,188], [220,233,155]], particle: [227,255,215],
  },
  "alpine-light": {
    stops: [{ from: [64,123,225], to: [116,176,233] }, { from: [42,126,221], to: [72,181,215] }, { from: [46,134,204], to: [107,201,223] }],
    text: [[43,93,163], [21,104,151], [14,110,135]], particle: [229,251,255],
  },
};

export function reasoningColors(theme: string, intensity: number) {
  const palette = REASONING_PALETTES[theme] ?? REASONING_PALETTES["twilight-mountains"]!;
  const position = Math.max(0, Math.min(1, intensity)) * 2;
  const first = Math.floor(position);
  const second = Math.min(2, first + 1);
  const blend = (a: RGB, b: RGB) => `rgb(${a.map((value, i) => Math.round(value + (b[i]! - value) * (position - first))).join(", ")})`;
  return {
    from: blend(palette.stops[first]!.from, palette.stops[second]!.from),
    to: blend(palette.stops[first]!.to, palette.stops[second]!.to),
    text: blend(palette.text[first]!, palette.text[second]!),
    particle: `rgb(${palette.particle.join(", ")})`,
  };
}
