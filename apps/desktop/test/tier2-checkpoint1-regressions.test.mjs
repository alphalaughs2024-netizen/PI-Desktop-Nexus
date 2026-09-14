import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");
const runtime = await readFile(new URL("../../../packages/agent-runtime/src/runtime.ts", import.meta.url), "utf8");
const card = await readFile(new URL("../src/components/ActiveWorkflowCard.tsx", import.meta.url), "utf8");
const overlays = await readFile(new URL("../src/styles/overlays.css", import.meta.url), "utf8");
const twilight = await readFile(new URL("../src/styles/twilight-mountains.css", import.meta.url), "utf8");
const responsePatch = await readFile(
  new URL("../../../patches/@earendil-works__pi-ai@0.85.1.patch", import.meta.url),
  "utf8",
);

test("queued prompts are rechecked after durable turn settlement", () => {
  const start = main.indexOf("function finishTurn(");
  const end = main.indexOf("async function finishApprovedExecution(", start);
  const finishTurn = main.slice(start, end);

  assert.match(finishTurn, /const releaseFinalization = \(\) => \{/);
  assert.match(finishTurn, /agentHostBridge\?\.agentHost\.kick\(sessionId\)/);
  assert.match(
    main,
    /isSessionBusy: \(sessionId\) =>\s*activeTurns\.has\(sessionId\) \|\| turnFinalizations\.has\(sessionId\)/,
  );
});

test("failed compaction retains recoverable user context and carried summaries", () => {
  assert.match(runtime, /function stripCompactionFallbackNotice\(/);
  assert.match(runtime, /const retainedTail =\s*preparation\.retainedTail\.length > 0\s*\? preparation\.retainedTail\s*: selectRetainedUserMessages\(/);
  assert.match(runtime, /const previousSummary = stripCompactionFallbackNotice\(\s*prepared\.value\.previousSummary,\s*\)/);
  assert.match(runtime, /previousSummary:\s*stripCompactionFallbackNotice\(terminal\.summary\)/);
});

test("Responses stream patch stops consuming after a terminal event", () => {
  assert.match(responsePatch, /response\.completed[\s\S]*?response\.incomplete[\s\S]*?(?:return|break);/);
});

test("active workflow inspection has a dedicated, localized, full-width surface", () => {
  assert.match(card, /useTranslation/);
  assert.match(card, /className="active-workflow-body-wrap"/);
  assert.match(card, /t\("workflow\.inspect"\)/);
  assert.match(overlays, /\.active-workflow-body-wrap\s*\{[\s\S]*?flex-basis:\s*100%/);
  assert.match(overlays, /\.active-workflow-actions button\s*\{[\s\S]*?border:/);
  assert.match(
    twilight,
    /\[data-scenic-theme="twilight-mountains"\] \.active-workflow-body[\s\S]*?var\(--twilight-safety-surface\)/,
  );
});

test("active workflow card has a visible border in every base theme", () => {
  assert.match(
    overlays,
    /\.active-workflow-card\s*\{[\s\S]*?border:\s*1px solid var\(--ds-border-default, var\(--ds-border-subtle\)\)/,
  );
  assert.match(overlays, /\.active-workflow-card\s*\{[\s\S]*?background:\s*var\(--ds-bg-secondary\)/);
});
