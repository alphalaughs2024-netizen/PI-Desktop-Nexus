# 0227 — High-fidelity scenic themes use scoped material tiers

Status: Accepted

## Context

The base-palette and semantic-token approach in ADR 0226 makes a scenic theme
compatible with Nexus's dark/light and plugin contracts, but tokens alone do
not express the distinct material hierarchy of an immersive first-party theme.
Twilight Mountains needs bright navigation glass, an atmospheric canvas, a
focal composer, and safety-critical surfaces that remain readable regardless
of the backdrop.

## Decision

First-party scenic themes may add tightly scoped component material selectors
alongside semantic tokens. Each scenic theme defines named tiers for its
atmosphere, shell glass, navigation glass, raised glass, opaque safety surface,
luminous border, and focus/selection glow.

Selectors remain limited to existing renderer surfaces and never change layout
ownership, positioning, sizing, drag regions, or native window-control bands.
Filters may be used only on a small set of large composited surfaces. Repeated
transcript/list rows, code, and tool output must not use backdrop filtering.
Menus, dialogs, permissions, code, tool output, and controls use the opaque
safety tier; reduced-transparency and unsupported-filter paths use the same
readable opaque material without blur.

Twilight's empty home may use a theme-only presentation marker to suppress its
mascot and show the localized build greeting. Other built-in and plugin themes
retain the normal empty-home behavior.

## Consequences

- First-party scenic themes can achieve a coherent visual hierarchy without
  altering global layout or normal-theme styling.
- Windows/Linux native chrome and macOS's existing platform treatment remain
  unchanged; no simulated platform controls or outer-window masks are added.
- The existing first-party-only asset, authority, and plugin CSS isolation
  boundaries from ADR 0226 remain in force.
- Future scenic themes must provide material tiers and readable no-blur
  fallbacks rather than applying a generic blur to arbitrary components.
