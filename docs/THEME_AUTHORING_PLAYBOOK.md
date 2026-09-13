# Nexus Theme Authoring Playbook

## Purpose

This is the practical handoff for creating a new Nexus theme without breaking
the application. It records the architecture, decisions, visual lessons,
failures, fixes, validation method, and delivery rules learned while building
and polishing **Twilight Mountains**, Nexus's first opt-in first-party scenic
theme, and **Alpine Light**, its second scenic reference implementation.

Read this document before designing or implementing a theme. It is deliberately
more detailed than an ordinary feature note: a new theme affects every visible
surface, native window behavior, accessibility, rendering performance, plugin
boundaries, persistence, packaging, i18n, and the CSS cascade. A theme that
looks good in one screenshot but breaks Settings, a permission card, a narrow
window, or a normal theme is not complete.

This guide is for a future human or AI working in the **PI Desktop Nexus**
repository. It describes Nexus. Do not paste paths, component names, platform
assumptions, visual assets, or tool calls from other applications into Nexus.

## Non-negotiable outcome

A new theme must be:

- optional and never the default unless the user explicitly changes that rule;
- integrated as a first-party built-in, not a loose CSS experiment;
- readable on every supported screen, including dense and safety-critical UI;
- compatible with Windows/Linux native chrome and the existing macOS behavior;
- compatible with plugin panels and the existing light/dark base contract;
- safe under reduced-transparency preferences and without `backdrop-filter`;
- performant while streaming, scrolling, and opening menus;
- isolated from the real/upstream Pi Desktop checkout;
- shipped with targeted tests, specs, E2E-plan coverage, commits, and local
  merge only unless a remote push is explicitly requested.

## The central model: a theme is a product package, not a stylesheet

A complete Nexus first-party theme has several coordinated pieces:

```text
User selection in Settings
        |
        v
ThemePreference + built-in registry
        |
        +----> localized picker name and description
        |
        v
App runtime resolution
  - ordinary base: system / light / dark
  - optional scenic marker: data-scenic-theme
        |
        +----> native window background fallback
        +----> plugin/native dark-light compatibility
        +----> one app-shell backdrop (if scenic)
        |
        v
Semantic design tokens + tightly scoped material selectors
        |
        +----> normal, reduced-transparency, unsupported-filter paths
        |
        v
Tests + docs + E2E scenario + packaged local asset
```

The key separation is this:

- `data-theme` says which ordinary **base palette** Nexus and plugin/native
  integrations should use (`light` or `dark`).
- `data-scenic-theme` says which optional first-party visual treatment is
  active. It is additive, not a replacement for the base contract.

For example, Twilight Mountains resolves as dark while also setting:

```html
<html data-theme="dark" data-scenic-theme="twilight-mountains">
```

That lets native controls, dark-mode logic, plugin panels, and dark-compatible
assets keep working while Twilight supplies a separate scenic identity.

Do not make a scenic theme pretend it is a third independent base color scheme.
Doing so would fracture assumptions across native windows, contributed plugin
CSS, and renderer components that legitimately only understand light or dark.

## Existing source of truth

Start by reading these files in full. They define the contract future themes
must preserve.

| Responsibility | Current Nexus source | Why it matters |
| --- | --- | --- |
| Architecture decision | `docs/adr/0226-first-party-scenic-themes.md` | Establishes the base-palette + scenic-marker model, first-party asset boundary, and native fallback rule. |
| High-fidelity material decision | `docs/adr/0227-high-fidelity-scenic-material-tiers.md` | Allows scoped component materials while forbidding layout ownership changes and broad blur. |
| Theme type persisted in settings | `packages/shared/src/types.ts` | `ThemePreference` must include every built-in id. |
| Built-in registry | `packages/shared/src/built-in-themes.ts` | Holds ordered built-ins, their base palette, and the scenic flag. |
| Registry contract test | `packages/shared/src/built-in-themes.test.ts` | Locks picker order/base/scenic semantics. |
| Settings picker | `apps/desktop/src/components/settings/ThemeRow.tsx` | Uses the registry, maps ids to translation keys, and keeps plugin themes in the same searchable picker. |
| Runtime resolution + marker | `apps/desktop/src/App.tsx` | Owns `data-theme`, `data-scenic-theme`, plugin CSS withdrawal, and native-window color updates. |
| One shared scenic backdrop | `apps/desktop/src/App.tsx` and `apps/desktop/src/styles/base.css` | The backdrop is mounted once directly below application content. |
| CSS import order | `apps/desktop/src/styles/globals.css` | Scenic CSS is intentionally after ordinary component CSS and before responsive overrides. |
| Twilight reference implementation | `apps/desktop/src/styles/twilight-mountains.css` | Dark scenic material tiers, scoping, fallbacks, and interaction-safe Settings treatment. |
| Alpine reference implementation | `apps/desktop/src/styles/alpine-light.css` | Light scenic materials, white-glass Settings surfaces, row-list parent neutralization, and fallbacks. |
| Empty-home theme variation | `apps/desktop/src/components/ChatSurface.tsx` | Shows how to make a presentation-only theme variation without changing normal-theme behavior. |
| Renderer-to-main native API | `apps/desktop/src/lib/api.ts` | Defines the named native background values allowed from renderer code. |
| Native window behavior | `apps/desktop/electron/main/index.ts` | Resolves Scenic-to-dark plugin/native appearance and applies Windows/Linux fallback colors. |
| Packaged scenic assets | `apps/desktop/package.json` and `apps/desktop/resources/themes/` | Keeps first-party images local and available in production packages. |
| Theme contract tests | `apps/desktop/test/twilight-mountains-theme.test.mjs`, `apps/desktop/test/alpine-settings-theme.test.mjs` | Contract-focused protection for scenic activation, materials, Settings ownership, and known regressions. |
| UX and component contracts | `docs/spec/04-ux/06-settings-ia.md`, `docs/spec/04-ux/07-ui-design-system.md`, `docs/spec/04-ux/08-component-spec.md` | Defines behavior and visual constraints that must remain true. |
| User-visible manual scenario | `docs/spec/06-delivery/04-e2e-test-plan.md` | Contains Twilight and Settings-wide manual test coverage. |

Useful commands to find all current theme touchpoints are:

```powershell
rg -n 'twilight-mountains|data-scenic-theme|ThemePreference|BUILT_IN_THEMES' `
  apps/desktop packages/shared docs

rg -n 'setWindowBackgroundColor|themeTwilightMountains' `
  apps/desktop packages shared
```

Do not rely on memory of this document alone. Code and specs can evolve; always
re-read the current source before changing it.

## Product and architecture boundaries

### First-party versus plugin themes

Nexus supports two distinct kinds of themes. The existing **plugin CSS
isolation** boundary is part of this distinction and must remain intact:

1. **Built-in themes** are application-owned. They may be System, Light, Dark,
   or a registered scenic theme. A scenic built-in may bundle a local asset,
   mount the shared backdrop, supply dedicated material CSS, and request a
   named native fallback color.
2. **Plugin themes** are contributed CSS. They remain subject to plugin CSS
   isolation and their existing `ui.theme` permission model. They do not gain
   access to the scenic backdrop, local first-party image assets, arbitrary
   native colors, changed permissions, or broader renderer authority.

Never "solve" a missing scenic capability by loosening plugin CSS sanitization
or granting an extra plugin permission. That changes the trust and authority
boundary, not merely appearance.

### Built-ins are opt-in and ordered

The existing registry is intentionally ordered:

```ts
export const BUILT_IN_THEMES = [
  { id: "system", base: "system" },
  { id: "light", base: "light" },
  { id: "dark", base: "dark" },
  { id: "twilight-mountains", base: "dark", scenic: true },
  { id: "alpine-light", base: "light", scenic: true },
] as const;
```

The picker derives its built-in order from that registry and appends plugin
themes after a divider. When adding a theme, decide and document where it
belongs. Do not hard-code a second list in `ThemeRow.tsx`; duplicated lists
drift and lead to selectable-but-unresolvable themes.

### Dark or light is still mandatory

Every scenic built-in must choose `base: "dark"` or `base: "light"` unless the
theme is truly the ordinary System choice. Choose the base that keeps the
majority of the theme's native controls, plugin panels, color scheme, and
existing semantic palette correct.

Twilight is dark because its surfaces, luminous text hierarchy, menus,
permissions, and native fallback are dark-compatible. It does not turn the
system into an unsupported `twilight` color-scheme.

### Do not alter authority

A theme must not:

- add a model tool;
- change permission prompts or defaults;
- weaken plugin isolation;
- use remote image downloads;
- add user-uploaded backgrounds unless a separately approved architecture and
  security design exists;
- modify workspace files or user data;
- change the upstream Pi Desktop application.

Themes are visual packages. They do not have their own runtime authority.

## The Twilight Mountains implementation map

Twilight is the reference implementation, but future themes should reuse its
architecture rather than copy its exact colors, assets, or selector list.

### Runtime lifecycle

At startup and whenever Settings change, `App.tsx`:

1. reads `settings.theme`;
2. determines whether it is a registered built-in or an installed plugin theme;
3. resolves the ordinary base (`system`, `light`, or `dark`);
4. sets `document.documentElement.dataset.theme` to the resolved base;
5. mounts plugin CSS only for a valid plugin theme and removes it otherwise;
6. sets `data-scenic-theme` to the selected registered scenic id (Twilight
   Mountains or Alpine Light), and deletes the marker for every other selection;
7. calls the Electron main-process API with either the normal resolved base or
   the scenic id so the native window background does not flash an unrelated
   color around the renderer;
8. listens for OS theme changes only if the selected base is `system`.

The deletion step is as important as activation. A theme can appear to work
until the user switches away; then stale data attributes, old backgrounds, or
plugin style nodes create a half-applied UI. Every new theme requires explicit
tests for activation **and removal**.

### Backdrop architecture

The app renders one backdrop in `App.tsx`:

```tsx
<div className="app-scenic-backdrop" aria-hidden />
```

`base.css` keeps it hidden by default and ensures ordinary app children paint
above it:

```css
.app-shell {
  position: relative;
}

.app-shell > :not(.app-scenic-backdrop) {
  z-index: 1;
}

.app-scenic-backdrop {
  display: none;
}
```

Twilight's stylesheet enables and paints that one layer only under its scenic
marker. The background is `pointer-events: none`, so it cannot intercept drag,
selection, click, keyboard, or file-drop behavior. It paints the supplied local
image with `cover`, an intentional focal position, minimal blur/saturation, and
an overlay gradient that supports legibility while still showing the scene.

This is much safer than putting an image or blur on every page, panel, or list
row. One backdrop means consistent composition, low compositing cost, no
repeated network/asset behavior, and no interactive hit-testing surprises.

### Asset packaging

Twilight's image is stored in:

```text
apps/desktop/resources/themes/twilight-mountains.png
```

and `apps/desktop/package.json` includes:

```json
{ "from": "resources/themes", "to": "themes" }
```

The renderer stylesheet refers to the development asset with a relative URL;
the package configuration makes the directory available in built artifacts.

For a new theme:

- use an asset the user is authorized to ship;
- keep it local and versioned in the repository;
- preserve the original artwork unless the user specifically authorizes image
  editing;
- tune visual composition in CSS before modifying the source image;
- assert in tests that the asset exists, is non-empty, and is included in the
  desktop package configuration;
- do not add a remote URL, data collection, a plugin asset request, or a live
  download fallback.

### Native window background

The native window can be visible during startup, resize, transparent gaps, or
renderer recovery. Its fallback must agree with a scenic theme.

Twilight extends the renderer API type and main-process validation to accept:

```ts
"light" | "dark" | "twilight-mountains"
```

Electron main resolves Twilight to `#071326` for Windows/Linux. macOS retains
its existing transparent/vibrancy behavior. A future scenic theme needs a named
fallback that is:

- close to its deepest stable shell color;
- valid before the renderer has loaded;
- non-flashing beside its backdrop and glass;
- passed only through a validated allowlist, not arbitrary CSS strings from the
  renderer.

Do not accept raw colors from renderer state. A fixed named theme-to-color map
in the trusted main process keeps the boundary narrow and auditable.

## Material system: design semantic tiers before writing selectors

The difference between a coherent scenic UI and an app merely placed over a
wallpaper is a material hierarchy. Start by naming material roles, not by
styling individual components one at a time.

Twilight defines these roles in `twilight-mountains.css`:

| Tier | Twilight token | Job |
| --- | --- | --- |
| Atmospheric canvas | `--twilight-atmosphere` | Lets the scene remain visible behind large content areas. |
| Shell glass | `--twilight-shell-glass` | Main shell, Settings content shell, work panel, plugin page. |
| Navigation glass | `--twilight-navigation-glass` | Sidebar, rails, title bars, and other navigation/chrome bands. |
| Raised glass | `--twilight-raised-glass` | Raised content that remains related to the shell. |
| Safety surface | `--twilight-safety-surface` | Dense, floating, high-risk, or independently readable UI. |
| Luminous border | `--twilight-luminous-border` | Glass edge definition without harsh opaque outlines. |
| Focus glow | `--twilight-focus-glow` | Keyboard focus, selection, and active interactions. |
| Settings surface | `--twilight-settings-surface` | Readable raised panels/rows in Settings. |
| Settings control | `--twilight-settings-control` | Inputs, pickers, filters, and segmented-control base. |
| Settings strip | `--twilight-settings-strip` | Compact capability group headers. |

The exact number of tiers may vary, but new themes need enough distinct layers
to make the following immediately understandable:

- what is background atmosphere;
- what is application navigation;
- what is current working content;
- what is interactive and editable;
- what is floating;
- what is selected or focused;
- what is safety-critical and must stay legible regardless of imagery;
- what is disabled.

If every surface uses the same alpha value, the UI loses hierarchy. If every
surface becomes opaque, the scene disappears. If every surface is translucent,
dialogs, tool output, code, permissions, and settings controls become hard to
read. Good immersive themes deliberately use all three: atmospheric, glass,
and opaque safety layers.

### Text, status, and focus hierarchy

Set semantic design tokens as well as scenic tiers. Twilight sets values for:

- `--ds-text-primary`, `--ds-text-secondary`, `--ds-text-muted`, and
  `--ds-text-faint`;
- primary, secondary, raised, inset, and elevated backgrounds;
- default, subtle, and strong borders;
- hover, active, tile, and chip surfaces;
- success, warning, error, info, purple, accent, and accent-soft colors;
- dialog and composer shadows.

Text over an image cannot use a color simply because it looked attractive in a
mockup. Evaluate it against the brightest and darkest portions of the actual
image. In particular, confirm contrast for muted labels, disabled text,
placeholder text, badge text, status text, focus indicators, and destructive
actions. They are commonly missed because the primary heading may look fine.

Never hide a poor contrast problem by reducing important text opacity further.
Increase the surface opacity, strengthen text, or both.

### The composer is a focal surface

The composer is usually the visual anchor of an empty home and a chat. Twilight
gives the existing composer shell a scoped cobalt/navy material, a one-pixel
luminous border, an inner top sheen, restrained outer shadow, and a stronger
focus/file-drop state.

Theme styling must not change:

- composer width or max-width;
- height, padding, or control placement;
- keyboard handling;
- file-drop behavior;
- prompt streaming/rendering boundaries;
- the no-leading-brand-mark design;
- the existing home/docked composer geometry relationship.

When a composer looks wrong, correct paint (fill, border, shadow, contrast) at
the existing shell selector before changing its layout. Layout changes to fix a
visual problem are a common source of overlap and resize regressions.

### Navigation and title bars

Navigation glass should be a distinct, often stronger material. Twilight makes
the sidebar, sidebar rail, main titlebar, conversation topbar, Settings
titlebar, work-panel header, and Windows control band feel related without
changing their drag regions or reserved native-control widths.

Future themes must preserve:

- existing `-webkit-app-region` behavior;
- native Windows/Linux control hit regions and spacing;
- macOS's existing platform behavior;
- titlebar positions, z-index ownership, and resize behavior;
- real app layout geometry.

Do not add macOS traffic lights, a fake outer window radius, or macOS-specific
window geometry merely because a reference image happens to be macOS. Match the
reference's **material language**, not its foreign platform chrome.

### Floating and safety-critical surfaces

Use stronger, generally opaque material for:

- dialogs and sheets;
- menus, popovers, and search overlays;
- permission cards and approval UI;
- tool output and `pre` blocks;
- code blocks that function as code/output rather than incidental labels;
- Settings menus and controls;
- toasts;
- provider and authentication dialogs.

These surfaces need to make sense when placed over a bright cloud, busy
mountain ridge, or light lake area. Their job is clarity and safe action, not
maximum background visibility.

## The most important CSS rule: scope by role, never by generic element

The most instructive Twilight failure was a broad opaque-safety selector that
included a bare `code` element:

```css
/* Incorrect: affects every code element in the app. */
:root[data-scenic-theme="twilight-mountains"] :is(
  .permission-card,
  .tool-row-content,
  pre,
  code
) {
  background-color: var(--twilight-safety-surface);
}
```

It did make actual code/tool output readable. It also turned ordinary semantic
path labels in Settings into ugly black rectangles, because the MCP/Skills
capability header renders a normal path as:

```tsx
<code className="agent-capability-group-path">...</code>
```

The visible symptom was a black block behind values such as global and project
`.agents` locations. The root cause was not the MCP page. It was a generic CSS
element selector that ignored semantic context.

The repair had two parts:

1. Remove global `code` from the safety selector. Keep `pre`, actual tool
   output, permission cards, and specific floating surfaces as safety surfaces.
2. Add Settings-scoped materials and explicitly keep
   `.agent-capability-group-path` transparent/readable.

The durable rules are:

```text
Never theme bare code, button, input, div, section, or generic shell children
unless every occurrence truly has the same semantic role.

Prefer:
  [data-scenic-theme="my-theme"] .specific-surface { ... }

Avoid:
  [data-scenic-theme="my-theme"] code { ... }
  [data-scenic-theme="my-theme"] button { ... }
  [data-scenic-theme="my-theme"] .app-shell > * { ... }
```

When a theme needs broad coverage, use a bounded container and a deliberate
selector list of known roles. For example, Twilight styles Settings only under
`.settings-shell-full`, then separately enumerates Settings panels, rows,
controls, menus, and actions. This prevents transcript code and plugin content
from accidentally inheriting a Settings visual treatment.

## CSS cascade, specificity, and geometry protection

### Import order is behavior

`apps/desktop/src/styles/globals.css` is not a place to drop arbitrary rules.
Its order is the renderer cascade:

1. fonts and tokens;
2. base and chrome;
3. component sheets;
4. theme overrides and Settings/destination sheets;
5. the scenic stylesheet;
6. responsive rules last.

The scenic theme layer is late so it can override ordinary dark/light component
rules. Responsive rules remain later so the theme cannot accidentally defeat
narrow-window protections. Preserve that ordering unless an explicit
architecture decision says otherwise.

### Existing dark selectors can beat intentions

Some ordinary dark theme styles are more specific than a token change. An
example from Settings is a dark nav rule that explicitly paints the rail black.
Setting a high-level token is not enough if a later or more specific selector
still says `background: #000`.

The correct fix is a themed, scoped override of the actual surface, for example:

```css
:root[data-scenic-theme="my-theme"] .settings-shell-full .settings-nav {
  background: var(--my-theme-navigation-glass);
}
```

Do not edit the ordinary dark rule to make a scenic theme work. That risks
regressing Dark for all users. Inspect the computed cascade, identify the rule
that wins, and outrank it only inside the new theme marker.

### Paint-only theme work must not change geometry

A prior alignment repair demonstrated a subtle but dangerous failure mode:
using a broad theme selector that altered `position` on generic shell children.
That can break title bars, fixed controls, docked work panels, drag regions,
and overlays even when the original intent was only to control paint order.

Treat these properties as protected unless the theme request explicitly asks
for a behavior/layout change and the affected component contract is reviewed:

- `position`, `inset`, `top`, `right`, `bottom`, `left`;
- `display`, `flex`, `grid`, `order`, `place-*`;
- `width`, `height`, `min-*`, `max-*`, `margin`, `padding`, `gap`;
- `overflow`, `contain`, `transform` on layout owners;
- `z-index` on shared shell or fixed layers;
- `-webkit-app-region`;
- pointer events on interactive surfaces.

For a pure visual theme, modify color, background, border, shadow, opacity,
and existing-component-local decoration. If a new backdrop requires stacking,
use the dedicated backdrop and the existing base-shell stacking rule rather
than changing every child.

### Use CSS custom properties and semantic tokens first

Tokens ensure shared components adapt consistently. Scoped component selectors
are allowed for a high-fidelity theme where tokens cannot express a special
material hierarchy, but they should be the second step, not the first.

The correct order of thought is:

1. What semantic token should change for the entire theme?
2. Which existing surface needs a distinct material role beyond that token?
3. Can that role be targeted with an existing semantic class inside a narrow
   page/container?
4. Does the selector unintentionally include unrelated UI?
5. Does it alter only paint and not geometry?

## Settings is its own visual system: test every destination

Settings looks like one page but contains many different component families. A
theme that only checks the General screen is incomplete.

Twilight needed a dedicated Settings material layer because a single generic
dark safety treatment made controls black and made inline paths look like code
blocks. The current Twilight Settings layer covers:

- the full Settings shell and navigation rail;
- Settings panels, rows, shortcut rows, capability rows, and empty states;
- descriptions, notes, muted metadata, mono paths, and status text;
- text inputs, selects, textareas, search boxes, project pickers, shortcut
  recorders, font/language/theme triggers, and their placeholders;
- focused input/control states;
- segmented controls and their active segments;
- agent capability group strips, count pills, badges, keycaps, and paths;
- font/language/theme/provider/capability menus and their search controls;
- menu option hover/active states;
- primary, secondary, ghost, text, icon, shortcut, disabled, hover, and focus
  button states;
- toggles and their selected thumb.

Two easy omissions occurred and should be remembered:

1. Shared Settings actions do not all use `.btn-primary`, `.btn-secondary`, or
   `.btn-ghost`. Some use `.settings-icon-button`, `.settings-text-action`,
   shortcut-specific classes, or generic `.icon-btn` combined with provider or
   model classes. A new theme must inventory the actual class names used in
   Settings before declaring that "all buttons" are covered.
2. A list of broad visual roles can still accidentally include a semantic label
   whose element happens to be `code`. Always review Settings paths, badges,
   keycaps, action menus, disabled controls, and empty states separately.

Use repository search rather than guessing:

```powershell
rg -n 'className=.*(btn|button|action)|<Button|<TooltipButton' `
  apps/desktop/src/components/settings

rg -n '^\.(settings|model|provider|vendor|oauth|shortcut|agent)' `
  apps/desktop/src/styles/settings.css
```

### Settings-page issue and fix matrix

Use this matrix as a page-by-page implementation and review checklist. The
surface owner column is important: style the owning child surface, not a broad
ancestor that happens to wrap several tiles.

| Settings page/family | Common issue observed | Correct surface ownership/fix | Required regression check |
| --- | --- | --- | --- |
| General → Appearance | Section headings become large white rectangles; cards look merged. | Keep `.settings-card-block` and headings transparent. Style each mixed-content `.settings-panel` as one tile; keep spacing between sections. | Appearance, Network, and Close behavior headings remain on the scenic canvas. |
| General → Appearance controls | Theme, blur, language, font, and size controls inherit unrelated colors or opacity. | Scope triggers, fields, segmented controls, sliders, and toggles under the scenic marker; use one deliberate control tier. | Switch Alpine/Twilight/base themes and confirm no stale scenic tokens remain. |
| General → AI | Permission/default rows appear inside an outer tile or controls use mismatched fills. | Treat direct `settings-row` children as independent tiles; neutralize `settings-panel:has(> .settings-row)` parents. | Verify permission, mode, shell, link, toggle, and numeric-input rows individually. |
| General → Shortcuts | Shortcut rows are individually tiled but `.shortcut-map` paints a second rounded rectangle; recorder/action buttons are missed. | Make `.settings-panel.shortcut-map` transparent; style `.shortcut-row`, recorder, reset, disable, hover, focus, and disabled states. | Check Navigation and Agent groups, restore defaults, recording, reset, and narrow-window wrapping. |
| Skills / workflow packages | Skill rows look correct while the surrounding capability panel remains a translucent rectangle; group headers can be mistaken for tiles. | Keep `.agent-capability-panel` and `.agent-capability-list` transparent; style `.agent-capability-row` and empty states as child tiles. Keep group headers/path labels canvas-level. | Check built-in, global, project, and workflow groups, empty states, search, import, inspect, menu, and toggles. |
| Models → provider lists | Provider/model rows fall back to transparent `var(--ds-tile)` or a provider stylesheet restores clipping/background. | Explicitly style `.provider-row` and `.model-provider-row` with the shared Alpine/Twilight row material. Neutralize `provider-list-panel` and `model-provider-panel` parents. | Verify default model, all providers, actions, toggles, disabled rows, menus, and no outer rectangle. |
| Vendor accounts | Account rows use provider-specific classes and can diverge from model/provider rows. | Include `.vendor-account-row` through its `.provider-row` role; do not rely only on generic Settings selectors. | Test connected, disconnected, empty, add-account, and delete/confirmation states. |
| MCP / extensions | Inline paths, badges, code-like labels, menus, or capability filters become black blocks or unreadable. | Do not style by the `code` tag. Target semantic path/meta classes, actual `pre`/output blocks, search/filter controls, and portaled menus separately. | Inspect MCP, extensions, filters, paths, badges, menu options, errors, and empty states. |
| Subagents / capabilities | Capability groups, project pickers, action menus, and empty states use mixed or inherited materials. | Reuse capability row/list ownership rules; style project picker, group strip, count badge, menu, and empty state explicitly. | Verify project selection, loading/refreshing, unsupported states, and action menus. |
| Every Settings page | Buttons are inconsistently themed, text contrast changes by destination, or fallback modes recreate parent cards. | Inventory actual classes (`.btn-*`, `.icon-btn`, `.settings-icon-button`, `.settings-text-action`, shortcut actions). Keep opaque safety surfaces readable and preserve parent/child ownership in fallbacks. | Run normal, reduced-transparency, and unsupported-filter checks across at least one mixed and one row-only page. |

#### Universal Settings tile rules

- A section wrapper owns heading and spacing; it is never a tile by accident.
- A mixed-content panel may own one glass tile.
- A row-only panel must dissolve (`background: transparent`, no border/shadow,
  and visible overflow where required), leaving each child row as its own tile.
- Provider/model/capability-specific styles must be audited after generic
  Settings rules because they can restore clipping or a parent background.
- Opacity differences are allowed only when they communicate a named material
  role. If adjacent tiles look arbitrarily brighter or darker, rebalance the
  tier values instead of adding another selector.
- Repeat the ownership checks in reduced-transparency and no-filter fallbacks;
  making children opaque must never make a row-only parent opaque again.

## The failure history: symptoms, root causes, and permanent lessons

This section exists so the next theme implementation does not repeat expensive
trial-and-error.

### Failure: scenic content appeared misaligned or controls moved unexpectedly

**Symptom:** parts of the shell, foreground, fixed controls, or title area
looked misplaced after adding scenic paint rules.

**Root cause:** theme CSS was too broad and crossed from paint into layout. In
particular, generic shell-child rules that set `position` or altered stacking
ownership can override a component's intended geometry.

**Permanent lesson:** a backdrop needs one dedicated layer and a narrowly
documented stacking contract. Do not use an all-children selector for layout.
Theme-only selectors may control background/paint, but generic shell children
must retain their component-owned `position`, dimensions, and drag/resize
behavior.

**Prevention:** add a source/contract assertion that the app-shell foreground
rule establishes paint order but does not set `position`. Manually inspect
title bars, native controls, overlays, and work-panel transitions.

### Failure: a live conversation or title-band content overlapped the Twilight greeting

**Symptom:** the empty-home greeting collided visually with a test conversation
or the title/conversation band.

**Root cause:** a theme changed visual presentation without respecting the
existing fixed band and scrollable content clearance. The issue was not solved
by pushing random elements around; it required understanding which component
owns the fixed conversation band and which owns the transcript.

**Permanent lesson:** preserve layout ownership. If an existing fixed title band
needs protected clearance above content, use the already-owned content spacing
contract, scoped to the theme, rather than repositioning the greeting or fixed
controls. Twilight protects the transcript under its fixed conversation band
with its existing theme-scoped `thread-content` top padding rule.

**Prevention:** test empty home, an active thread, a short window, opening and
closing work panels, and narrow desktop dimensions. Never use a screenshot of
only the empty state as evidence that the layout is safe.

### Failure: the theme was much darker than the intended reference

**Symptom:** the app technically had the correct background image but looked
muddy, black, or unlike the supplied artwork.

**Root cause:** the first overlay treatment applied a near-uniform dark wash.
It hid the reference image's blue mountains, pink horizon, and lake depth.

**Permanent lesson:** an image theme needs composition-specific lighting, not a
single universal dark opacity. Use a restrained top vignette, deeper lower
vignette, and optional localized glow where the reference needs it. Tune image
position, saturation, overlay stops, and material opacity together. Evaluate on
the real asset, not a neutral color block.

**Prevention:** write down the visual anchors in the source image before CSS:
for example horizon, brightest focal region, readable dark region, and imagery
that must remain visible. Compare at the same approximate window dimensions as
the reference.

### Failure: the composer looked like a foreign black bar

**Symptom:** the rest of the theme felt blue-glass, but the prompt/composer
still looked black, flat, or visually unrelated.

**Root cause:** ordinary dark composer rules had stronger component styling,
and initial scenic treatment did not target all of the normal, focused, and
file-drop states.

**Permanent lesson:** treat the composer as a dedicated focal material. Override
the real shell in every relevant state under the scenic marker; do not just
change an outer container. Keep its geometry and interaction contract intact.

**Prevention:** validate normal composer, keyboard focus, file-drag state,
docked composer, home composer, streaming state, disabled controls, and a long
prompt before declaring the theme complete.

### Failure: Settings navigation rail remained black

**Symptom:** Chat looked scenic but Settings still had a black sidebar or dark
top-level regions.

**Root cause:** an ordinary dark-theme selector explicitly painted the Settings
rail black and outranked a high-level token override.

**Permanent lesson:** inspect the winning selector in the cascade and add a
scenic-marker-scoped override for the actual surface. Do not change ordinary
Dark, which must remain unchanged.

**Prevention:** Settings needs its own visual QA pass. Open the Appearance page
as well as Models, Skills, MCP, and Subagents. The rail, title band, search,
and each destination have different style sources.

### Failure: black rectangles around text/path labels throughout Settings

**Symptom:** MCP and other Settings pages showed dark rectangular boxes behind
ordinary text. The problem was initially reported as a page-specific error.

**Root cause:** a global `code` selector used the opaque safety material.
Semantic path labels happened to be rendered with `<code>` for typography, not
because they were a code block or dangerous output.

**Permanent lesson:** inspect the DOM/component semantics before fixing a visual
symptom. Do not style by HTML tag when the intended treatment belongs to a
specific product role.

**Prevention:** exclude global `code` from the scenic safety selector. Style
actual code blocks (`pre`) and known code/output components explicitly. Give
path labels a transparent/readable rule in the Settings container.

### Failure: only some Settings buttons matched the theme

**Symptom:** primary buttons looked correct but provider/model icons, action
buttons, or shortcut controls retained mismatched dark/black styling.

**Root cause:** the first button selector covered only the obvious shared
variants and missed generic `.icon-btn` used in Settings alongside specialized
classes.

**Permanent lesson:** "all buttons" is an inventory problem, not a single CSS
selector problem. Search the actual components and styles for every button
class before finalizing the theme.

**Prevention:** include `.btn-primary`, `.btn-secondary`, `.btn-ghost`,
`.icon-btn`, `.settings-icon-button`, `.settings-text-action`,
shortcut-specific actions, toggle states, and disabled/focus/hover variants as
applicable. Test the selectors with a direct stylesheet contract assertion.

### Failure: Alpine Settings tiles had inconsistent opacity and a parent rectangle

**Symptom:** some Alpine Settings rows appeared bright white while others were
more transparent, and a large surrounding rectangle made groups of tiles look
like one unwanted card. This was especially noticeable on Skills and Model
configuration pages.

**Root cause:** scenic surfaces were assigned different material tiers without
making the ownership boundary explicit. A later `.settings-panel` rule also
painted a background behind row-only panels whose children were already
individual tiles. The result was a translucent row inside a second translucent
parent, plus opacity differences that looked accidental rather than intentional.

**Permanent lesson:** define surface tiers by component role. A section wrapper
owns the heading and spacing; it is not a tile. A mixed-content panel may be one
tile, but a row-only panel must dissolve so each row owns its own background,
border, radius, and shadow. Keep opacity differences small enough to read as a
deliberate hierarchy. Never let a generic scenic `.settings-panel` rule override
the base row-only-panel transparency contract.

**Prevention checklist:**

- Keep `.settings-card-block` and its heading transparent on the scenic canvas.
- Apply white glass to `.settings-panel` only for mixed content; use row/content
  surfaces for row-only sections.
- Neutralize row-only parents with transparent background, no border/shadow, and
  visible overflow when required by the base layout.
- Test one mixed panel and one row-only panel on every Settings destination and
  look for a second rectangle surrounding independent rows.
- Verify normal, reduced-transparency, and unsupported-filter modes separately;
  fallback opacity must not reintroduce a parent tile.
- For provider/model/capability lists, test the actual nested list marker
  (`.provider-row-list`, `.model-provider-list`, or capability rows), not just
  the generic panel class; a provider-specific stylesheet can reintroduce
  `overflow: hidden` or a background after the scenic rule.

### Failure: a screenshot fix risked breaking other themes

**Symptom:** it was tempting to edit the base dark CSS so scenic Settings or
composer surfaces would look right.

**Root cause:** shared component CSS was being treated as the theme source
instead of the scenic override layer.

**Permanent lesson:** a theme must be additive and opt-in. New style rules go
under the new marker. Existing System, Light, Dark, and plugin themes retain
their current rendering unless a separately authorized shared bug fix is
proven.

**Prevention:** every theme test suite should assert scenic state removal on
switch away and include a normal-theme compatibility test for any component
given a theme-only presentation variation.

### Failure: changing content presentation could have changed behavior

**Symptom:** a scenic empty home wanted a textual hero rather than a mascot.

**Root cause risk:** replacing the entire empty-home component would risk
breaking onboarding, session logic, accessibility semantics, the composer, and
normal themes.

**Permanent lesson:** add the smallest semantic theme marker and branch only
the presentation that differs. Twilight retains the regular component and
behavior while using the localized `chat.emptyTitle` greeting in Twilight only;
the mascot/dynamic normal greeting stays intact in every other theme.

**Prevention:** test both branches: scenic theme must show the intended
localized presentation, and System/Light/Dark/plugin themes must still render
their existing mascot/dynamic title behavior.

## Reference-image workflow

When a user supplies a screenshot, concept art, or background image, treat it
as visual direction, not a request to clone every pixel or foreign platform
behavior.

### 1. Establish what may and may not be copied

Before implementation, explicitly identify:

- the reference's visual language to reproduce: color temperature, hierarchy,
  glass depth, contrast, spacing rhythm, composer emphasis, scene composition;
- the product geometry that must stay Nexus-native: shell structure, sidebar
  widths, Settings layout, work panel, drag areas, Windows/Linux controls,
  interaction behavior;
- foreign-platform details that must not be copied: macOS traffic lights,
  outer window masks, platform-specific titlebar assumptions, menu positions,
  non-Nexus controls;
- content that must remain functionally unchanged: permissions, tools,
  dialogs, file drop, keyboard navigation, plugin panels, model setup;
- the supplied artwork's licensing/ownership and whether it may ship in a
  packaged application.

The reference can guide mood and material, but Nexus remains Nexus.

### 2. Analyze the scene before coding

Write a short visual inventory:

- **dominant palette:** e.g. deep navy, cobalt, pale blue, horizon pink;
- **light direction:** top glow, center horizon, dark lower lake;
- **focal region:** where the eye should land and where text should not cover
  detail;
- **busy regions:** where translucent text would lose contrast;
- **large surfaces:** navigation, canvas, composer, floating controls;
- **density surfaces:** code, tools, forms, menus, permissions;
- **reference window size:** the approximate aspect ratio used for comparison.

This turns subjective "make it like this" feedback into concrete CSS variables
and surface decisions.

### 3. Decide the presentation hierarchy

Make a small material plan before selectors:

```text
image / backdrop
  -> atmospheric canvas
    -> navigation glass
    -> working canvas or shell glass
    -> raised glass (composer/cards)
    -> opaque safety surfaces (menus, dialogs, code, permission)
```

Then decide text and interaction hierarchy:

```text
primary text > secondary text > muted support text > disabled text
focus/selection > hover > resting state
destructive status stays semantically distinct from scenic accent
```

### 4. Implement a small vertical slice first

Before styling every page, prove the architecture with:

- the registry and runtime activation/removal;
- a bundled asset and native fallback;
- the backdrop plus one shell surface;
- the composer;
- one Settings screen;
- reduced-transparency/unsupported-filter fallback;
- a contract test.

Only expand coverage after this is stable. This prevents spending hours tuning
selectors before discovering that the theme cannot deactivate cleanly, flashes
the wrong native color, or has an incompatible base palette.

### 5. Compare at real sizes and states

Visual correctness cannot be inferred from source alone. Compare at:

- the supplied reference dimensions or aspect ratio;
- an ordinary Windows desktop window;
- a narrower-but-supported window;
- empty home and populated chat;
- Settings and Plugins;
- open menus/dialogs;
- a work panel;
- reduced transparency if available.

Do not overfit only to a full-screen screenshot. The same `cover` image and
fixed backgrounds crop differently in narrow/tall views, and dense surfaces
need different contrast treatment than an empty home.

## Full implementation recipe for a new built-in scenic theme

Replace `my-theme` below with a stable, lowercase, hyphenated id such as
`aurora-lake`. Do not rename an id casually after it has shipped because it is
persisted in `AppSettings.theme`.

### Phase A: scope and architecture

1. Read `AGENTS.md`, the baseline, ADR 0226, ADR 0227, relevant UX specs, the
   current `App.tsx`, registry, theme picker, CSS entry point, native main code,
   Twilight stylesheet, and tests.
2. Confirm whether the request is a built-in theme or a plugin theme. If the
   request needs a bundled background/native fallback/scenic marker, it is a
   first-party built-in.
3. Confirm the reference asset is authorized for local packaging.
4. Choose the base palette (`dark` or `light`).
5. Decide whether the theme is scenic. An ordinary palette-only built-in may
   not need an image/backdrop but still needs registry/runtime/picker/i18n/test
   integration.
6. State what visual parts will be matched and what Nexus/platform behavior is
   explicitly preserved.
7. Create an isolated `codex/<request-id>` branch and dedicated worktree from
   updated local `main`. Do not develop on the primary checkout or on `main`.

### Phase B: create the data and runtime contract

1. Add `"my-theme"` to `ThemePreference` in
   `packages/shared/src/types.ts`.
2. Add a registry entry in `packages/shared/src/built-in-themes.ts`, for
   example:

   ```ts
   { id: "my-theme", base: "dark", scenic: true },
   ```

3. Extend the built-in registry test with expected order/base/scenic status.
4. Update the Settings picker mapping in `ThemeRow.tsx` so the new id uses
   localized title and description keys. Prefer evolving the mapping/registry
   interface if multiple new themes make hard-coded ternaries unwieldy.
5. Add the new strings to every shipped Nexus locale, following the actual
   i18n package structure in the current revision. The visible name and short
   description must be translated consistently.
6. Update the runtime selection effect in `App.tsx` so it recognizes the new
   built-in id through the registry/base resolver. Avoid an ever-growing
   hard-coded equality chain; if the current code has one, refactor only as far
   as needed to preserve the registry as source of truth.
7. For a scenic theme, set `data-scenic-theme="my-theme"` while selected and
   remove it for every other selection. If the current implementation has a
   Twilight-specific branch, generalize it carefully to derive the marker from
   a registered scenic built-in, while ensuring only a valid first-party
   registry id may become a marker.
8. Ensure a missing/uninstalled plugin theme still falls back to System as it
   does today. A new built-in must not change plugin fallback behavior.

### Phase C: asset and native fallback

1. Add the local artwork to `apps/desktop/resources/themes/`.
2. Confirm `apps/desktop/package.json` packages the directory. Do not duplicate
   or remove existing resource entries.
3. Extend the renderer API type to include the named theme id.
4. Extend the Electron main validation allowlist and map the id to a fixed
   startup/resize fallback color.
5. Preserve macOS behavior; do not bolt a Windows/Linux fallback over existing
   vibrancy/transparency decisions.
6. Add tests for asset existence, package inclusion, API typing/validation, and
   fallback color.

### Phase D: semantic tokens and backdrop

1. Create `apps/desktop/src/styles/my-theme.css`.
2. Import it near the end of `globals.css`, after ordinary component styles and
   before `responsive.css`. If multiple scenic sheets are introduced, document
   deterministic ordering and keep responsive safety rules last.
3. Under a combined base + scenic selector, define named material tokens:

   ```css
   :root[data-theme="dark"][data-scenic-theme="my-theme"] {
     --my-theme-atmosphere: ...;
     --my-theme-shell-glass: ...;
     --my-theme-navigation-glass: ...;
     --my-theme-raised-glass: ...;
     --my-theme-safety-surface: ...;
     --my-theme-luminous-border: ...;
     --my-theme-focus-glow: ...;
     --ds-bg-primary: var(--my-theme-atmosphere);
     /* Set all necessary semantic --ds-* tokens. */
   }
   ```

4. If scenic, enable the shared `.app-scenic-backdrop` only under the marker.
   Use `cover`, a documented focal position, `pointer-events: none`, and only
   modest filter/transform work. Use pseudo-element overlays for atmosphere,
   not nested components or per-row backgrounds.
5. Apply blur only to a small set of large composited shell surfaces. Do not
   blur the background image itself excessively, repeated lists, transcript
   rows, code, or tool output.
6. Give native chrome, sidebar/rail, major canvas, work panel, Plugins, and
   composer their intended material roles. Change paint, not layout.

### Phase E: high-fidelity scoped components

1. Inspect actual selectors and DOM classes for each area before styling it.
2. Add only marker-scoped selectors. Start with the smallest container that
   expresses the semantic role.
3. Give floating safety surfaces explicit readable backgrounds and borders.
4. Add hover, selected, focus, disabled, error, warning, and success states.
5. For Settings, use a Settings-scoped material layer rather than generic tag
   selectors. Inventory all buttons and controls used across destinations.
6. If the theme requires a different empty-home presentation, add a semantic
   marker to the existing component. Keep accessible headings, onboarding,
   composer, session behavior, and all normal-theme presentation unchanged.
7. Verify plugins retain their CSS isolation and normal fallback behavior.

### Phase F: fallbacks and accessibility

1. Add `@media (prefers-reduced-transparency: reduce)` rules that remove blur
   and use opaque theme-compatible surfaces.
2. Add `@supports not (backdrop-filter: blur(1px))` rules with the same
   readable opaque fallback.
3. Confirm opaque fallbacks cover shell, navigation, composer, dialogs, menus,
   permissions, and any other large glass surfaces the theme introduces.
4. Ensure keyboard focus remains obvious on all interactive controls.
5. Check primary, secondary, muted, disabled, placeholder, error, warning,
   success, selection, and code/tool text against their actual backgrounds.
6. Do not use color alone to communicate dangerous state; retain icons/text
   and existing semantic class distinctions.

### Phase G: document, validate, deliver

1. Update relevant UX/design-system/component specs.
2. Add or update an ADR if architecture, public interfaces, ownership,
   security boundaries, first-party theme policy, or frozen decisions change.
3. Add a user-visible scenario to the E2E plan; do not run local E2E unless
   the user explicitly asks.
4. Add targeted unit/contract/runtime tests before production code where
   practical. Watch the regression test fail before adding its production fix.
5. Run targeted validation, review the complete diff, commit logical changes,
   refresh against local `main`, merge locally, validate the merged result,
   clean up only the request worktree/branch, and do not push unless asked.

## Test-first strategy for theme work

Visual regression test infrastructure cannot infer every visual quality from
CSS. It can still lock architecture, scope, and the precise regressions that
are easy to reintroduce.

### Contract tests to add for every built-in theme

At minimum, write tests that prove:

- the preference type admits the theme id;
- the built-in registry lists it in the intended order;
- it resolves to the correct light/dark base;
- scenic themes identify as scenic;
- the picker uses localized title/description keys;
- runtime activation sets the theme marker and resolves the base correctly;
- switching to System, Light, Dark, or a plugin theme removes the scenic
  marker and previous scenic state;
- any packaged asset exists and is included in desktop resources;
- native API/main-process validation admits only named supported ids;
- native fallback uses the intended fixed color;
- plugin theme CSS isolation and unavailable-plugin fallback still work;
- required material tokens/selectors exist;
- safety surfaces are deliberately opaque;
- reduced-transparency and unsupported-filter fallbacks exist;
- broad foreground/shell rules do not set protected geometry properties;
- any theme-only presentation has an explicit normal-theme compatibility test.

Twilight's source-based tests are intentionally direct: the test reads the
dedicated scenic stylesheet where the contract belongs, instead of making an
ambiguous assertion against a giant aggregate stylesheet. Use aggregate styles
only when testing cascade order or cross-sheet integration.

### What cannot be proven adequately by source tests

Source tests do not prove that a mountain horizon is placed perfectly, text
looks balanced, a blur feels subtle, or all contrast is subjectively pleasant.
Those require visual review. Use tests to prevent known classes of technical
failure, then manually compare the actual application at representative sizes.

### Targeted commands

Run commands from the relevant isolated worktree. Do not run E2E or package an
installer unless the user explicitly asks.

```powershell
# The dedicated scenic-theme contract suite.
node --test apps/desktop/test/twilight-mountains-theme.test.mjs

# Alpine Settings ownership and fallback contract.
node --test apps/desktop/test/alpine-settings-theme.test.mjs

# The focused family used for Twilight/Settings changes.
node --test `
  apps/desktop/test/twilight-mountains-theme.test.mjs `
  apps/desktop/test/settings-theme-picker.test.mjs `
  apps/desktop/test/agent-capability-settings.test.mjs `
  apps/desktop/test/plugin-themes.test.mjs `
  apps/desktop/test/window-background-theme.test.mjs `
  apps/desktop/test/renderer-branding.test.mjs `
  apps/desktop/test/home-empty-layout.test.mjs `
  apps/desktop/test/interaction-performance.test.mjs

# Build workspace dependencies in a fresh worktree before desktop typechecking.
pnpm --filter @pi-desktop/desktop run build:deps
pnpm --filter @pi-desktop/desktop typecheck

# Check whitespace and patch integrity.
git diff --check
```

If a focused suite has an unrelated failure, verify whether it also fails on
the unmodified local `main` before labeling it a new regression. Record the
exact command, baseline evidence, and failure classification. Do not make an
unrelated source change merely to turn a pre-existing test failure green.

## Manual visual QA matrix

Use this matrix before calling a theme complete. Take screenshots when helpful;
compare a reference at similar dimensions, but test behavior rather than only
appearance.

| Area | Check |
| --- | --- |
| Theme picker | Theme is searchable, has correct localized label/description, remains opt-in, and switching away fully removes its treatment. |
| App startup/resize | Native window edge/background is appropriate; no black/white flash around renderer startup or resize. |
| Sidebar and rails | Navigation remains readable; active/hovered project and session are distinct; no merged selected pills; native controls remain reachable. |
| Empty home | Theme greeting/hero is balanced; mascot behavior is correct for the selected theme; onboarding and composer do not overlap. |
| Populated chat | Transcript starts below fixed bands; user/assistant content, code, links, tool calls, activity, errors, and selection remain readable. |
| Composer | Home and docked versions match the theme; focus, file drop, controls, long text, disabled state, and streaming stay correct. |
| Work panel | Header, content, resize edge, toggle, browser/plugin views, and context menu preserve behavior and contrast. |
| Settings General | Nav rail, title bar, search, theme/font/language pickers, fields, toggles, disabled buttons, focus rings, and menus all match. |
| Settings Models | Provider rows, model actions, service pickers, icon buttons, danger actions, dialogs, and empty states remain readable. |
| Settings Skills/MCP/Subagents | Capability group strips, paths, badges, filters, project pickers, search, action menus, empty states, and inline code labels do not become black blocks. |
| Plugins | Plugin theme fallback/isolation remains correct; extension rows, controls, settings inputs, sheets, and menus remain readable. |
| Menus/dialogs/toasts | They detach visually from the backdrop, have clear focus/hover states, and do not sacrifice legibility for transparency. |
| Permission UI | Approval/deny actions and explanatory text remain unmistakable, with strong opaque material. |
| Accessibility fallback | With reduced transparency or no filter support, blur disappears but hierarchy, focus, and contrast remain good. |
| Narrow/short window | No overlap, clipping, hidden controls, or title-band collision. |
| Other themes | System, Light, Dark, and plugin themes still render their original mascot, colors, chrome, and components. |

## Common anti-patterns

### "I can add a pretty CSS file and call it a theme"

No. Without persistence, registry, picker, i18n, runtime marker cleanup,
native fallback, tests, packaging, and docs, the result is an unsupported
override that will drift or fail after switching themes.

### "A global `code`, `button`, or `input` selector is faster"

It is faster only until it styles unrelated semantic content. Global tag
selectors caused the Settings black rectangles. Inventory the real component
roles and scope them under the relevant page/container instead.

### "Every surface should be transparent so the artwork shows"

This makes menus, permissions, code, tool output, and forms unreadable. Keep a
visible scene behind the shell, but use high-opacity safety material where
users must inspect information or authorize actions.

### "Every surface should use blur"

This harms performance, can make text fuzzy, and makes dense repeated content
expensive during scrolling/streaming. Blur only a small set of large compositor
surfaces. Never use it on repeated transcript rows, list rows, code, tool
output, or the image itself.

### "I need to change padding/position to make the screenshot match"

Theme work is paint work unless the user explicitly requested a layout change.
Changing geometry risks clipping, collisions, responsive failures, work-panel
resizing bugs, and platform chrome breakage. Diagnose the true owner of an
overlap before editing any layout property.

### "The reference is macOS, so Nexus should look like macOS"

No. Preserve Windows/Linux-native controls and Nexus geometry. Translate color,
glass, mood, depth, and hierarchy into Nexus's existing shell.

### "A scenic theme should modify plugin CSS rules"

No. First-party themes must not weaken plugin isolation or gain plugin-like
authority. They coexist with the plugin theme system through the base palette
contract.

### "The browser supports blur, so no fallback is necessary"

Users can enable reduced transparency, and rendering support varies. An
immersive look is optional; readable behavior is mandatory.

### "The targeted test passed, so it is visually done"

Tests prove contracts. Perform manual visual QA across the matrix above before
claiming the result meets a reference image or is ready for a user to evaluate.

### "I can change ordinary Dark to make the new theme work"

Do not regress users who did not opt into the new theme. Fix the theme's
scoped selector or its token mapping.

### "I can clean up every unrelated failure I encounter"

No. Verify whether a failure exists on the baseline. Document it if unrelated,
then keep the theme change focused. Unrelated fixes require their own scoped
request/worktree.

## Accessibility and performance acceptance criteria

### Accessibility

- Primary text is readable on every surface and against every relevant image
  region.
- Secondary/muted/disabled/placeholder text remains intentionally visible, not
  merely technically present.
- Focus rings are obvious on keyboard navigation and are not replaced by a
  color-only hover effect.
- Error, warning, success, and destructive states retain semantic distinction.
- Menus, dialogs, tool output, and permission UI use opaque-enough materials.
- Theme-only empty-home changes preserve heading semantics and localized text.
- The scenic backdrop is decorative (`aria-hidden`) and non-interactive.
- Reduced-transparency and no-filter modes retain usable hierarchy with no
  blur requirement.

### Performance

- Exactly one scenic backdrop image is mounted, not one image per component.
- The backdrop cannot intercept events.
- `backdrop-filter` is limited to large, stable shell surfaces.
- Repeated rows, transcript content, code, tool output, and streaming content
  do not get individual blur/filter effects.
- Theme selectors do not invalidate component geometry or induce repeated
  layout calculation during stream rendering.
- Shadows are restrained; avoid high-radius layered shadows on every list row.
- Any theme-only animation respects existing reduced-motion expectations.

## Documentation requirements for future themes

Every user-visible theme change needs current documentation. At a minimum:

- update Appearance/Settings behavior in `docs/spec/04-ux/06-settings-ia.md`;
- update material/accessibility/design-system behavior in
  `docs/spec/04-ux/07-ui-design-system.md`;
- update relevant component behavior in `docs/spec/04-ux/08-component-spec.md`
  when the change affects a component contract;
- add/update an E2E plan scenario in
  `docs/spec/06-delivery/04-e2e-test-plan.md`;
- add an ADR under `docs/adr/` if the theme introduces architectural policy,
  public interface, data ownership, security boundary, or frozen-decision
  change;
- update ADR index/navigation if repository conventions require it;
- keep English as the source language for code, docs, identifiers, comments,
  and commits, while localizing user-visible picker text in all shipped locales.

Do not add explanatory paragraphs to product UI merely to document a theme.
Keep user-facing copy concise; put implementation rationale in this playbook,
ADRs, and specs.

## Safe delivery workflow in this repository

Repository rules in `AGENTS.md` are mandatory. A concise theme-specific version
is below.

1. Inspect the current primary checkout, update its local `main` without
   overwriting divergent local work, and check its status.
2. Create a unique branch using the `codex/` prefix and a dedicated worktree
   from updated local `main`.
3. Develop only inside that new worktree. Never alter other worktrees, another
   agent's branch, the primary checkout's feature files, or the upstream/real
   Pi Desktop application.
4. Read baseline, ADRs, relevant specs, and current tests before changing code.
5. Write a targeted failing test for the bug/contract where possible; observe
   the failure; then make the smallest coherent implementation change.
6. Keep each logical change committed with:

   ```text
   type(scope): imperative description
   ```

7. Run targeted validation and review `git diff --check`, `git diff`, and
   `git status --short`.
8. Refresh the request branch against the latest local `main`; resolve only
   conflicts relevant to the request.
9. Merge into local `main`, then re-run the focused validation on merged main.
10. Remove only the merged request worktree and its branch after confirming the
    merge commit is present. Never delete another worktree.
11. Do not push, publish, build an installer, or modify upstream Pi Desktop
    unless the user explicitly asks for that exact action.

If Windows leaves an unregistered/prunable worktree directory because an open
process holds a file lock, remove the Git worktree registration only after the
branch has safely merged; then report the leftover directory honestly. Do not
run broad recursive deletion commands against a workspace root or guessed path.

## Completion checklist for a new Nexus theme

### Product/architecture

- [ ] Theme identity, opt-in behavior, base palette, and scene/reference goals
      are agreed.
- [ ] Platform details to preserve and reference details not to copy are
      explicit.
- [ ] New theme remains first-party/local and does not expand authority.
- [ ] Theme id is stable, lowercase, hyphenated, and persisted safely.
- [ ] Registry, preference type, picker, i18n, runtime activation/removal, and
      plugin fallback behavior are correct.
- [ ] Native fallback is allowlisted and correct for Windows/Linux.
- [ ] macOS behavior remains compatible.

### Visual/material design

- [ ] Named material tiers exist and semantic design tokens are mapped.
- [ ] Backdrop is a single local, pointer-inert app-shell layer.
- [ ] Image composition and overlays reveal intended visual anchors.
- [ ] Sidebar, title bars, canvas, composer, work panel, Settings, Plugins,
      menus, dialogs, permissions, code, and tool output have appropriate
      distinct material roles.
- [ ] Settings has full destination/control coverage, including generic icon
      buttons and inline semantic paths.
- [ ] Settings material tiers are deliberate: opacity differences map to clear
      roles rather than arbitrary selectors.
- [ ] Section wrappers/headings remain transparent; mixed-content panels may be
      tiles, while row-only provider/model/capability parents are transparent
      with independent child tiles.
- [ ] Reduced-transparency and unsupported-filter fallbacks preserve that same
      parent/child ownership and do not recreate an outer rectangle.
- [ ] Generic element selectors do not capture unrelated product roles.
- [ ] No theme selector changes protected geometry without explicit approved
      layout work.
- [ ] Windows/Linux native control regions and drag behavior are unchanged.
- [ ] Normal themes retain their original presentation.

### Accessibility/performance

- [ ] Primary, secondary, muted, disabled, placeholder, status, and error text
      are readable.
- [ ] Focus/selection states remain obvious.
- [ ] Reduced-transparency and no-filter fallbacks are opaque and complete.
- [ ] Blur is limited to large shell surfaces; repeated content is not blurred.
- [ ] Backdrop does not receive pointer events or affect interactive behavior.

### Verification and delivery

- [ ] Contract tests cover registry, activation/removal, asset, native fallback,
      material/fallback rules, and normal-theme compatibility.
- [ ] Focused desktop tests pass.
- [ ] Alpine-specific contract test passes (`alpine-settings-theme.test.mjs`)
      alongside the general scenic suite.
- [ ] Desktop typecheck passes.
- [ ] `git diff --check` passes.
- [ ] Manual visual QA covered the full matrix at ordinary and constrained sizes.
- [ ] Specs, ADRs if required, and E2E plan are synchronized.
- [ ] Logical commits exist; request branch was refreshed and merged locally.
- [ ] Merged result was revalidated.
- [ ] Only the request worktree/branch was cleaned up.
- [ ] No push, installer/package build, or upstream application modification
      occurred unless explicitly authorized.

## Twilight Mountains: concise case-study summary

### Regression case study: visible controls that could not be clicked

Twilight exposed an interaction failure in work-panel and window utility
controls: buttons could be painted yet fail to receive pointer input when the
panel was open, after theme changes, or on Settings. Minimize/maximize/close,
the work-panel toggle, and Context Vault/Browser/Files actions could appear
present while clicks were swallowed.

The root cause was hit-testing and paint order rather than button handlers.
Scenic foreground rules and panel overlays introduced stacking contexts above
controls, while Electron drag regions could consume clicks unless real
controls explicitly opted out with `-webkit-app-region: no-drag`.

The durable repair is to keep interaction ownership explicit:

1. Mount one scenic backdrop below app content with `pointer-events: none`.
2. Keep renderer-drawn native controls mounted across Chat, sidebar transitions,
   Settings, the work panel, and theme changes.
3. Preserve titlebar reservation and give the control wrapper/buttons an
   explicit higher paint layer plus `no-drag`; do not rely on incidental DOM
   order.
4. Keep work-panel headers, resize edges, menus, and content in separate
   stacking layers. Menus may cover panel content, never the native-control hit
   area or panel buttons.
5. Never use scenic selectors on generic shell children to set geometry,
   stacking, or pointer behavior; scope them to named backdrop/control/panel
   classes.
6. Route Context Vault, Browser, and Files through one ensure-session path. It
   creates/reuses a session for the selected project, reports a concise toast
   when no project or Browser plugin is available, and avoids duplicate tabs.
7. Theme switching must remove scenic markers and restore base-theme hit regions,
   not merely change colors.

Regression tests must check interaction as well as visibility: exercise controls
on first render, with the sidebar collapsed/expanded, with the work panel
open/closed, in Settings, and while switching System/Light/Dark/Twilight.
Assert that maximize/restore and Context Vault clicks reach their actions,
native IPC failures produce feedback, and scenic layers remain non-interactive.
A screenshot showing a button is not evidence that the button works.

Twilight Mountains ultimately achieved the intended blue-glass, mountain-horizon
atmosphere by treating the visual reference as a hierarchy of materials rather
than a wallpaper:

- one bundled, fixed, non-interactive mountain backdrop;
- a dark base palette plus a separate scenic marker;
- blue/navy shell and navigation glass that preserve Windows/Linux-native
  chrome;
- a prominent cobalt/navy composer with focus and file-drop treatment;
- an atmospheric empty-home greeting that does not replace normal-theme
  behavior;
- stronger opaque materials for menus, dialogs, permissions, tool output, and
  dense controls;
- a Settings-specific blue-glass system covering every destination instead of
  letting ordinary dark rules or generic safety selectors leak through;
- exact regression tests for the black inline-path rectangles, missing icon
  button coverage, native fallback, marker cleanup, and geometry safety;
- fallback behavior for reduced transparency and unavailable filters.

The main lesson is simple: **a beautiful theme is not an image behind an app.
It is a carefully bounded system of product semantics, materials, accessibility,
platform behavior, and regression protection.**

### Regression case study: Alpine Settings surface ownership

Alpine Light exposed a second Settings failure mode after the initial scenic
implementation. Rows used different opacity tiers, which made the hierarchy
look inconsistent, and provider/model lists showed a large outer rectangle
behind otherwise independent tiles. The root cause was a generic scenic panel
background combined with provider-specific clipping that overrode the base
row-only panel contract. The durable fix is to neutralize row-list parents and
style only the child rows, while reserving a single panel tile for mixed
content. Future themes must review both a mixed panel and a row-only list at
normal and fallback opacity before visual sign-off.

### Reusable scenic backdrop blur contract

Backdrop-image blur is a shared scenic capability, not a Twilight feature. The
persisted `scenicBackdropBlur` value has `low`, `medium`, and `high` levels;
legacy `twilightBackdropBlur` values are read for compatibility. Each scenic
theme maps those levels to its own image blur scale while its glass-material
blur remains fixed by the theme stylesheet. Alpine Light uses 4px, 8px, and
16px; Twilight uses 2px, 6px, and 12px. The control is shown only for scenic
themes that declare support, and reduced-transparency/no-filter fallbacks remove
both kinds of blur in favor of readable opaque surfaces.

Alpine Settings is a full-page continuation of the same material system: the
Settings rail, content shell, cards, row tiles, fields, segmented controls,
menus, and buttons use scoped translucent white glass with navy text. Do not
reuse Twilight's dark button fills or change shared base selectors; keep these
rules under the Alpine scenic marker. Reduced-transparency and unavailable-filter
paths use near-opaque white tiles so every Settings destination remains readable.
Section containers such as `.settings-card-block` are layout/heading ownership
only and must stay transparent; apply the white-glass tile to `.settings-panel`
and its row/content surfaces. This prevents headings such as Appearance or
Network from becoming oversized white rectangles and preserves the scenic
canvas between groups.

When a future user asks for another Nexus theme, begin here, inspect the current
implementation, and extend the architecture intentionally. Do not rebuild the
same lessons through screenshots and accidental regressions.
