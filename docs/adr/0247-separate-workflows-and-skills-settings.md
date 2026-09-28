# ADR 0247: Separate Workflows and Skills in Settings

- Status: Accepted
- Date: 2026-09-29
- Related: ADR 0220, ADR 0221, ADR 0225, ADR 0246

## Decision

Settings > Agent has separate Workflows and Skills destinations. Workflows
lists Nexus guides and author-owned workflow packages. Skills lists global
and project user skills. Each destination fetches only its own records and
has independent search, level filtering, counts, and actions. The active
workflow inspector opens Workflows.

The two destinations reuse the capability-page layout. This navigation change
does not merge their registries, alter their activation or permission rules,
or prevent future workflow-to-skill recommendations.
