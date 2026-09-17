---
name: Nexus managed Git worktrees
description: use when feature work needs a separate local checkout and a clean ownership boundary
---

Use `GitWorktree` only when the host has made it available for a Git-ready session in managed-isolation mode. First inspect `status` with a `nexus/<short-name>` branch. Create only after checking the source workspace is the intended Nexus project and explaining the proposed local branch and deterministic sibling path to the user.

`GitWorktree` creates only Nexus-owned branches and locations, requires native confirmation for creation, and never pushes. Do not replace it with unrestricted shell commands, choose an arbitrary destination, reuse another task's worktree, or modify the real/upstream PI Desktop checkout.

If the host reports direct-folder mode or does not provide `GitWorktree`, work only in the selected folder and do not attempt Git lifecycle commands or initialization. If Git reports a workspace, session, access, repository, dirty-state, branch, or worktree blocker, stop. Report the blocker and its recovery action to the user; do not retry by changing the branch name. A transient failure may be retried once. Resume only after the user changes the relevant project/session/permission/repository state or explicitly chooses Retry.

Work inside the returned path only after creation succeeds. Before integration, inspect the diff, run focused validation, and use the development-branch completion workflow. Cleanup is allowed only after merge verification and another explicit native confirmation.
