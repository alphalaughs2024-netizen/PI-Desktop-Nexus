# ADR 0218: User subagent inherits only active parent capabilities

- Status: Accepted
- Date: 2026-09-11
- Deciders: PI-Desktop Nexus
- Related: ADR 0062, ADR 0089, ADR 0166, D201

## Context

Static subagent definitions are intentionally limited to seven file, search,
preview, shell, and editing tools. That remains a useful default, but it means
a trusted user-defined worker cannot help with a capability the parent has
already activated, such as a project Skill, an MCP action, or a plugin tool.

Giving every delegate the entire installed catalog would change that boundary:
it would make deferred capabilities reachable, let a child use discovery to
widen itself, and permit recursive Task execution. Reinterpreting existing
`tools: "*"` definitions would silently expand existing workers on upgrade.

## Decision

1. Only a user-owned definition that declares the exact scalar
   `tools: inherit` opts into inherited tools. Builtins and mixed forms are
   rejected. Existing static declarations, including `tools: "*"`, are
   unchanged.
2. At the instant `Task` launches the worker, the runtime copies the parent's
   active tool objects. It removes `Task`, `TaskWait`, `TaskList`, `TaskStop`,
   `EnterPlanMode`, `EnterGoalMode`, `SubmitPlan`, `SubmitGoal`, `new_context`,
   `asktool`, and `ToolSearch`. Excluding discovery is required because it can
   activate tools that were not active for the parent.
3. The inherited set uses the normal delegate wrapper, so the definition's
   permission scope and existing host path and tool checks still apply. It is a
   capability snapshot, not a grant: later parent activations do not alter a
   running worker.
4. If `Skill` is among the snapshot, the child receives the same compact
   instruction catalog identifiers and descriptions as the parent. Skill
   bodies remain host-served and on-demand; the catalog alone cannot expose a
   recipe body.

## Consequences

- User workers can participate in a parent task with active Skills and active
  plugin/MCP capabilities without a custom static allowlist for every tool.
- Delegation remains one level deep and cannot silently access inactive or
  installed-only features.
- A definition author chooses a dynamic security boundary deliberately. They
  should use a static list when the worker needs a fixed, reviewable tool set.

## Alternatives considered

- **Make `tools: "*"` inherit everything:** rejected because it changes existing
  definitions and exposes plugins, Skills, and MCP actions without opt-in.
- **Let inherited workers retain `ToolSearch`:** rejected because a child could
  activate a parent-deferred tool, defeating the active-only boundary.
- **Copy all Skill bodies into the child prompt:** rejected because it bloats
  context and changes the host-gated, on-demand recipe model.
