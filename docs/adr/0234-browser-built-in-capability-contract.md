# ADR 0234: Browser as a Built-in Core Capability

**Status:** Accepted contract; implementation follows phased migration

**Date:** 2026-09-25

## Phase 7 ownership completion

Browser is persisted as a core capability (`coreCapabilities.browser.enabled`,
defaulting to enabled). The `pi.browser.*` namespace remains a compatibility
adapter only; it does not own Browser chrome, a Work Panel view, or agent tool
registration. Core Browser surfaces use `core://browser` and a dedicated Main
surface bridge. Legacy `pi.browser/browser` tab references normalize to that
identity, and reserved Browser tool/view names are rejected from plugins with a
capability-specific error. Browser cannot be uninstalled as a plugin; users may
disable the core capability through its dedicated setting. The old bundled
assets remain only until the Phase 9 clean-profile and compatibility removal
gate passes.

## Decision

Browser is a core Nexus capability. Core owns the Browser Work Panel view,
Browser agent tools, BrowserPreview, BrowserHost, BrowserPane, and BrowserCdp.

The existing `pi.browser.*` surface remains only as a compatibility API for
third-party plugins. It must not register a duplicate Browser tool or view.

This supersedes ADR 0170 and decision-log entry D333, which made Browser an
ordinary bundled plugin. ADR 0170 remains historical context.

## Registration invariant

- exactly one core Browser tool is registered;
- exactly one core Browser Work Panel view is registered;
- core availability does not depend on `pluginViews`, plugin activation, or
  ToolSearch;
- BrowserPreview does not fail because `pi.browser` is disabled;
- the compatibility adapter delegates to core and never duplicates registration.

## Shared identities and request ownership

These additive branded identities are the public contract; Electron/CDP/DOM IDs
remain private:

```ts
type BrowserId = string & { readonly __browserId: unique symbol };
type BrowserRequestId = string & { readonly __browserRequestId: unique symbol };
type BrowserSnapshotId = string & { readonly __browserSnapshotId: unique symbol };
type BrowserElementRef = string & { readonly __browserElementRef: unique symbol };

type BrowserRequestContext = {
  requestId: BrowserRequestId;
  sessionId: string;
  turnId?: string;
  effectiveAgentId?: string;
  mode: "plan" | "agent";
  permissionEpoch: number;
  browserId: BrowserId;
};
```

The context is captured at dispatch. A later session, agent, or mode change may
not retarget a pending Browser action.

## Command/result contract

The built-in command categories are:

```text
list, open, close, navigate, back, forward, reload, snapshot, screenshot,
wait, click, fill, type, keypress, console, evaluate, cdp
```

All commands return a normalized envelope:

```ts
type BrowserErrorCode =
  | "BROWSER_UNAVAILABLE"
  | "BROWSER_POLICY_BLOCKED"
  | "BROWSER_TAB_NOT_FOUND"
  | "BROWSER_STALE_REF"
  | "BROWSER_TIMEOUT"
  | "BROWSER_POSSIBLY_APPLIED"
  | "BROWSER_UNSUPPORTED"
  | "BROWSER_INVALID_INPUT"
  | "BROWSER_UNKNOWN_ERROR";

type BrowserResult<T = unknown> = {
  requestId: BrowserRequestId;
  ok: boolean;
  code?: BrowserErrorCode;
  retryable?: boolean;
  possiblyApplied?: boolean;
  message?: string;
  result?: T;
};
```

Failures contain safe next-step guidance. Raw page payloads, cookies, storage,
authorization headers, credentials, and unrestricted CDP output are excluded.

## Plan/Agent policy

| Action | Plan | Agent |
|---|---:|---:|
| list/open/navigate/back/forward/reload | allowed subject to URL policy | allowed |
| snapshot/screenshot/console/wait | allowed | allowed |
| click/fill/type/keypress | denied | allowed |
| evaluate | denied | allowed with bounds |
| cdp | denied | allowlisted and permission-checked |

Navigation remains URL-policy checked and may have site-side effects. Later
phases must not silently broaden Plan permissions.

## Snapshot and mutation contract

- every snapshot carries `browserId` and `snapshotId`;
- refs are valid only for that snapshot generation;
- navigation/invalidating DOM changes expire refs;
- stale refs return `BROWSER_STALE_REF`;
- compact snapshots have node/depth/text bounds;
- unchanged compact projections may return an unchanged marker;
- full metadata is opt-in and bounded;
- mutating actions are serialized per tab initially;
- no click/fill/type/keypress/evaluate/CDP replay after dispatch timeout;
- ambiguous mutation returns `BROWSER_POSSIBLY_APPLIED` and requires observation.

## Security invariants

- Main owns a sandboxed `WebContentsView`;
- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`;
- renderer/plugin code receives no WebContents or raw Electron APIs;
- CDP is deny-by-default and allowlisted;
- workspace local files remain root-contained;
- popup/navigation and permission requests remain policy-controlled;
- requests retain session/turn authorization ownership;
- screenshots, snapshots, console, evaluate, and helper output are bounded;
- logs never contain page text, secrets, credentials, raw CDP, screenshots, or
  full sensitive URLs;
- future external helpers require integrity/version checks before connection.

## Readiness state

```text
uninitialized → starting → ready ↔ loading
starting → unavailable | blocked
ready/loading → unavailable | closed
unavailable/blocked/closed → starting on explicit recovery
```

The Work Panel and agent tools expose the same readiness state and use capability
errors rather than plugin lifecycle errors.

## Consequences

Browser becomes always discoverable and can be optimized with typed tools,
brokered request ownership, compact snapshots, waits, and stable errors. A thin
compatibility adapter remains necessary for third-party extensions. The initial
implementation can retain one visible guest while introducing opaque IDs and
future-proof contracts.

## Required follow-up

Update runtime/tool, host-RPC, Work Panel, plugin compatibility, security, and
E2E specifications before Phase 1 core registration. Do not move or delete the
existing Browser engine in this contract-only phase.
