import assert from "node:assert/strict";
import { test } from "vitest";
import { catalogs, en } from "../src/index.ts";

test("execution progress states have translated labels with matching placeholders", () => {
  const keys = Object.keys(en.chat.execution).sort();
  for (const [locale, catalog] of Object.entries(catalogs)) {
    assert.deepEqual(Object.keys(catalog.chat.execution).sort(), keys, locale);
    for (const key of keys) {
      const copy = catalog.chat.execution[key];
      assert.equal(typeof copy, "string");
      assert.ok(copy.trim(), `${locale}:${key}`);
      assert.deepEqual(copy.match(/{{[^}]+}}/g) ?? [], en.chat.execution[key].match(/{{[^}]+}}/g) ?? []);
    }
  }
});
