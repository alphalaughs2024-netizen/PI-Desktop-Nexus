# ADR 0184: Portal boundaries for sidebar project organization surfaces

- Status: Accepted
- Date: 2026-09-18

## Context

The project-group assignment surface and the create-group surface have
different interaction contracts. The assignment surface is a non-blocking side
panel anchored to a sidebar row. The create-group surface is a true dialog
centered in the application viewport. Rendering either surface inside the
sidebar makes viewport coordinates vulnerable to sidebar scrolling, overflow,
transforms, scenic shells, and stale row measurements.

## Decision

`ProjectCollectionPicker` is rendered through a body portal and uses
`getBoundingClientRect()` coordinates with `position: fixed`. Its placement
prefers the main-content side, flips only when the viewport cannot fit it,
clamps against titlebar-safe and bottom-safe bounds, and remeasures on resize,
scroll, anchor/panel resize, and main-pane geometry changes. It has no blocking
backdrop and does not own project or membership state.

`ProjectGroupCreateDialog` is rendered through a body portal and centered by a
viewport-safe modal backdrop. It owns only transient name input; persistence,
normalization, and empty-group visibility remain in the existing app store.

The sidebar remains the semantic tree: group header, indented project row,
indented project session rows, and a separate standalone-session section.
Existing canonical project paths, collection memberships, session IDs,
Context Vault ownership, drag thresholds, and ordering operations remain
authoritative.

## Boundaries

- Ellaine's repository is a behavioral and interaction reference only; no code
  is copied from it.
- Scenic backdrops remain pointer-inert and plugin themes remain isolated.
- Opaque/tinted surfaces preserve readability over scenic themes.
- Native titlebar controls, resize edges, work-panel geometry, Browser, Files,
  and Context Vault hit areas remain outside the assignment panel's interaction
  surface.
- No project, session, transcript, or Context Vault data is deleted or moved
  as a result of UI hierarchy or positioning changes.
