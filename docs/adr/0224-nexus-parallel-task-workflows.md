# ADR 0224: Nexus parallel task workflow boundaries

- Status: Accepted
- Date: 2026-09-12
- Related: ADR 0062, ADR 0089, ADR 0166, ADR 0218, ADR 0223

## Context

Nexus already provides bounded background subagents through `Task`, `TaskWait`,
`TaskList`, and `TaskStop`. It deliberately retains reports rather than child
transcripts in the parent context, scopes active inherited tools, and serializes
same-path mutations. Those runtime primitives alone do not tell a provider when
parallelism is appropriate, how to assign ownership, or why path locking is not
workspace isolation.

Phase 5 needs provider-neutral coordination guidance without duplicating the
Task runtime or admitting concurrent changes into a shared checkout.

## Decision

Nexus ships two workflow packages:

- `nexus/coordination/dispatching-parallel-agents`;
- `nexus/coordination/subagent-driven-development`.

They activate only for concrete independent parallel investigation or explicit
subagent execution of an approved plan, never for explanatory discussion. The
packages instruct the parent to create bounded briefs, state task ownership,
collect reports through the existing lifecycle tools, independently evaluate
results, and retain final integration and verification responsibility.

`Task` accepts optional coordinator-owned ownership metadata (`read` or
`write`, with workspace-relative paths). This metadata is not a filesystem ACL
and never adds authority. It is returned by lifecycle status for transparent
aggregation. While either coordination workflow is active, Nexus rejects every
second write-capable delegate in the same session workspace. Read-only work may
run concurrently. A user who needs concurrent mutation work must first create
separate Nexus-managed worktrees in separate tasks; otherwise mutation work is
sequential. Existing general Task behavior is unchanged outside these workflow
packages.

## Consequences

The parent can proactively dispatch independent research and safely aggregate
it, while concurrent mutation requires real workspace isolation rather than an
optimistic path claim. Workflow guidance does not grant tools, bypass normal
permissions, create another review or task store, publish remotely, or permit
changes to the protected upstream PI Desktop checkout.
