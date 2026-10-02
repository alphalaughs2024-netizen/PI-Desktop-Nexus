# ADR 0272: Codex Context Usage

- Date: 2026-10-02
- Status: Accepted by the user for local main on 2026-10-02
- Scope: Codex execution metadata and composer context accounting

## Evidence

The tested chat's native rollout reported a latest request of 11,728 tokens,
but Nexus's adapter ignored `thread/tokenUsage/updated`. Its execution snapshot
had no usage, so the composer correctly displayed unavailable data.

## Decision

Handle the native event only for the owned active thread/turn. Validate numeric
counts and retain the last request in additive `EngineTurn.contextUsage`
metadata, including the engine's model context window when provided. Preserve
it through status messages, terminal execution metadata and recovery snapshots.
Missing/malformed reports remain unavailable. Retired, foreign and terminal
events cannot overwrite active usage. No storage schema or protocol version
change is required; execution metadata is already an extensible JSON value.

Codex input includes cached input, and output includes reasoning. Normalize
those subsets to Nexus's additive usage fields without counting them twice.
Thread cumulative expenditure is not context occupancy. The composer uses the
latest parent execution report and native context window; subagent reports do
not replace it. Existing pi message usage and catalog fallback remain supported.

## Verification

Targeted native normalization, adapter lifecycle/persistence, generation
ownership and composer projection tests cover actual reported counts, absent
fields, malformed reports, reload and cache/reasoning accounting. Build and
typecheck the corrected runtime and desktop. Full local E2E suites remain
unrun. The user approved merging the composer and usage fixes on 2026-10-02.

The focused runtime suites passed 75 checks; desktop context/projection checks
passed, as did runtime/shared and desktop typechecks and the desktop build.
The isolated corrected sidecar passed its startup handshake. The test app was
relaunched with that runtime and loaded successfully before user approval.
The latest test-session snapshot retained a reported 17,969-token request
against a 950,000-token native window, confirming live usage persistence.
