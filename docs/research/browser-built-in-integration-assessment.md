# Browser Integration Assessment

**Status:** Research only — no Browser migration implemented

**Date:** 2026-09-25

## Executive conclusion

The Browser implementation is technically substantial and mostly well-structured,
but it is exposed at the wrong product level. The host-owned browser guest,
navigation, CDP isolation, workspace preview, session rebinding, and Plan-mode
safety are strong. The main weakness is that a core Nexus capability is surfaced
as an optional bundled plugin.

Recommendation:

> Promote Browser to a built-in Nexus capability while retaining the existing
> host-owned engine and `pi.browser.*` compatibility API for extension authors.

Do not throw away `BrowserHost`, `BrowserPane`, or `BrowserCdp`. Move ownership of
the core Browser view/tool registration into the base app, then keep a thin
plugin adapter only for third-party compatibility.

## Current implementation map

### Plugin package

The bundled package is:

```text
apps/desktop/resources/plugins/pi.browser/
├── manifest.json
├── main.js
└── views/browser.html
```

The manifest declares:

- plugin ID: `pi.browser`;
- one Work Panel view: `browser`;
- permissions: `ui.view`, `agent.tool.register`, `browser.cdp`;
- default bundled-plugin lifecycle rather than a core capability lifecycle.

The view HTML is chrome only. It contains:

- back, forward, reload/stop, and external-open controls;
- URL input;
- empty state;
- `pluginBridge` calls for navigation, state, bounds, visibility, and appearance.

It does not use `require`, `ipcRenderer`, or `<webview>`.

### Host-owned browser engine

The real guest page is controlled by Electron Main:

- `apps/desktop/electron/main/browser-view.ts`
  - owns the sandboxed `WebContentsView`;
  - supports HTTP(S) navigation;
  - supports workspace-local HTML files;
  - enforces workspace-root file boundaries;
  - denies permission requests;
  - denies unsafe window-open/navigation targets;
  - supports local-file live reload.
- `apps/desktop/electron/main/browser-host.ts`
  - owns the singleton guest lifecycle;
  - tracks the active plugin chrome surface;
  - clamps the guest bounds to the plugin view hole;
  - tracks per-session locations;
  - prevents background sessions from stealing the visible guest;
  - exposes navigation, actions, screenshot, snapshot, click, fill, evaluate,
    console, and allowlisted CDP.
- `apps/desktop/electron/main/browser-cdp.ts`
  - attaches debugger protocol `1.3` to the guest;
  - turns the accessibility tree into `e1`, `e2`, … handles;
  - supports screenshot, snapshot, click, fill, evaluate, console, and raw
    allowlisted CDP;
  - limits evaluation length, console history, and screenshot width.

### Agent-facing tool

`apps/desktop/resources/plugins/pi.browser/main.js` registers one tool named
`Browser` with actions:

```text
navigate
snapshot
screenshot
click
fill
evaluate
console
cdp
```

The tool description tells the model to call ToolSearch for `browser` or `cdp`.
That creates an extra discovery step before a normal browser task can begin.

The Browser plugin declares these Plan-safe actions:

```text
navigate, snapshot, screenshot, console
```

The following stay Agent-only:

```text
click, fill, evaluate, cdp
```

This separation is correct and should be preserved in a built-in version.

### Workspace preview tool

The host also exposes `BrowserPreview` from Main for workspace HTML files. It is
used by Plan and by the agent’s UI-preview workflows. It fails closed when the
Browser plugin is disabled:

```text
BrowserPreview: the Browser plugin is disabled. Enable pi.browser in Plugins to preview HTML.
```

This couples a core local-preview workflow to plugin activation.

## Agent usability assessment

### What is easy today

Once the tool is loaded, the action surface is compact and understandable:

```text
Browser(action: "navigate", url: "https://example.com")
Browser(action: "snapshot")
Browser(action: "click", uid: "e7")
Browser(action: "fill", uid: "e4", text: "query")
```

The accessibility snapshot/UID approach is appropriate for agents because it
avoids brittle screen coordinates. The host returns structured state, page title,
URL, navigation availability, screenshots, and console messages.

### Friction introduced by plugin packaging

The underlying browser operation is not meaningfully slower because it is a
plugin: the guest and CDP remain in Main. The efficiency cost is orchestration:

1. The model may need ToolSearch before `Browser` is available.
2. The plugin must be installed/loaded/enabled before the view/tool exists.
3. The Work Panel launcher depends on `pluginViews` containing `pi.browser`.
4. `BrowserPreview` fails when the plugin is disabled.
5. The plugin page makes a core capability look optional.
6. A bundled plugin cannot be uninstalled, producing confusing lifecycle UX.
7. The agent must understand singleton guest behavior and session rebinding.

These are product and tool-discoverability costs, not CDP performance costs.

### Agent usability verdict

**Current:** usable for a capable model, but not direct enough for a core Nexus
workflow.

**Desired:** Browser should be an always-available tool in the core registry,
with ToolSearch optional rather than required. The model should be able to call
`Browser` immediately when a task requires web inspection.

## Implementation quality assessment

### Strong areas

- Host-owned guest isolation is correct.
- Plugin HTML is sandboxed and has no raw Electron access.
- File previews are restricted to the workspace root.
- External opening uses safe URL parsing.
- Guest bounds are clamped to the plugin surface.
- Session locations are remembered and rebound.
- Background sessions do not steal the visible guest.
- CDP is deny-by-default.
- Cookie, storage, target, and network-interception methods are blocked.
- Evaluation, screenshot, and console outputs have bounded limits.
- Plan-safe actions are explicitly declared and validated across runtime,
  host-core, and plugin-runtime layers.
- Existing tests cover plugin packaging, CDP safety, bounds, public APIs,
  Plan-safe action declarations, BrowserPreview, and work-panel views.

### Product/integration gaps

- Browser is shown in Extensions as an ordinary bundled plugin instead of a
  built-in capability.
- The UI exposes an uninstall expectation even though bundled plugins cannot be
  uninstalled.
- Browser availability depends on plugin activation and `pluginViews` state.
- The agent tool description requires ToolSearch discovery.
- BrowserPreview is unavailable if the plugin is disabled.
- The empty Browser panel says only “No page open”; it does not explain agent
  availability, Plan-versus-Agent restrictions, or the current session.
- Browser and BrowserPreview are separate concepts in the UI despite sharing
  one host guest and one security model.
- The core app has to carry compatibility logic for a feature that is central
  to web research and UI verification.

## Built-in migration recommendation

### Target architecture

```text
Core Browser capability
├── BrowserHost
├── BrowserPane
├── BrowserCdp
├── Browser Work Panel view/chrome
├── BrowserPreview
├── always-available Browser agent tool
└── Plan-safe action enforcement

Compatibility adapter
└── pi.browser.* API for third-party plugins
```

The migration should preserve the existing host engine and security boundaries.
Only ownership and product exposure change.

### Recommended migration stages

#### Stage A — Built-in capability registration

- Register the Browser tool in the core agent tool registry.
- Keep the same action schema and Plan-safe action list.
- Remove the ToolSearch requirement for the built-in tool.
- Keep `pi.browser.*` host APIs available to plugins.

#### Stage B — Built-in Work Panel view

- Move Browser chrome registration from `pi.browser` into the core Work Panel
  registry.
- Keep the same `BrowserHost` guest-hole protocol.
- Preserve session location rebinding and singleton guest behavior.
- Keep BrowserPreview pointed at the same host BrowserHost.

#### Stage C — Plugin compatibility adapter

- Retain a compatibility `pi.browser` contribution only if third-party plugins
  need the public API.
- Do not register a duplicate core Browser tool or duplicate Browser view.
- Mark the adapter as system/built-in compatibility rather than user-managed.

#### Stage D — Extensions UI cleanup

- Remove Browser from ordinary install/uninstall semantics.
- Show a `Built-in` badge and a permissions/details view.
- If disabling remains supported, label it as disabling the Browser capability,
  not uninstalling a plugin.
- Replace `PLUGIN_INVALID: a bundled plugin cannot be uninstalled` with a
  capability-specific message or remove the action entirely.

#### Stage E — Agent UX and state clarity

- Make Browser available without ToolSearch.
- Add explicit Browser status: ready, loading, no page, disabled, unavailable.
- Explain Plan-safe versus Agent-only actions in the tool metadata.
- Present BrowserPreview as “Preview local HTML” within the same Browser
  capability language.

## Migration risks and safeguards

### Risk: duplicate tool/view registration

Keep one authoritative core registration and make the compatibility adapter
non-registering for the same IDs. Add tests that assert exactly one Browser
view and one Browser tool are visible.

### Risk: security regression from moving code into core

Do not move page WebContents into renderer or plugin HTML. Preserve:

- sandboxed `WebContentsView`;
- `contextIsolation` and no Node integration;
- workspace-root file checks;
- safe external URL parsing;
- CDP allowlist;
- Plan-safe action filtering at all existing layers.

### Risk: third-party plugin breakage

Keep `pi.browser.*` API compatibility and document that the core Browser owns
the singleton guest. Third-party plugins should not be able to create an
unbounded second guest without a separately reviewed capability.

### Risk: disabling semantics

Decide whether Browser can be disabled at all. If it can, model that as a core
capability setting and make `BrowserPreview` fail with a capability message.
Do not expose an uninstall path.

## Evidence and validation sources

Primary implementation evidence:

- `apps/desktop/resources/plugins/pi.browser/manifest.json`
- `apps/desktop/resources/plugins/pi.browser/main.js`
- `apps/desktop/resources/plugins/pi.browser/views/browser.html`
- `apps/desktop/electron/main/browser-host.ts`
- `apps/desktop/electron/main/browser-view.ts`
- `apps/desktop/electron/main/browser-cdp.ts`
- `apps/desktop/electron/main/plugin-runtime.ts`
- `apps/desktop/src/stores/app-store.ts`
- `apps/desktop/test/browser-cdp.test.mjs`
- `apps/desktop/test/browser-preview-tool.test.mjs`
- `apps/desktop/test/bundled-plugins.test.mjs`
- `apps/desktop/test/plugin-work-panel-views.test.mjs`

Architecture/spec evidence:

- `docs/adr/0170-work-panel-browser-as-bundled-plugin.md`
- `docs/adr/0211-plan-safe-plugin-actions.md`
- `docs/spec/07-plugins/01-plugin-system.md`
- `docs/spec/07-plugins/05-plugin-lifecycle.md`
- `docs/spec/07-plugins/12-plugin-ipc-and-host-services.md`
- `docs/spec/07-plugins/13-plugin-permissions-matrix.md`
- `docs/spec/07-plugins/15-plugin-center.md`

## Decision guidance for the next step

The next implementation should not start by rewriting browser internals. It
should first choose the ownership boundary:

1. **Recommended:** built-in Browser capability + compatibility adapter.
2. **Interim:** keep plugin internals but remove ToolSearch/Extensions friction
   and mark Browser as built-in in the UI.
3. **Not recommended:** keep Browser as an ordinary optional bundled plugin.

The current Browser engine is a good foundation. The migration target is a
product-level promotion, not a replacement of the secure browser implementation.
