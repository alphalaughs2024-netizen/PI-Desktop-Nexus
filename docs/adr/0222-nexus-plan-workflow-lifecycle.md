# ADR 0222: Nexus Plan Workflow Lifecycle

- Status: Accepted
- Date: 2026-09-11
- Related: ADR 0221, ADR 0052, ADR 0053

## Context

Nexus already owns Plan mode, immutable plan artifacts, explicit approval, and
execution recovery in host-core. The workflow package system needs planning and
execution guidance without introducing a second plan document, approval path,
or replay mechanism.

## Decision

Nexus ships two capability-aware workflow packages:

- `nexus/planning/writing-plans`, available in Plan mode;
- `nexus/planning/executing-plans`, available in Agent mode after host approval.

Plan authoring begins from the durable Plan-mode contract, not merely a prompt
that mentions plans. Its guidance directs the agent to inspect the workspace
and submit a complete snapshot through `SubmitPlan`. User approval remains the
existing host-owned approve/reject action.

Electron derives lifecycle workflow state from the existing host
`plans.changed` events: proposal, approved queue, running execution, completed
execution, and interrupted execution map to `proposed_design`,
`approved_plan`, `executing`, `verified`, and `paused`. The session workflow
record stores only the package id, stage, narrow reason category, timestamps,
and a fixed next-action string. It never stores plan Markdown, title, question,
artifact bytes, or raw prompts. The host artifact remains the exact execution
contract and host restart behavior remains fail-closed: interrupted work is
shown as paused and is never replayed by the workflow engine.

## Consequences

Plan authoring and execution gain visible, provider-neutral guidance while the
host preserves ownership of plan content, approvals, permissions, artifact
integrity, and restart safety. Workflows continue to be advisory: they do not
grant tools, bypass confirmation, approve a plan, or start work independently.
