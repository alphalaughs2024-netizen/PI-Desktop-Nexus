# ADR 0221: Nexus Workflow Packages and Guidance-Only Activation

- Status: Accepted
- Date: 2026-09-11
- Related: ADR 0220, D174

## Context

Nexus previously treated shipped operational guidance as Markdown catalog entries.
That made the documents discoverable but could not express versioned workflow
metadata, capability compatibility, session lifecycle, activation reasons, or
the difference between automatic and manual selection.

## Decision

Nexus packages each built-in workflow behind a validated registry manifest. A
manifest declares an immutable identifier, version, supported modes, required
host capabilities, priority, default stage, and packaged instruction body. In
Phase 1 the existing `nexus/guidance/agent-operations` and
`nexus/guidance/plugin-development` documents are registry-backed while their
legacy `pi-desktop/*` load aliases remain available.

Electron main resolves workflows before constructing or reusing the runtime.
It uses the current prompt in memory only, workspace facts, mode, real host
capabilities, global enablement, project overrides, and session overrides. The
persisted session record contains ids, stage, source, narrow reason category,
and timestamps only; it never stores the prompt used for classification.

Precedence is session override or dismissal, then project override, then global
default. One primary workflow owns the active stage. Agent operations is
supporting guidance when plugin development becomes primary. Unsupported or
disabled workflows remain visible as unavailable and cannot be manually
activated.

The primary body is injected before the first relevant model action. It is
explicitly guidance only and sits before project instructions, which retain the
final word. The existing bounded instruction catalog and `Skill` id gate remain
the boundary for non-active documents. A read-only `Workflow` local tool can
list, inspect, activate, and dismiss compatible workflows; it never grants
tools, permission, network/filesystem access, execution rights, or confirmation
bypass. Changing workflow context retires a stale sidecar runtime.

## Consequences

The interface is model- and provider-agnostic while still making high-confidence
workflow selection visible. Session records live under the Nexus profile and
are deleted with their session. Project overrides are profile metadata keyed by
a one-way path digest; neither store affects the real upstream Pi Desktop
checkout. Future phases can add packages and stages without replacing the
existing Plan, Goal, permission, or Skill systems.

Phase 6 adds a distinct author-owned package format without promoting ordinary
user Markdown skills into workflows. A global package lives under
`<dataDir>/agents/workflows/<slug>/`; a project package lives under
`<project>/.agents/workflows/<slug>/`. Each package contains a fixed
`workflow.json` manifest and `WORKFLOW.md` body. The manifest uses a
host-assigned `user/` or `project/` id, a semantic package version, a format
version, supported modes, required existing Nexus capabilities, a priority,
stage, literal activation terms, and positive/negative fixtures. `nexus/` is
reserved and cannot be overridden.

The Settings page can scaffold, reveal, enable, preview, and run fixtures for
these packages. Preview prompt text is evaluated in memory and is not retained
in package state or the workflow activation audit. Fixture prompts are explicit
package test data; they never enter the activation audit. Only compatible,
enabled packages enter the catalog or resolver. Automatic activation is limited
to host-validated literal terms; packages cannot provide regular expressions,
code, hooks, tools, permissions, or permission-policy changes. Incompatible
format versions remain visible with an upgrade reason and cannot load or
activate. This keeps packages model-neutral and host ownership of authority
unchanged.
