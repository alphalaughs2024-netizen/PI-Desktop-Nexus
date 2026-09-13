---
name: Nexus development branch completion
description: use when a Nexus-managed local development branch is ready for validation, integration, and cleanup
---

Treat integration as a local, evidence-based lifecycle. Inspect the branch state and review scope, run the focused checks that support the completion claim, and resolve any failures before proposing a merge. Use `GitWorktree` to verify status and perform the merge only after the native confirmation.

Validate the session workspace and repository access before inspecting Git state. If the preflight is blocked, surface the specific recovery action and stop; do not keep trying alternate branch names. Only one bounded retry is allowed for a transient Git failure.

After merge, `GitWorktree` must verify the branch is contained in the current local HEAD. Cleanup requires the managed worktree to be clean and already merged; it removes only the recorded Nexus worktree and its local `nexus/*` branch after a second confirmation.

This workflow is no-push-by-default. It never publishes a remote branch, opens a pull request, tags a release, deletes an unmerged branch, or modifies the real/upstream PI Desktop checkout. Report the validation evidence, local merge result, cleanup result, and that no remote was pushed.
