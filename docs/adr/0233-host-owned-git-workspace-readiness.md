# ADR 0233: Host-owned Git workspace readiness

## Decision

Nexus owns Git workspace readiness, recovery, and managed-worktree inventory in
Electron main. The agent receives `GitWorktree` only for a Git-ready session in
**managed isolation** mode. A source copy, missing folder, or explicit
**direct folder** session does not receive that tool or its workflow guidance.

Readiness is a read-only operation. It identifies the selected folder, Git root,
branch and clean state where available, Git availability, and only profile-recorded
Nexus worktrees. It never initializes Git or selects a branch. A non-Git folder
is valid for direct work and has the `NOT_A_GIT_REPOSITORY` recovery action.

The workspace mode is private, durable session metadata stored by the host. A
session may switch to direct folder without changing project files. Returning to
managed isolation requires a fresh successful readiness check.

Git lifecycle failures retain their typed category through the local-tool result.
A hard category stops all further Git worktree calls in that turn, including a
different operation or branch; only one transient failure can be retried. A
project-path change clears the old blocker identity.

Settings → Workspaces lists only Nexus profile-recorded worktrees. It can open a
new task in a recorded worktree, reveal it, refresh it, or invoke the existing
confirmed cleanup path. Unknown, dirty, and unmerged worktrees are not cleanable.
Automatic cleanup remains off.

## Consequences

This supersedes the blocker-only behavior in ADR 0232. It preserves the
`nexus/<short-name>` branch policy, deterministic `.nexus-worktrees` sibling
directory, native confirmations, local-only operations, and no-push boundary.
It creates a stable host boundary for future environment setup and task handoff,
without adding remote execution, cloud environments, or automatic repair.
