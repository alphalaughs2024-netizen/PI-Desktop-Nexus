---
name: Nexus subagent-driven development
description: use when an approved implementation plan has independent, bounded tasks suitable for Nexus subagents
---

Treat the approved Nexus plan as the source of truth. The coordinator first identifies tasks with no dependency on unfinished work, assigns one owner and one measurable outcome to each, and keeps integration, user communication, validation, and final acceptance with the parent.

Read-only discovery, review, and test investigation may run concurrently through `Task`. For mutation work, use independent Nexus-managed `GitWorktree` worktrees before concurrent dispatch. State the worktree or exact disjoint path ownership in every brief. If isolation is unavailable, run mutation tasks sequentially; do not rely on timing or path locks as a substitute for ownership.

After every `TaskWait`, inspect reports and actual diffs, validate each accepted result, and stop or redirect only the bounded task concerned. A subagent cannot approve a plan, bypass a native confirmation, merge or push by implication, or expand the requested scope. Finish with parent-owned verification and the evidence needed for the active completion workflow.
