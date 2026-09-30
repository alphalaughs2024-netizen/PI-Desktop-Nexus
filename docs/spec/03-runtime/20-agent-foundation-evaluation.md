# Agent foundation evaluation

Status: Developer-only evaluation; production runtime unchanged.
Related: [ADR 0251](../../adr/0251-isolated-agent-foundation-evaluation.md).

## Purpose and boundaries

Evaluate Codex app-server, OpenCode, and pi before selecting one production
engine. Preserve Nexus's visual design. Treat the current Nexus integration as
an independent baseline. No old-chat migration, Context Vault, or Prompt
Inspector integration is required for the future rebuild.

The harness is a standalone Windows developer prototype, not an alternate Nexus
renderer. Its dashboard is a test instrument. Production themes and layout are
unchanged. It must not be described as the finished rebuilt app.

## Execution and profiles

`node scripts/agent-evaluation/cli.mjs doctor` validates installed versions.
`run --engine <codex|opencode|pi>` exercises a real engine against a local fixture.
`serve` opens a loopback dashboard. `--allow-cloud` explicitly enables xkiro
requests; otherwise the cloud option is disabled. Cloud model selection must
pass the current catalog's free-tier, zero-price, and tool-support checks.

Profiles, disposable workspaces, native histories, and evidence files reside
under `%LOCALAPPDATA%/NexusAgentEvaluation/<unique-run>`. They never reuse the
foreground engine profile. Existing credentials may be read only for the
explicitly selected xkiro provider; the supplied evaluation credential may
instead be passed in memory. Neither is copied into engine profiles, reports,
or tracked files. Input/output limits and request-count limits cap each trial.
Unknown/paid models, changed engine versions, and unsupported APIs fail clearly.

The local dashboard requires an unpredictable token and matching loopback host;
state and run routes reject cross-origin requests. It must not bind to a public
interface. One dashboard trial runs at a time.

## Evaluation contract

A user turn starts when accepted, includes setup/model/tool/wait intervals, and
has one terminal outcome. Individual engine model/tool cycles do not end it.
Events from an earlier turn/generation and events after termination are rejected.
Text starts immediately, then coalesces in bounded windows; termination flushes
pending text first. No hidden reasoning is fabricated. Snapshots expose the
currently known phase, complete visible items, and one overall elapsed timer.

Exports include version/mode/model, phase times, request timing, image counts,
raw event-kind counts, and outcome. They exclude prompt/response text, images,
tool arguments, credentials, and native history. Tool capabilities, compatibility
failures, engine-owned versus harness-owned tools, and missing measurements must
be stated explicitly. Provider first-byte time is not necessarily first answer
text. Phase totals are exclusive and must not be computed by summing concurrent
tool durations.

## Acceptance matrix

Mandatory trials: quiet model startup, multi-step coding, screenshot-guided
work, safe/stale editing, managed process continuity, browser viewports and
console, interruption/failures, and reload/recovery. Record exact tested scope
as transport-verified, payload-verified, live-verified, failed, or not-tested.
A transport success cannot mark unexecuted trials as passing.

Rank correctness/reliability before quality, transparency, latency, and
integration complexity. Compare the same model where supported; different-model
results are workflow comparisons. Exclude scripted responses from model-quality
or inference-speed rankings. If candidates do not meet mandatory gates, report
the outstanding gaps and stop before production replacement.

## Delivery

Targeted unit/integration checks cover lifecycle ordering, duplicate/stale
notifications, streaming flushes, model gating, and local server access.
Document manual acceptance scenarios. Do not run local E2E suites unless asked.
Present the prototype and evidence before phase acceptance or production changes.

## Tested services and native recovery

Use each engine's native file/session implementation. pi uses the complete
coding SDK, resource loader and SessionManager with network discovery, extensions
and foreground context loading disabled. Codex uses app-server threads; OpenCode
uses server sessions and assistant-only part projections. Native snapshots and
recovery handles remain available before teardown.

The shared companion owns a session preview process and Chromium. It provides
start/status/stop, bounded logs, PID and exit status. Captures use explicit desktop
and mobile viewports and return text diagnostics plus image content, not a path
alone. Console repeats are aggregated; at most 100 unique messages and 100 page errors
are retained, with explicit dropped counts. Transcript item text retains at most
1MiB and exposes truncation. Separate calls observe the same preview;
trial shutdown verifies its port/process stops. This proves the harness service,
not equivalent built-in functionality in all three engines.

Use private workspaces outside AppData for restricted Windows Codex trials;
profiles/reports remain under LocalAppData. Record the path change and earlier
failures. Explicit model descriptors are capability hypotheses to verify, not
provider support declarations. Experimental raw events expose patch validation
failures; production integration requires a compatibility decision.

An active fault tool can write a single marker and wait. Cancellation must retain
it and produce interruption rather than completion. Completed-turn reconstruction
and uncertain-result reconstruction are separate trials. Reconnect must not
invoke the model or duplicate the marker. An explicit retry after uncertain work
is not authorized automatically by a successful reconstruction.

## Timing and manual acceptance

Start timing at request acceptance, before profile preparation. Record local
version/reference/adapter preparation separately from provider catalog and
credential setup. Tool, response, wait and reasoning phases are exclusive known
states, not inferred provider compute durations. Clip provider intervals to the
turn and union overlaps. Incomplete requests remain marked incomplete.

The dashboard keeps a persistent total timer and incrementally updates keyed
item nodes. It records bounded projection-to-delivery, DOM task and next-frame
samples; these are headless/display scheduling observations, not paint profiling.
Human approval timing remains unmeasured because this harness declines requests
and preapproves only its fixture services. A real approval UI is a later gate.

See the recorded comparison and limitations in
scripts/agent-evaluation/COMPARISON.md. Present the Windows prototype and website
artifacts for human review. Leave the isolated branch pending acceptance; no
engine replacement, production visual change, merge or push is part of this gate.
