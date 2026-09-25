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

## External reference research

The directly useful supplied reference is **Paseo**:

```text
C:\Games\paseo\packages\server\src\server\browser-tools\
C:\Games\paseo\packages\app\e2e\browser\
```

Other supplied folders were not used as primary Browser references: they did not
contain a comparable embedded browser-agent host/broker, or were general agent,
memory, CLI, or workspace material.

### Paseo patterns worth adopting

Paseo separates agent-facing tool schemas, a `BrowserToolsBroker`, connected
browser hosts, explicit browser IDs, command/result envelopes, policy/config
enablement, and browser-specific unit/E2E suites.

#### Explicit tab identity

Paseo provides `browser_list_tabs`, `browser_new_tab`, and tab-scoped actions
requiring a `browserId`. Nexus currently has a singleton guest and implicit
session affinity. Preserve the singleton for the first built-in migration, but
introduce opaque browser/tab handles internally so snapshot refs are scoped to a
tab and snapshot generation rather than only global `eN` values.

#### Broker and host routing

Paseo tracks registered hosts, supported commands, pending requests, timeouts,
disconnects, stranded tab ownership, and reconnections. Nexus should add
request IDs, bounded timeouts, explicit “guest unavailable” versus “tab not
found” errors, and stale UID invalidation without requiring a remote host model.

#### More focused action surface

Paseo exposes focused tools for `list_tabs`, `new_tab`, `navigate`, `snapshot`,
`click`, `fill`, `wait`, `type`, and `keypress`. Nexus should add a typed core
facade for common operations while retaining the current union `Browser(action)`
tool as a compatibility alias. Keep raw `cdp` and `evaluate` privileged and
out of the primary workflow.

#### Stronger validation and descriptions

Paseo validates HTTP(S)-only URLs, browser IDs, `@eN` refs, click buttons and
modifiers, and wait conditions with bounded timeouts. Nexus should expose these
constraints directly in schemas and explain that refs expire after navigation or
a new snapshot.

#### Waiting primitives

Paseo has bounded `browser_wait` for text or URL conditions. Nexus should add
safe waits for URL match, accessible text, and page-load completion rather than
forcing repeated snapshot polling. Arbitrary JavaScript remains separate and
Agent-only.

#### Disconnect and timeout semantics

Paseo returns structured categories such as no host, unsupported command, tab
not found, retryable disconnect, and timeout. Nexus should adopt stable,
model-readable codes such as:

```text
BROWSER_UNAVAILABLE
BROWSER_TAB_NOT_FOUND
BROWSER_TIMEOUT
```

Each should include a next-step hint.

#### Browser-specific E2E discipline

Paseo has a dedicated browser E2E directory and CI routing. Nexus should add a
first-class Browser suite covering tool availability without plugin activation,
open/navigate/snapshot/click/fill/type/keypress/wait, stale refs, session/tab
affinity, host reconnect, Plan-safe versus Agent-only actions, local HTML
preview, screenshots, console limits, and Work Panel lifecycle.

### What not to copy directly

Paseo’s remote multi-host broker is broader than Nexus needs initially. Nexus’s
existing Electron-local `BrowserHost`, workspace-root checks, sandboxed guest,
and CDP allowlist are already strong and should remain authoritative. Paseo’s
browser enablement policy should become a Nexus core capability setting, not
another user-installed plugin toggle.

## Research-derived built-in proposal

```text
Core Browser capability
├── BrowserHost / BrowserPane / BrowserCdp
├── built-in Work Panel view
├── always-available Browser tools
├── BrowserPreview
└── Plan-safe action enforcement

Compatibility adapter
└── pi.browser.* for third-party plugins
```

Migration order:

1. Register the Browser tool and Work Panel view in the core app so ToolSearch
   and plugin activation are not prerequisites.
2. Preserve the current host/CDP security boundary and singleton guest.
3. Add request IDs, stable error categories, bounded timeouts, and stale-ref
   guidance.
4. Add explicit tab/session handles before attempting multi-tab support.
5. Add `wait`, `type`, and `keypress` primitives.
6. Mark Browser as Built-in in Extensions; remove uninstall semantics.
7. Retain `pi.browser.*` as a compatibility adapter without duplicate tool/view
   registration.

The Browser engine does not need to be rewritten. The key change is product
ownership and agent discoverability, with Paseo providing useful patterns for
command routing, validation, failure handling, and E2E coverage.

## Additional supplied-folder review

### Codex analysis package

`C:\Games\Codex-Analysis-26.915.3509.0` is a static analysis of a compiled
Electron desktop package, not a source implementation we can directly reuse.
It does provide one relevant security confirmation:

- browser windows use `sandbox: true`;
- `contextIsolation: true`;
- `nodeIntegration: false`;
- the renderer communicates through a named `contextBridge`/IPC boundary.

This reinforces Nexus’s existing BrowserPane posture. It is useful as a security
baseline and review checklist, but not as a Browser-agent architecture source.
The package is compiled, lacks complete source maps, and was not executed; its
static strings are evidence only.

### OpenCode custom

`C:\Games\opencode-custom` does not contain a directly comparable embedded
Browser host, but it has relevant session and permission design patterns:

- permissions and tool authorization remain scoped to the effective agent that
  issued the provider turn;
- a later agent/session switch cannot change the policy of a pending call;
- active-session registries distinguish foreground drains from background tasks;
- context snapshots use explicit epochs, stable source keys, and atomic durable
  advancement;
- browser-safe client bundles are protected by import-boundary tests;
- UI changes are expected to carry screenshot/video evidence in review.

Portable lessons for built-in Nexus Browser:

1. Bind every Browser request to the originating session/turn and effective mode
   at dispatch time; do not let a later session switch redirect a pending click,
   fill, or CDP call.
2. Keep visible Browser state, agent ownership, and background sessions distinct;
   a background session must not steal the visible guest.
3. Treat Browser capability/context snapshots as explicit state with stable
   generations rather than incidental renderer state.
4. Add import-boundary/security tests proving browser-safe code cannot reach
   privileged host modules.
5. Require visual evidence for the built-in Browser Work Panel migration.

What not to copy: OpenCode’s durable Context Epoch model is for system prompt
context, not Browser tabs. It should inform ownership and snapshot semantics,
not be transplanted into Browser persistence.

### Codex CLI

`C:\Games\cli` contains useful general tool/runtime, snapshot-test, and secure
agent infrastructure, but no comparable embedded browser-agent host or CDP
broker was found in the targeted search. It is therefore not a primary design
reference for this migration.

Its relevant indirect lesson is testing discipline: UI/tool-output changes should
carry deterministic snapshot or contract coverage. Nexus should apply that to
Browser accessibility snapshots, structured tool results, and Work Panel states,
not copy unrelated CLI internals.

## Updated source recommendations

| Source | Use for Nexus Browser | Do not use for |
|---|---|---|
| Current Nexus `pi.browser` | Host/CDP security, workspace file boundary, UID snapshots, Plan-safe actions | Final product ownership/lifecycle |
| Paseo | Broker routing, browser IDs, request/timeouts, wait/type/keypress, browser E2E | Direct multi-host complexity on day one |
| Codex analysis package | Electron hardening checklist and bridge isolation | Source-level Browser implementation |
| OpenCode custom | Session-bound permissions, active/background separation, snapshot generations, import tests | Browser persistence schema/context epochs |
| Codex CLI | Contract/snapshot testing discipline | Embedded Browser architecture |

The combined recommendation is now:

```text
Nexus host-owned Browser engine
  + Paseo-style typed command/broker/error contracts
  + OpenCode-style session-bound authorization and snapshot generations
  + Codex-style Electron bridge hardening and deterministic UI contracts
  = built-in Browser capability with a thin pi.browser compatibility adapter
```
