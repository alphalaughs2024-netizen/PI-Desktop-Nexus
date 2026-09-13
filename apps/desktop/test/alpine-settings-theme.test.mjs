import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles/alpine-light.css", import.meta.url), "utf8");

test("Alpine Settings uses translucent white glass tiles and themed controls", () => {
  assert.match(styles, /data-scenic-theme="alpine-light"[\s\S]*?\.settings-shell-full/);
  assert.match(styles, /\.settings-shell-full[\s\S]*?\.settings-row[\s\S]*?background:\s*rgba\(/);
  assert.match(styles, /\.settings-shell-full[\s\S]*?\.settings-card-block[\s\S]*?background:/);
  assert.match(styles, /\.settings-shell-full[\s\S]*?\.settings-panel[\s\S]*?background:/);
  assert.match(styles, /\.settings-shell-full[\s\S]*?\.settings-nav[\s\S]*?background:/);
  assert.match(styles, /\.settings-shell-full[\s\S]*?\.btn-primary[\s\S]*?background:/);
  assert.match(styles, /\.settings-shell-full[\s\S]*?\.btn-secondary[\s\S]*?background:/);
  assert.match(styles, /\.settings-shell-full[\s\S]*?\.settings-segment-item\.active[\s\S]*?background:/);
  assert.match(styles, /\.settings-shell-full[\s\S]*?\.field-(?:input|select|textarea)[\s\S]*?background:/);
  assert.match(styles, /prefers-reduced-transparency/);
  assert.match(styles, /\.settings-card-block\s*\{[\s\S]*?background:\s*transparent/);
  assert.doesNotMatch(styles, /:is\(\.settings-card-block,\s*\.settings-panel/);
  assert.match(styles, /provider-list-panel:has\(> \.provider-row-list\)[\s\S]*?background:\s*transparent/);
  assert.match(styles, /model-provider-panel:has\(> \.model-provider-list\)[\s\S]*?background:\s*transparent/);
  assert.match(styles, /settings-panel\.agent-capability-panel[\s\S]*?background:\s*transparent/);
  assert.match(styles, /\.provider-row[\s\S]*?background:\s*rgba\(/);
  assert.match(styles, /\.model-provider-row[\s\S]*?background:\s*rgba\(/);
  assert.match(styles, /\.settings-panel:has\(> \.settings-row\)[\s\S]*?background:\s*transparent/);
  assert.match(styles, /\.settings-panel\.shortcut-map[\s\S]*?background:\s*transparent/);
});
