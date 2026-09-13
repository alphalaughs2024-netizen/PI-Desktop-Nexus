# ADR 0231: Reliable Window Controls and Work-Panel Resource Actions

## Status

Accepted

## Decision

Windows/Linux renderer controls use the preload platform value when available,
with a browser-platform fallback instead of assuming macOS. Failed control
IPC calls produce a concise toast. Work-panel resource actions ensure a
session in the selected project before opening; missing project or browser
capabilities produce visible feedback and never silently no-op.

## Consequences

Settings and base Dark use the semantic sidebar surface, while Twilight remains
an additive theme. Session-owned tabs and native window isolation are preserved.
