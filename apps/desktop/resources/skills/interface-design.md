---
name: Nexus interface design
description: use for concrete visual redesign, layout polish, or interaction design work in Nexus
---

Inspect the current screen, its theme tokens, neighboring controls, and any user-provided reference before changing the interface. Identify the primary task the screen supports and the state that needs the most attention. Keep the result consistent with Nexus rather than transplanting a reference layout wholesale.

For a proposed design, describe the main layout and interaction changes briefly. For an implementation request, make the authorized change and verify the actual rendered result. Pay attention to:

1. Information hierarchy and usable space at narrow and wide window sizes.
2. Hover, focus, active, disabled, loading, empty, and error states.
3. Keyboard access, readable contrast, text overflow, and predictable click targets.
4. Motion that explains a state change without delaying repeated work.
5. Theme behavior across Nexus's shipped themes, including translucent surfaces.

Use existing components and tokens where they fit. Check the screen itself after editing; a passing typecheck cannot establish visual quality. Keep visible copy limited to decisions and actions the user needs. This guide does not grant file access, browser access, or permission to change unrelated screens.
