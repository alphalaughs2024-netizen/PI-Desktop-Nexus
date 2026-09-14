import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles/alpine-light.css", import.meta.url), "utf8");

test("Alpine composer uses isolated translucent glass materials", () => {
  assert.match(styles, /data-scenic-theme="alpine-light"[\s\S]*?\.composer-shell/);
  assert.match(styles, /\.composer-shell[\s\S]*?background:\s*var\(--ds-bg-composer\)/);
  assert.match(styles, /\.composer-shell[\s\S]*?border-color:\s*var\(--alpine-luminous-border\)/);
  assert.match(styles, /\.composer-shell[\s\S]*?backdrop-filter:\s*blur\(18px\)/);
  assert.match(styles, /\.composer-input\b[\s\S]*?color:\s*var\(--ds-text-primary\)/);
  assert.match(styles, /\.composer-placeholder\b[\s\S]*?color:\s*(?:var\(--ds-text-secondary\)|rgba\()/);
  assert.match(styles, /\.composer-toolbar\b[\s\S]*?background/);
  assert.match(styles, /\.composer-shell\.is-file-drop-active/);
  assert.doesNotMatch(styles, /:root\[data-scenic-theme="alpine-light"\]\s+(?:button|input|div)\s*\{/);
});
