# ADR 0277: Themed composer reasoning slider

- Status: Accepted
- Date: 2026-10-03

## Decision

Replace the combined model/reasoning popover's two-entry root and separate
reasoning radio list with an English MuFeng-inspired slider. Preserve the
searchable provider/model pane and existing session configuration ownership.
The outer surface is a dialog because it contains a native range, buttons and
model search; the model list keeps its existing menu semantics.

Use React, CSS, a native range and a bounded decorative canvas. No animation
dependency or upstream plugin injection is needed. Only model-supported levels
are selectable. Pointer previews remain local until release; keyboard and
caption/reset selections commit through the existing configuration/staging API.
Save errors restore the persisted selection. No host protocol or storage change.

Use the approved four scenic palettes, including warm charcoal Obsidian with
ivory particles. Canvas motion reflects selected effort; it stops for Off,
reduced motion, hidden documents and unmount. Preserve the compact brain trigger.

## Reference

Visual and interaction reference: MuFeng262/dsh-thinking-slider (MIT):
https://github.com/MuFeng262/dsh-thinking-slider
The 180ms eased thumb/fill motion and lifespan-faded particle treatment are
adapted from `lib/client.js` at commit
`f46e37017cbbf9bea9df6ac33572e3cb6d22a6fa`. Its MIT notice ships as
`assets/licenses/MuFengThinkingSlider-MIT.txt`. The implementation is
Nexus-native and does not execute the upstream plugin bundle.

The native range owns discrete selection and accessibility; a decorative thumb
eases between its positions. Gradient colours interpolate with registered CSS
colour properties. The bounded particle field survives effort/theme changes,
easing density, speed and colour while preserving particle lifespans. Its
canvas keeps the rail width while the fill clips it, preventing fill animation
from restarting the rendering loop. Reduced motion disables all these effects.

## Consequences

Reasoning is available immediately without an extra submenu. The native range
supplies keyboard and assistive-technology semantics. Model capability policy,
runtime selection, queued configuration and persistence stay under their
existing owners.
