# ADR 0278: Phase 4 process inspection and native edit review

- Status: Accepted

## Decision

Expose a session-owned Processes resource in the Work Panel's tool menu.
The main renderer may inspect bounded logs and explicitly stop an owned
process or all processes in that chat. Add allowlisted Main IPC and Rust
`process.read`/`process.stop` operations, reusing the existing registry's
ownership, observed-exit, output and recovery contracts. Sender validation
restricts this UI path to the main renderer. These user controls cannot launch
commands, grant agent permissions or widen Plan/delegate tool catalogs.
Inactive/hidden panels stop polling; stale requests cannot populate another chat.

Native Codex file-change events provide message-owned review evidence with
bounded paths, operations and reported diffs. Preserve this evidence through
existing engine snapshots and transcript persistence and display it alongside
host-owned edit snapshots. Native evidence is distinct from a host rollback
snapshot: Nexus must not invent a before image or advertise rollback for it.
Failed, declined and foreign-turn events never become successful review changes.
Mutating delegates remain serialized within a shared workspace; native parent
instructions require independent work or waiting while a writing delegate runs.
MCP Task delivery waits up to five seconds for the matching native timeline
item, with canonical argument matching, single-use claims and cancellation.
Git inspection has a command deadline/output bound and preserves errors instead
of reporting failed inspection as a clean workspace.

## Scope

This completes the local coding-service surface. External browser profiles,
remote Git publishing and surviving application shutdown remain outside it.
No schema migration, animation library or alternate process owner is needed.
