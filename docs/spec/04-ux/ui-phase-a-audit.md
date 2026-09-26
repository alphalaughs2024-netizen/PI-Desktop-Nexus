# UI Phase A audit and foundation manifest

Reference source: `C:\Users\aksha\Downloads\visual ref`

Reference themes: Alpine Light, Emerald After Glow, Obsidian Black, and
Twilight Mountains.

| Surface | Current implementation | Reference target | Foundation token/contract |
| --- | --- | --- | --- |
| App shell | `.app-shell` plus scenic backdrop | Sidebar / conversation / Browser card | `--shell-*` |
| Sidebar | `Sidebar` and `chrome.css` rows | compact grouped navigation, quiet active row | shell spacing, surface, focus |
| Main titlebar | chat titlebar selectors | one aligned 48px titlebar | `--shell-titlebar-height` |
| Agent operation card | `ActiveWorkflowCard` | compact grouped glass card | surface radius/border/shadow |
| Chat content | `ChatSurface` / transcript styles | calm readable rhythm over scenic backdrop | content gutter, panel gap |
| Composer | `composer.css` | wide rounded glass composer and grouped controls | control height, radius, focus |
| Work Panel frame | `WorkPanelFrame` | one restrained Browser card frame | surface border/radius/shadow |
| Browser header | frame + Browser chrome | one meaningful Browser header | Browser header ownership |
| Browser tabs | `BrowserTabStrip` | raised active tab, quiet inactive tabs | Browser tab tokens |
| Browser toolbar | `BrowserToolbar` | address field as strongest control | toolbar/address tokens |
| Status | readiness/operation/error components | one compact semantic status row | ready/loading/error tokens |
| New Tab | Browser-owned renderer state | opaque themed start surface, address focus | `--browser-new-tab-surface` |
| Diagnostics | `BrowserDiagnosticsDrawer` | secondary hidden drawer | surface hierarchy/focus |
| Focus/motion | shared `:focus-visible`, media queries | visible rings, reduced decorative motion | shell/browser focus/motion |

Known Phase A risks to resolve in later UI phases: duplicated Browser title
rows, repeated “Browser ready” copy, scenic bleed-through under New Tab,
one-off control heights, nested opaque cards, Alpine contrast, and inconsistent
Sidebar/composer spacing. Phase A defines the tokens and contracts; Phases B–D
perform the visible restructuring.

## Component ownership

- `BrowserCoreTab`: composition and state selection only.
- `BrowserTabStrip`: tab chrome, selection, close/new controls, keyboard focus.
- `BrowserToolbar`: navigation controls, address, actions, overflow.
- `BrowserReadinessStrip`: one compact status row.
- `BrowserGuestSurface`: measured native guest rectangle only; no fallback copy.
- `BrowserOperationStatus`: stable polite live region.
- `BrowserErrorNotice`: stable alert/recovery copy.
- `BrowserEmptyState`: New Tab/no-page presentation.
- `BrowserDiagnosticsDrawer`: hidden-by-default safe diagnostics.

