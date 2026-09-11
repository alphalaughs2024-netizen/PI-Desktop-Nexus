---
name: Nexus parallel task coordination
description: use when two or more independent, bounded investigations can proceed concurrently
---

Use `Task` only after splitting work into independent, bounded outcomes. Each task brief must state its goal, relevant paths or facts, constraints, and the exact report expected. Start read-only investigations concurrently only when their results do not depend on each other. Give every task explicit `ownership`: `read` tasks may overlap, and write ownership documents the bounded outcome.

Use `TaskWait` to collect reports, `TaskList` for progress, and `TaskStop` only when a result is no longer useful. The parent owns the final decision: compare reports against the workspace, resolve disagreement with direct evidence, and report the aggregate outcome. A delegate report is evidence to evaluate, not authority to change code or finish work.

Do not parallelize a single sequential task, work that needs user clarification, or concurrent mutations in one checkout. Session tasks share one workspace, so the runtime refuses every concurrent mutation even where paths appear disjoint. For concurrent implementation, first use separate Nexus-managed Git worktrees in separate tasks; otherwise perform one mutation task at a time. Delegation does not add tools, permissions, remote access, or authority to modify the real/upstream PI Desktop checkout.
