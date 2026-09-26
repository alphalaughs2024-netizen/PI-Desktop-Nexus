# ADR 0240: Shared Work Panel resource ownership

## Status

Accepted

## Decision

The renderer owns a registry of Work Panel resource definitions. The generic
frame owns presentation, focus, visibility, inertness, and lifecycle boundaries;
resource components own only their content and safe local state. Open resources
remain mounted while inactive and are disposed only when explicitly closed.

Browser remains Main-owned for BrowserHost, BrowserBroker, guest identity,
WebContentsView ownership, navigation policy, and CDP allowlisting. Its renderer
guest surface reports only bounded geometry through a centralized,
requestAnimationFrame-coalesced coordinator with generation invalidation.

No resource component may import Electron, access WebContents/CDP, mutate
resource identity, or bypass the existing Main security boundary.

## Consequences

- Files, Review, Context Vault, Prompt Inspector, and plugin views share the
  same docked/maximized semantics and accessibility behavior.
- Inactive resources preserve local state and do not recreate Browser guests.
- Explicit close is the disposal boundary, keeping state transitions predictable.
- Browser geometry and focus behavior can be tested independently from the
  generic resource registry.
