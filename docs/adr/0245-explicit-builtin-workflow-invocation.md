# ADR 0245: Explicit Invocation of Bundled Workflow Guidance

- Status: Accepted
- Date: 2026-09-29
- Related: ADR 0024, ADR 0220, ADR 0221, D174

## Context

Nexus automatically selects one bundled workflow and advertises other guidance
through the bounded Skill catalog. Users can activate a workflow from the
session UI, but cannot directly invoke a bundled guide in the composer. The
existing slash menu already supports local application commands. D174 rejected
slash commands for plugin skills; the current product request explicitly calls
for user invocation of reviewed Nexus guidance.

## Decision

Each bundled workflow declares a stable `guide-*` slash alias. The composer
lists enabled built-ins in its existing command menu. Sending an alias alone
activates that workflow for the current session; an alias followed by a prompt
activates it first, then sends the prompt through the normal user-turn path.
From the home composer, invocation creates a session. Activation is checked by
the host against the session's mode, capabilities, and effective enablement.
An unavailable guide returns an error and leaves the draft intact.

Nexus also ships a focused interface-design guide. It activates for concrete
visual interface work and takes precedence over generic feature discovery;
observed failures continue to select debugging first. The guide is authored
for Nexus and does not copy third-party skill bodies.

Explicit activation is a session override, not a tool or permission grant.
Automatic selection, the on-demand Skill catalog, and user or plugin skills
continue to operate independently. The alias list is restricted to bundled
guidance; author-owned workflow packages remain available through the Workflow
tool and session UI. The active-workflow inspector reads an active package
through its session scope rather than assuming every active id is bundled.

## Consequences

Users can choose a known guide without relying on English trigger wording, and
can see the selected guide in the existing active-workflow card. The host still
owns activation and access checks. The `guide-*` prefix keeps these commands
distinct from existing templates and app aliases while preserving one composer
namespace.
