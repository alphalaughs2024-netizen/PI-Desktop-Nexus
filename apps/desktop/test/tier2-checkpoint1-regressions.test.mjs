import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");
const runtime = await readFile(new URL("../../../packages/agent-runtime/src/runtime.ts", import.meta.url), "utf8");
const card = await readFile(new URL("../src/components/ActiveWorkflowCard.tsx", import.meta.url), "utf8");
const overlays = await readFile(new URL("../src/styles/overlays.css", import.meta.url), "utf8");
const twilight = await readFile(new URL("../src/styles/twilight-mountains.css", import.meta.url), "utf8");
const scenicThemes = await readFile(new URL("../src/styles/scenic-themes.css", import.meta.url), "utf8");
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

test("active workflow inspection has a dedicated localized surface inside the floating panel", () => {
  assert.match(card, /useTranslation/);
  assert.match(card, /className="active-workflow-body-wrap"/);
  assert.match(card, /t\("workflow\.inspect"\)/);
  assert.match(overlays, /\.active-workflow-body-wrap\s*\{[^}]*min-width:\s*0/);
  assert.match(overlays, /\.active-workflow-actions button\s*\{[\s\S]*?border:/);
  assert.match(
    twilight,
    /\[data-scenic-theme="twilight-mountains"\] \.active-workflow-body[\s\S]*?var\(--twilight-safety-surface\)/,
  );
});

test("active workflow card floats below title chrome with a subtle glass outline in every theme", () => {
  assert.match(
    overlays,
    /\.active-workflow-card\s*\{[^}]*position:\s*absolute/,
  );
  assert.match(overlays, /\.active-workflow-surface\s*\{[^}]*background:\s*var\(--workflow-fill\);[^}]*backdrop-filter:\s*blur\(12px\)/);
  assert.match(
    scenicThemes,
    /\[data-scenic-theme\] \.active-workflow-card\s*\{[^}]*--workflow-fill:\s*rgba/,
  );
});

test("scenic card copy keeps titles and descriptions readable across themes", () => {
  assert.match(scenicThemes, /\.scenic-theme-card-copy\s*\{[\s\S]*?background:\s*rgba\(5, 12, 24, \.62\)/);
  assert.match(scenicThemes, /\.scenic-theme-card-copy strong\s*\{[^}]*color:\s*#f4f8ff/);
  assert.match(scenicThemes, /\.scenic-theme-card-copy span\s*\{[^}]*color:\s*#e7f0ff/);
});
