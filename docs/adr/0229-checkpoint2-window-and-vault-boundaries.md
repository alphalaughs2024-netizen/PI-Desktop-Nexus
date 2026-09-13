# ADR 0229: Checkpoint 2 window-control and Context Vault boundaries

## Status

Accepted

## Context

Nexus uses a frameless Windows/Linux shell with renderer-drawn native window
controls and a session-scoped docked work panel. During panel presentation, the
titlebar must not reclaim the fixed control band. Context Vault is also
session-owned, while project selection can briefly lag during session or
workspace transitions.

## Decision

Keep the native control band viewport-fixed and reserved by every draggable
titlebar state, including an open work panel. Context Vault remains unavailable
until a chat session exists, with a localized explanation, and resolves its
project path from the active session first, falling back to the active workspace
only when no session path is available.

## Consequences

Minimize, maximize/restore, and close retain stable hit regions above the panel
and sidebar. A retained Context Vault cannot silently no-op or briefly read a
different project during handoff. The panel remains session-scoped by design;
opening a vault does not create a synthetic session or broaden project access.
