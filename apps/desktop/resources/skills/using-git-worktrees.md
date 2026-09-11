---
name: Nexus managed Git worktrees
description: use when feature work needs a separate local checkout and a clean ownership boundary
---

Use `GitWorktree` for the managed lifecycle. First inspect `status` with a `nexus/<short-name>` branch. Create only after checking the source workspace is the intended Nexus project and explaining the proposed local branch and deterministic sibling path to the user.

`GitWorktree` creates only Nexus-owned branches and locations, requires native confirmation for creation, and never pushes. Do not replace it with unrestricted shell commands, choose an arbitrary destination, reuse another task's worktree, or modify the real/upstream PI Desktop checkout.

Work inside the returned path only after creation succeeds. Before integration, inspect the diff, run focused validation, and use the development-branch completion workflow. Cleanup is allowed only after merge verification and another explicit native confirmation.

