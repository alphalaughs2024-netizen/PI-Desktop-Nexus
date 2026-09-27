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

## Reference matrix

| Reference | Theme selector | Browser visual target |
| --- | --- | --- |
| `alpine light.png` | `alpine-light` | Pale ice-blue/white surfaces, dark navy ink, crisp blue focus, stronger light borders |
| `twlight mountains.png` | `twilight-mountains` | Deep indigo glass, cool-blue focus, green readiness, raised active tab |
| `obsidian black.png` | `obsidian-horizon` | Near-black blue surfaces, silver-gray borders, restrained blue focus |
| `emerald after glow.png` | `emerald-afterglow` | Green-black glass, mint focus, green readiness, muted inactive tabs |

Acceptance compares hierarchy, opacity, contrast, spacing, and state treatment
at approximately 1671×940 plus a narrow Browser viewport; it does not require
pixel identity with the supplied images.

## Browser ownership and contrast

Browser selectors use Browser semantic tokens for chrome, menus, diagnostics,
state surfaces, controls, disabled controls, and focus rings. Generic design
tokens may remain only as explicit fallbacks. Native guest pixels remain
guest-owned and are never recolored by renderer CSS.

All four themes must distinguish active/inactive/loading tabs, readable address
text, disabled controls, readiness/error states, and visible keyboard focus.
New Tab and recovery surfaces remain opaque enough to prevent scenic backdrop
bleed-through. Reduced-motion behavior removes decorative state transitions.
