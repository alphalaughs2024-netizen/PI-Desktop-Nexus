# ADR 0223: Nexus-managed Git and Review Workflow Boundaries

- Status: Accepted
- Date: 2026-09-11
- Related: ADR 0221, ADR 0222, ADR 0043

## Context

Phase 4 needs Git isolation, local integration, and review guidance that works
for every Nexus provider without copying a host-specific agent environment.
Nexus already provides a permissioned shell, bounded working-tree diff, and
message-owned review evidence, but an unrestricted Git wrapper would let a
model choose arbitrary paths, branches, remotes, or destructive cleanup.

## Decision

Nexus ships four workflow packages:

- `nexus/git/using-git-worktrees`;
- `nexus/git/finishing-development-branch`;
- `nexus/review/requesting-code-review`;
- `nexus/review/receiving-code-review`.

The Git packages use the local `GitWorktree` interface rather than arbitrary
Git shell commands for managed lifecycle operations. It permits only
`nexus/<short-name>` branches and derives one exact sibling destination:
`<repository-parent>/.nexus-worktrees/<short-name>`. It records the exact
repository, branch, and destination in Nexus profile metadata. Creation and
local merge require native confirmation. Cleanup requires the recorded
worktree to be clean and the branch to be proven an ancestor of the current
local `HEAD`; it then removes only that path and deletes only that local
branch. The interface never has a push, remote, rebase, reset, force-delete,
or arbitrary-path operation.

The interface rejects a repository whose root is the separately checked-out
upstream `PI-Desktop` app. It can therefore manage work in Nexus or another
user project without widening into the protected real application checkout.

Review workflows use the existing bounded workspace diff and host-owned
message review snapshots. They provide review scope, evidence, finding
evaluation, and targeted validation guidance but do not create a second review
database, grant tools, accept findings blindly, merge, or publish remotely.

## Consequences

Nexus exposes a useful local Git lifecycle while keeping the permission,
branch ownership, exact path, merge verification, and no-push boundaries
visible and enforceable. Review is provider-neutral and stays tied to actual
workspace evidence. Remote collaboration, hosted pull requests, and arbitrary
Git automation remain outside this phase.

