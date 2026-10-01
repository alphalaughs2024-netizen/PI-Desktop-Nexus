# ADR 0265: Extend the built-in Browser through guest-owned services

- Status: User-approved direction; manual acceptance pending
- Date: 2026-10-02
- Related: [ADR 0254](0254-browser-session-execution.md), [ADR 0259](0259-codex-subagent-capabilities-and-attribution.md)

## Decision

Preserve Nexus's Browser layout and themes. Adapt useful browser contracts
independently from the Codex reference. External Chrome/Edge profiles remain
a later request. Main owns the services; renderer controls are allowlisted.
Agent commands retain session/tab identity, Plan policy and cancellation.

- Pin Playwright Core 1.63.0 for semantic locators, nested frames, strictness
  and native actionability. Its in-memory CDP transport contains exactly one
  unprivileged guest; no debugging port or privileged renderer is exposed.
- Retain native popup guests and opener metadata; bound each chat to 20 tabs.
  Temporary/deliverable/handoff marks are metadata, not permission grants.
- User takeover cancels active/queued agent work and blocks further mutations
  until resumed. Inspection remains available. Never replay uncertain actions.
- Explicitly approve current-site Developer access with the existing 120-second
  deny timeout. Recheck document identity afterward; cross-origin navigation
  revokes access. Bound events to 250 records/1 MiB and redact credential headers
  and post data. Response-body IDs must have been observed within the grant.
  Public CDP keeps global cookies/storage/targets/interception denied.
  Revocation clears Developer state, resets emulation, and disables diagnostic
  domains; the automation connection initializes again on its next operation.
- Separately approve camera, microphone, notifications and location requests.
  Permission checks recognize only explicit live-document grants and distinguish
  audio/video. Navigation invalidates grants/pending approval. Unknown, worker
  and cross-origin-frame requests remain denied. Grant revocation does not
  promise to stop an already active stream; document replacement closes it.
- Downloads, assets, page exports and screenshots belong to chat scratch.
  Downloads/PDFs are limited to 32 MiB; assets to 8 MiB. Upload paths come only
  from the native user file picker, with document checks after selection.
- Element annotations and temporary styles are document-local, without source
  file edits. Experimental WebMCP is feature-detected; calls require current
  document identity and separate explicit approval.
- Share one tool catalog across registration, schemas and built-in subagents.
  UI designer/fixer/test runner receive the full set; explorer/reviewer receive
  inspection tools. Custom documents and exact model/provider pins are preserved.

## Consequences

Playwright adds a production dependency without a separate browser installation.
The existing persistent browser profile is shared across chat-owned tabs; tab
ownership is not account/cookie isolation. HTML exports are document snapshots,
not offline website archives. Unsupported experimental APIs remain explicit.

## Validation

Focused tests cover registration/preset parity, Plan gates, takeover/cancellation,
snapshot waits, bounded AX/console, Developer grants and website permissions.
They also cover destroyed-guest cleanup, tab admission limits, background popup
selection, and inspection during a mutation whose outcome remains uncertain.
A real Electron probe exercises production BrowserHost/render paths and records
native input, frames, viewports, screenshot pixels, downloads, popups and
cancellation. Local E2E suites remain opt-in; manual acceptance is separate.

On 2026-10-02, desktop typecheck and Electron main/preload/renderer builds
passed. Focused checks passed: 58 desktop browser checks, 36 shared preset/
definition checks and 28 runtime definition/delegation checks. The native probe
passed 21 assertions with empty stderr, including self-closing popups and
Developer revocation/regrant. A main-window GUI probe opened all drawer views,
displayed a real 390 x 844 screenshot without overflow, and exercised takeover/
resume without renderer errors. Native capture output was visually inspected.
Packaged Windows verification, device/OS permission behavior, supported WebMCP
sites and the user's complete agent workflow still require acceptance testing.
