# ADR 0220: Nexus-Owned Skill Boundaries and Safe On-Demand Loading

- Status: Accepted
- Date: 2026-09-11
- Related: ADR 0039, ADR 0056, D174, D194

## Context

Nexus inherited generic PI-Desktop storage and guidance naming in several
skill-system paths. Its plugin runtime could derive a different profile root
than the host, global user skills shared `~/.agents/skills` with other agent
applications, and an unbounded aggregate catalog could crowd a model prompt.
The catalogue was visible in Plan and Goal despite those modes not reliably
admitting its read-only loader. A model could also request a known-but-omitted
document id, and the settings surface did not manage first-party guidance.

## Decision

The active Nexus data directory is the sole profile root for Electron plugin
state, global user skills, and first-party guidance preferences. Global user
skills reside at `<dataDir>/agents/skills`; portable project skills remain at
`<project>/.agents/skills`.

Nexus uses one 8,000-character aggregate instruction-catalog budget. It sorts
complete entries deterministically by source (Nexus, user, plugin) and then
name/id. Only selected ids are recorded for a session and accepted by `Skill`.
The tool is a read-only document loader in Agent, Plan, and Goal; it does not
admit mutation, plugin execution, delegation, additional tools, or permission
changes in a contract mode.

The prompt and every loader result state that a document is guidance, not
authority. A document cannot expand existing tools, filesystem/network access,
automatic execution, or confirmation policy. This is defense in depth; host
tool and permission enforcement remains authoritative.

Nexus-shipped documents use `nexus/guidance/*` ids. The old
`pi-desktop/*` ids remain non-advertised load aliases for transcript
compatibility. Settings lists shipped documents separately, allows inspection
and enablement, and persists only enablement beneath the Nexus profile; it
never edits packaged Markdown resources.

## Consequences

Nexus skill data no longer leaks into or out of the upstream application by
default, including when a development profile is explicitly selected. Existing
global skills under the generic `.agents` location are not automatically
imported; users can import chosen documents through Settings. Plugin guidance
remains third-party and is explicitly labelled as such. Large catalogs become
predictable and cannot be bypassed by guessing ids, while a new session is
required for a changed catalog to take effect.
