# ADR 0258: Preserve host Plan and Goal approval boundaries with Codex

- Status: Opt-in implementation; manual acceptance pending
- Date: 2026-10-01
- Related: ADR 0052, ADR 0053, ADR 0222, ADR 0252, ADR 0255, ADR 0256

## Decision

Rust retains ownership of planning mode, exact Markdown artifacts, proposal
approval and execution claims. Codex retains native history and execution.
Entering planning interrupts and retires the current native segment and stops
owned delegates before changing host state. The host turn and elapsed start time
are preserved across that transition.

Planning uses Nexus permission-checked inspection tools and declared plan-safe
actions. Native shell/patch, Task and arbitrary browser evaluation are excluded.
Main permits Skill and Workflow guidance loading and existing plan-safe browser
inspection in both Plan and Goal. Workflow activation still checks the manifest's
supported modes; loading guidance does not grant implementation authority.
Allowed Bash retains host policy; this is an approval boundary, not a claim of
filesystem containment. Trusted extension tools remain excluded while planning.
Questions use the existing non-expiring GUI dialog and resolve as unanswered
on cancellation.

Submitting a contract stops execution before creating a pending host proposal.
Validate exact Markdown bytes, hash and size against the returned artifact.
Only explicit host approval claims execution; validate session, claimed state,
artifact and permission mode before resuming native history with native tools.
No transition failure or cancellation may restart the previous segment. Recovery
uses native snapshots and host approval state without replaying mutations.

## Evidence

Targeted lifecycle tests cover stopping before host mutation, terminal identity,
submission, failure and questions. The isolated Windows fixture exercises real
Codex 0.157.1 and Rust host Plan/Goal enter, question, submission, approval and
restored native tools. Manual GUI acceptance and packaged verification remain
pending. Appearance is unchanged; Phase 3 has not started.
