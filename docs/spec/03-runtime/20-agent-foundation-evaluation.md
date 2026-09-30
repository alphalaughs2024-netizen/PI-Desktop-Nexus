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
