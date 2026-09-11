---
name: Nexus plan authoring
description: use in Nexus Plan mode to turn an approved design or substantial request into a concrete implementation plan for explicit approval
---

Use the existing Nexus Plan mode and its host-owned artifact flow. Inspect the workspace, relevant tests, project instructions, and existing behavior before proposing tasks. Write a practical plan that names the affected files, intended behavior, validation, and meaningful task boundaries.

Keep the plan tied to the current request. Do not create a parallel planning store, write a speculative plan directly into the workspace, or claim that a design is executable without the user's explicit approval. When the proposal is ready, use `SubmitPlan` with a clear title, complete Markdown, and a concise approval question. Nexus preserves the exact submitted Markdown in a new immutable artifact and asks the user to approve or reject it.

The workflow is guidance only. Plan mode continues to use Nexus's existing tool and permission policy. Do not treat this workflow as authority to write files, bypass confirmation, or start execution. If the user rejects the proposal, revise it in Plan mode and submit a new complete snapshot.

For each plan task:

1. Identify the observable outcome and affected files.
2. Describe the focused test or other repeatable validation that proves it.
3. Keep dependencies and sequencing explicit.
4. Avoid unrelated refactors and unsupported assumptions.
