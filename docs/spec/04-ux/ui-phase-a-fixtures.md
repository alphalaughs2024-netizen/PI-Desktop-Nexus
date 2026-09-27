# UI Phase A baseline fixture manifest

These fixtures are stable targets for UI Phases B–G. They are renderer-only
fixtures and must not require live navigation, Main-process mutation, or real
credentials.

| Fixture | Required state | Themes |
| --- | --- | --- |
| `shell-browser-docked` | full Sidebar / conversation / docked Browser | all four scenic themes |
| `browser-new-tab` | about:blank, address focused, New Tab surface | all four scenic themes |
| `browser-one-tab` | one active tab, compact status, toolbar | all four scenic themes |
| `browser-multiple-tabs` | active/inactive/loading tabs, New Tab control | all four scenic themes |
| `browser-loading` | loading status, stable toolbar geometry | all four scenic themes |
| `browser-ready` | safe title/source/status row | all four scenic themes |
| `browser-surface-unavailable` | compact recovery notice and actions | all four scenic themes |
| `browser-diagnostics` | hidden/open diagnostics drawer | all four scenic themes |
| `shell-sidebar-collapsed` | collapsed Sidebar and focus states | all four scenic themes |
| `shell-composer-focused` | focused/unfocused composer and operation card | all four scenic themes |
| `browser-narrow` | narrow tab overflow and two-row toolbar | all four scenic themes |
| `browser-reduced-motion` | immediate state changes and visible focus | all four scenic themes |

Phase A establishes the fixture names, required state, and theme matrix. Phase
B keeps this fixture manifest and adds the Browser card hierarchy contract:
one meaningful header, a separate safe source row, compact tabs and toolbar,
one readiness strip, and renderer-owned New Tab/error surfaces. Later phases
add screenshot baselines and interaction coverage. Phase C extends the Browser
fixtures with header-menu keyboard use, roving tab focus, Ctrl/Cmd+Tab cycling,
focus restoration after close/menu dismissal, and stable toolbar slot checks.
Phase D adds exact-state expectations: opaque address-focused New Tab, compact
Loading/Ready states, Surface unavailable recovery, Policy blocked, Debugger
unavailable, Browser closed/Reopen, and reduced-motion state transitions. Every
Browser state fixture remains required under all four scenic themes.
