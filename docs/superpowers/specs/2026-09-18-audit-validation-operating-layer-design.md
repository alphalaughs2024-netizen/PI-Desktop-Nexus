# Audit Validation Operating-Layer Design

## Status

Approved implementation scope for the first increment of the internal audit
handoff. This document records the evidence-backed changes only; it is not a
commitment to implement every proposal in the handoff.

## Goal

Make the existing local-first runtime more self-describing and recoverable at
the boundaries where the repository already has a stable primitive: packaged
sidecar startup, model-facing tool validation, application updates, global
shortcut registration, and host health diagnostics.

## Evidence and scope

The audit validation found one directly reproducible packaging defect and four
bounded resilience gaps:

1. The bundled sidecar is emitted as ESM, but packaging copies only
   `sidecar.js`, leaving the packaged parent without a module boundary. A clean
   profile starts with a warning and a CommonJS parent fails outright.
2. Runtime aliases prevent several common tool-call mistakes, but missing
   required fields still produce a generic message with no safe recovery shape.
3. The updater already has platform-aware delivery modes and timeouts, but
   unchanged automatic feed failures are repeatedly logged and are not
   classified for diagnostics.
4. A failed native summon-window shortcut registration is only logged; Settings
   cannot tell the user that the configured shortcut is unavailable or how to
   recover.
5. `app.health` and the existing logger are stable extension points, but they
   lack bounded, privacy-safe incident summaries and runtime boundary state.

The implementation covers only these five findings. It does not add a new
capability framework, task classifier, prompt rewrite, browser API family,
delegation helper, external-provider fix, or parallel health subsystem.

## Design

### 1. Sidecar module boundary

Keep the release entrypoint at `Resources/agent-runtime/sidecar.js` and keep
the bundle in ESM format. Add a sibling `package.json` containing only
`{"type":"module"}` to the bundle output and copy it with the existing
`extraResources` rule. The development fallback remains unchanged. Packaging
contract tests must assert both files are shipped, and a clean-profile test
must execute the copied entry with no inherited repository package metadata.

This is a packaging-only compatibility fix: no runtime loader, dependency, or
process ownership changes.

### 2. Structured model-facing validation recovery

Extend the existing `INVALID_ARGUMENT` errors raised before host execution with
a safe `details` envelope:

```json
{
  "kind": "tool-validation",
  "tool": "Glob",
  "purpose": "List files by glob pattern",
  "missing": ["pattern"],
  "example": {"pattern": "**/*.ts"},
  "suggestedTool": null
}
```

The envelope is returned in the runtime tool result/error path and remains
advisory. It never executes a different tool and never includes arbitrary
arguments or private file content. Known examples are limited to `Read`,
`Glob`, `Grep`, and `Bash`; malformed values continue to fail closed.

### 3. Updater classification and de-duplication

Retain the current `UpdateMode`, renderer-safe generic error text, release feed,
and timeout. Add an internal classification for unavailable feed, network,
configuration, and timeout outcomes. Automatic checks use the existing interval
and retry behavior, but an unchanged `(classification, currentVersion)` failure
does not emit another identical warning or push a redundant renderer state.
Manual checks still produce a visible generic error state. Classification is
diagnostic metadata only and is never rendered with feed URLs or raw exception
text.

### 4. Summon shortcut registration state

Introduce a small main-process status record for the summon shortcut:

```ts
type SummonShortcutStatus = {
  binding: string | null;
  accelerator: string | null;
  registered: boolean;
  errorCode?: "SHORTCUT_CONFLICT" | "SHORTCUT_UNAVAILABLE";
};
```

The record is updated whenever settings are applied, exposed through the
existing settings/diagnostic IPC path, and emitted only when it changes. A
failed registration is represented as `SHORTCUT_CONFLICT` (or
`SHORTCUT_UNAVAILABLE` when the platform cannot register the accelerator), with
no repeated identical log line. The Settings shortcut row shows concise
recovery actions: choose another binding, reset the default, or disable it.

### 5. Privacy-safe health and incident summaries

Extend `app.health` rather than creating a second health API. The response may
include:

- current updater mode/status and safe classification;
- workspace mode (`project-attached` or `scratch-only`) and boolean trust/readiness
  flags;
- counts of available core capabilities;
- a bounded list of normalized active incidents.

The logger keeps raw NDJSON records and redaction behavior. A bounded in-memory
incident index groups records by stable code/fingerprint and stores only
`code`, `fingerprint`, `count`, `firstSeen`, `lastSeen`, `retryable`, and a
short suggested action. It is capped, expires old entries, and is cleared on
process restart. It never stores credentials, session text, arbitrary tool
arguments, paths outside the already-safe diagnostic fields, or private project
content.

## Data flow and compatibility

The sidecar and tool-validation changes are backward-compatible additions. The
updater keeps the existing `UpdateState` shape and only adds optional internal
classification. Shortcut status is optional so older renderers can ignore it.
`app.health` adds optional fields and preserves the current required fields.
No protocol version bump is needed for additive optional fields; tests must
assert old consumers can still read the original fields.

## Error handling and security

- Packaging fails the release contract if the module boundary is absent.
- Validation errors remain fail-closed and advisory suggestions never trigger
  implicit execution.
- Updater diagnostics are generic at the renderer boundary and de-duplicated
  only for unchanged automatic failures.
- Shortcut failures do not silently fall back to a different user-selected
  shortcut.
- Health and incident output is local-only, bounded, redacted, and read-only.

## Testing and acceptance

Acceptance requires focused tests for each boundary:

- clean-profile ESM sidecar startup and packaging footprint;
- runtime validation metadata for missing `Glob`, `Grep`, `Read`, and `Bash`
  fields;
- updater classification, automatic de-duplication, manual error behavior,
  and timeout preservation;
- shortcut registration state transitions, duplicate logging suppression, and
  Settings recovery actions;
- health response optional fields, incident fingerprint/count behavior, and
  redaction/capacity limits.

The E2E plan gains scenarios for packaged sidecar boot, shortcut recovery, and
the health/diagnostic view. Existing full-suite failures unrelated to this
scope remain documented rather than masked.

## Out of scope

No changes to external providers/MCP, local audit plugins, `pi.advisor`,
credentials, secrets, private session text, project content, browser security
boundaries, delegation semantics, filesystem containment, or release-channel
architecture are part of this increment.
