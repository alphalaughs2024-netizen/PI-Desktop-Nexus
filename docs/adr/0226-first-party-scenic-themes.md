# 0226 — First-party scenic themes use a base palette and semantic token layer

Status: Accepted

## Context

Nexus needs an optional immersive theme without weakening plugin CSS isolation,
turning every component into an image host, or disrupting native controls and
plugin panels that consume the established light/dark appearance contract.

## Decision

First-party built-in themes are registered centrally. A scenic theme declares a
compatible base palette and keeps `data-theme` set to that base while applying
its visual identity through a separate `data-scenic-theme` attribute.

Twilight Mountains is the first implementation. It packages one local backdrop
asset, mounts one pointer-inert app-shell backdrop, and overrides only semantic
design tokens. Glass blur is applied only to shell/floating surfaces. Reduced
transparency and unsupported-filter paths use opaque token surfaces instead.

The scenic asset is bundled by the desktop package. No remote fetches, user
background uploads, plugin asset permissions, or plugin CSS sanitizer changes
are introduced. Native Windows/Linux window background fallback receives the
named scenic selection and uses its dark navy color; macOS retains transparent
vibrancy behavior.

## Consequences

- Existing light, dark, system, and plugin themes retain their behavior.
- Plugin panels, native controls, color-scheme logic, and dark assets continue
  to resolve as dark for Twilight Mountains.
- Future first-party scenic themes can reuse the registry, app-shell backdrop,
  and token architecture without component-by-component styling or authority
  expansion.
