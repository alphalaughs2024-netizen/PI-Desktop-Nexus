# ADR 0217: Native Context Vault owns durable project knowledge

## Decision

PI Desktop Nexus owns Context Vault claims in host-core SQLite schema 16. It is
available as a native work-panel tab and native runtime tools, independent of
plugin loading. Claims are scoped by project path. The legacy
`local.context-vault` plugin and its settings are neither read nor migrated.

The agent receives relevance metadata only; it explicitly requests a brief
when useful. Saving is optional, evidence-backed, and limited by guidance to
one qualifying claim per task. Export/import uses a reviewable JSON v1 pack,
with workspace-relative evidence only and preview-and-merge semantics.

## Consequences

The vault is not a transcript, workspace index, session store, or secret
store. Project switches are isolated, and deleting a claim is the only native
delete path. Native ownership makes its availability reliable even if plugins
are disabled, while preserving the plugin as an untouched archive.
