# UI Phase E Browser theme parity

Phase E keeps Browser structure and behavior unchanged while making the four
scenic themes consume one complete semantic Browser token contract.

## Theme targets

- Alpine Light uses ice-white surfaces, dark navy text, stronger borders, and blue focus.
- Twilight Mountains uses indigo glass, cool-blue focus, and green readiness.
- Obsidian Horizon uses near-black blue surfaces, silver borders, and restrained blue focus.
- Emerald Afterglow uses green-black glass, mint focus, and green readiness.

Each theme defines exactly one value for every Browser token: panel/raised
surfaces, tab states, toolbar/address surfaces, border/focus, ready/loading/error,
text/muted text, and New Tab surface.

## Browser ownership and contrast

Browser selectors use Browser semantic tokens for chrome, menus, diagnostics,
state surfaces, controls, disabled controls, and focus rings. Generic design
tokens may remain only as explicit fallbacks. Native guest pixels remain
guest-owned and are never recolored by renderer CSS.

All four themes must distinguish active/inactive/loading tabs, readable address
text, disabled controls, readiness/error states, and visible keyboard focus.
New Tab and recovery surfaces remain opaque enough to prevent scenic backdrop
bleed-through. Reduced-motion behavior removes decorative state transitions.
