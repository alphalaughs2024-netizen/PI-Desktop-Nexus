import assert from "node:assert/strict";
import test from "node:test";
import { reasoningIntensity, reasoningColors, REASONING_PALETTES, REASONING_LABELS } from "../src/lib/reasoning-slider.ts";

test("sparse capability ladders use their actual positions without inventing levels", () => {
  assert.equal(reasoningIntensity(["off", "low", "max"], 0), 0);
  assert.equal(reasoningIntensity(["off", "low", "max"], 1), .5);
  assert.equal(reasoningIntensity(["off", "low", "max"], 2), 1);
  assert.equal(reasoningIntensity(["high"], 0), 1);
  assert.equal(reasoningIntensity(["off"], 0), 0);
  assert.equal(reasoningIntensity([], 0), 0);
});

test("all accepted themes produce distinct palette endpoints and readable English labels", () => {
  for (const [theme, palette] of Object.entries(REASONING_PALETTES)) {
    const low = reasoningColors(theme, 0);
    const high = reasoningColors(theme, 1);
    assert.equal(low.from, `rgb(${palette.stops[0].from.join(", ")})`);
    assert.equal(high.to, `rgb(${palette.stops[2].to.join(", ")})`);
    assert.notEqual(low.from, high.from);
    assert.notEqual(high.text, high.to);
  }
  assert.equal(REASONING_LABELS.xhigh, "Extra high");
  assert.equal(reasoningColors("obsidian-horizon", 1).particle, "rgb(255, 248, 238)");
});

test("interpolation clamps endpoints and safely falls back for standard themes", () => {
  assert.deepEqual(reasoningColors("dark", 0), reasoningColors("twilight-mountains", 0));
  assert.deepEqual(reasoningColors("alpine-light", -1), reasoningColors("alpine-light", 0));
  assert.deepEqual(reasoningColors("emerald-afterglow", 2), reasoningColors("emerald-afterglow", 1));
  assert.notEqual(reasoningColors("twilight-mountains", .25).from, reasoningColors("twilight-mountains", 0).from);
});
