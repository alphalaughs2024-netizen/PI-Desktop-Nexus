import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lib/prompt-inspector.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../src/components/workpanel/PromptInspectorTab.tsx", import.meta.url), "utf8");

test("P2 prompt inspector uses renderer normalization and human-readable groups", () => {
  assert.match(source, /normalizePromptLifecycle/);
  assert.match(source, /groupPromptLifecycle/);
  assert.match(component, /Turn \$\{group\.ordinal\}/);
  assert.doesNotMatch(component, /Turn \$\{group\.key\}/);
});

test("P2 prompt inspector resolves runtime identity and safe Context Vault summary", () => {
  assert.match(component, /resolvePromptProviderModel/);
  assert.match(component, /safeContextVaultSummary/);
  assert.match(component, /claims included/);
  assert.doesNotMatch(component, /Claim bodies and evidence excerpts are hidden\.<\/small>\s*<button/);
});

test("P2 prompt inspector keeps privacy-safe metadata boundaries", () => {
  assert.match(component, /Copy safe metadata/);
  assert.doesNotMatch(component, /toolArgs|authorization|apiKey|rawPayload/);
});

test("P3 prompt inspector uses briefing canvas, grouped rows, and stepper controls", () => {
  assert.match(component, /prompt-inspector-summary-value/);
  assert.match(component, /Included context/);
  assert.match(component, /Excluded context/);
  assert.match(component, /prompt-inspector-stepper/);
  assert.match(component, /aria-expanded/);
  assert.match(component, /No claims selected/);
});

test("focused fixes keep historical state, compact duration, and semantic routine labels", () => {
  assert.match(source, /if \(args\.running\) return "live"/);
  assert.match(source, /formatPromptDuration/);
  assert.match(source, /Context preparation/);
  assert.match(component, /prompt-inspector-summary-metrics/);
  assert.match(component, /Included in prompt/);
  assert.doesNotMatch(component, /<small>Excluded<\/small>/);
});
