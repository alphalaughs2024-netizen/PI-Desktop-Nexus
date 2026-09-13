# ADR: Structured Git workflow blockers

## Decision

Nexus classifies Git precondition failures at the host boundary and retains a
session-scoped blocker keyed by the session and safe workspace identity. The
agent receives a concise recovery action and must stop on unchanged blockers;
changing a branch argument does not reset this state. Only transient failures
may receive one bounded retry.

## Rationale

Session lookup, filesystem access, repository discovery, Git ownership, and
worktree state are different failure domains. Collapsing them into “no
workspace” caused misleading guidance and repeated attempts. Native
`GitWorktree` remains the only mutation path, preserving confirmations,
deterministic Nexus paths, upstream protection, and no-push behavior.

## Privacy and recovery

Blocker records contain category, operation, attempt count, timestamp, and a
normalized workspace identity. Raw prompts are never persisted. Project or
permission changes, repository repair, and explicit Retry clear the blocker.
