# ADR 0260: Exact model selection for every subagent

- Status: Implemented; manual acceptance pending
- Date: 2026-10-01
- Related: ADR 0062, ADR 0256, ADR 0259

## Decision

Every built-in and user-owned subagent row exposes the existing searchable,
provider-grouped model picker. Current means no model pin: delegation uses the
parent's provider/model when the worker starts. It does not change a running
worker. Selecting a model persists its stable provider ID and exact model ID.
Model IDs may contain slashes. No automatic model or provider fallback occurs.

Rust continues to own user documents. A row model change sends agents.setModel,
which replaces only model/provider frontmatter fields and preserves the exact
remaining document bytes, including custom fields, tools, permissions and prompt.
This avoids the general editor's document reconstruction. Model input cannot
contain line breaks; atomic replacement preserves prior contents on failure.
Electron Main owns built-in model preferences in the profile's
agent-capabilities/builtin-subagent-models.json, alongside existing Main-owned
capability metadata. This contains only model identifiers, never credentials.
Atomic replacement preserves the previous file on write failure. Invalid
preferences fail explicitly rather than dropping pins. Built-in preferences
are applied before catalog merge and provider resolution; user definitions
retain their established precedence over built-ins.

The additive renderer subagentSetModel IPC validates the source, preset and
configured provider/model before saving. Built-in source files remain immutable.
Catalog and launch use the same preferences. Changes apply at the next parent
launch; an existing worker retains its execution configuration. Legacy document
pins remain supported; ambiguous aliases are not presented as a specific endpoint.
Missing/disabled providers, removed configured models and unavailable capabilities
remain explicit errors. The opt-in Codex engine and appearance are unchanged.

## Validation

Targeted checks cover persistence, clearing to Current, user/built-in precedence,
duplicate provider names, model IDs with slashes, stale selection rejection,
corrupt preferences, exact worker configuration and parent model inheritance.
Manual acceptance and packaged validation remain separate gates. Full local
E2E suites are not run without a request.
