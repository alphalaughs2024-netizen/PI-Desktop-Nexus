# ADR 0225: Author-Owned Workflow Packages Remain Guidance Only

- Status: Accepted
- Date: 2026-09-12
- Related: ADR 0220, ADR 0221

## Context

Nexus workflows need a user- and project-owned authoring path, but treating any
Markdown skill as an executable or automatically active workflow would blur the
existing skill security boundary.

## Decision

Nexus stores author-owned workflow packages separately from ordinary skills.
Each package is a versioned `workflow.json` plus fixed `WORKFLOW.md` body in a
global or project workflows root. The host validates the namespace, semantic
version, format version, modes, capability names, lifecycle stage, priority,
literal activation terms, and deterministic positive/negative fixtures before
the package is eligible for catalog, preview, fixture test, manual activation,
or automatic resolution.

The compatibility contract is format-version based. Incompatible packages stay
visible in Settings with a reason but are not loaded or activated. The manifest
may name only host-known capabilities; a name is a compatibility declaration,
not a grant. No package can define code, regex activation, a tool, a plugin,
permission, confirmation change, or a host lifecycle transition.

## Consequences

Users can author reusable personal or project workflows using Nexus-native
guidance and test their trigger behavior without a provider-specific runtime.
The existing Markdown Skill system remains a recipe system. Third-party content
continues to be unable to expand authority or bypass the host's permission,
Plan, Goal, Git, and session controls.
