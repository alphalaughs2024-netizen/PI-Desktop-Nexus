# Nexus Skill System Hardening Design

## Goal

Correct the seven audited safety and consistency gaps in Nexus's existing
on-demand Skill system. This change does not ship a new Superpowers workflow
pack, copy Codex instructions, or change provider selection.

## Boundaries

- Nexus owns its Electron plugin state and its global user-skill directory.
  Project skills remain at `<project>/.agents/skills`, where they are portable
  project content.
- The initial model prompt contains only a deterministic, bounded metadata
  catalog. A document body remains opt-in through the existing `Skill` tool.
- `Skill` is a read-only document loader and is available in Agent, Plan, and
  Goal. This does not admit writes, plugin mutation tools, or delegation to the
  contract modes.
- First-party, user-owned, and plugin-contributed documents remain distinct.
  Loaded document text is guidance only: it cannot grant tools, permissions,
  automatic execution, access outside normal guards, or bypass confirmations.
- Existing bundled documents gain Nexus ids. The legacy PI-Desktop ids remain
  accepted only as non-advertised aliases so old transcripts cannot break.

## Data and Catalog Design

`PluginRuntime` receives the already-resolved Nexus `dataDir`; it does not
recompute a profile root. Global user skills are read and written beneath
`<dataDir>/agents/skills`. This uses the Nexus data root in production and an
explicit development/test override when one is supplied. Project skills keep
their `.agents/skills` convention and precedence.

`instructionCatalogWithinBudget` owns one fixed 8,000-character cap. It sorts
deterministically by source priority (bundled Nexus, user, plugin) and then
name/id. It includes whole entries only. The same selected list is passed to
the sidecar and recorded per session, so an omitted entry cannot be loaded by
guessing its id. The catalog prompt renders only that selected list.

## Modes and Trust

The runtime creates the local `Skill` tool whenever the bounded catalog is
non-empty, regardless of Agent, Plan, or Goal mode. Electron's sidecar proxy
continues to reject mutating local/plugin tools in Plan mode, but explicitly
does not reject `Skill`.

The catalog has separate Nexus, user-Skill, and plugin-guidance sections. The
fixed prompt and tool result preamble state that loaded text is not authority
to invoke tools or change permissions. Tool permissions and host policy remain
the enforcement boundary; the wording is defense in depth, not a claim to
eliminate prompt injection.

## Settings

The Skills settings page receives a read-only Nexus workflow section backed by
new local IPC calls. It lists shipped documents separately from user-owned
recipes, exposes their source/version/read-only state, permits inspection, and
persists enablement beneath the Nexus data root. It intentionally does not
allow editing or deletion of app-shipped files.

## Validation

Unit tests cover catalog order/caps/trust prompt and Agent/Plan/Goal tool
composition. Rust tests cover the Nexus global root while preserving project
roots. Desktop contract tests cover the explicit plugin `dataDir`, local IPC,
Nexus naming, and the distinct settings section. The focused Rust, runtime,
and desktop suites are run; E2E is documented but not run unless requested.
