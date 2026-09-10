import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/ChatTranscript.tsx", import.meta.url), "utf8");

test("assistant completed-turn controls are absent until the active turn settles", () => {
  assert.match(source, /!editing && \(!isRunning \|\| isUser\) && \(hasAnswer \|\| showRevisionPager\)/);
  assert.match(source, /!isRunning && hasAnswer \? <CopyButton/);
});
