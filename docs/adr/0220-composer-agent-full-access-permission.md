# ADR 0220: Composer Agent Full Access Permission

- Status: Accepted
- Date: 2026-09-18
- Decision: Add a session-scoped `full-access` permission mode for the local Agent Composer.

## Context

The Composer needs a clear replacement for the ambiguous automatic label while
also providing an explicit high-trust Agent policy. The existing `auto` mode
already has defined semantics and must remain unchanged. A UI-only Full access
state would leave host execution behavior inconsistent with the selected chip.

## Decision

- Persist `full-access` in the existing session `permission_mode` field.
- Expose it only from the local Agent Composer after a danger-styled confirmation.
- Keep global defaults, remote/MCP control, and Plan/Goal approval contracts
  limited to `ask`, `accept-edits`, and `auto`.
- Evaluate Full access only after Agent/Plan/Goal allowlists and hard denies.
- Continue enforcing containment, canonicalization, administrator/platform,
  remote-control, timeout, cancellation, and audit boundaries.
- Cancelled or failed confirmation/configuration leaves the previous mode intact.

## Consequences

Full access changes actual host authorization for eligible Agent operations and
is durable for the session. It cannot be used to widen Plan/Goal capabilities
or to bypass an independent host security boundary. Existing permission cards
and session grants remain supported.
