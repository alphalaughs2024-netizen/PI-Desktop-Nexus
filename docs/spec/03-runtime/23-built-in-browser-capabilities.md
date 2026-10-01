# Built-in Browser Capabilities

Normative amendment: [ADR 0265](../../adr/0265-built-in-browser-capabilities.md).
Extends ADR 0254 retained-session execution while preserving Browser design.

## Browser Presentation (ADR 0267)

Enter full view expands the built-in Browser across application content;
Exit full view and Chat restore the previous dock width. Ctrl/Command+Shift+F
works in browser chrome, a focused page and the floating composer. Tabs,
page input, session/model identity and running work survive the transition.
The tab band combines the panel menu, tabs, new-tab, expansion and close
controls. Address/navigation controls use restrained theme surfaces. Menus
remain inside the viewport and dismiss on outside input/Escape/resize.
Existing New tab controls remain available. Final browser visual redesign
will be selected separately with the user after functional acceptance.

Full view uses one trusted native input view above the webpage. It reuses
Composer, with one editable owner and generation-scoped draft/attachment
handoff. Main React remains the chat controller; an allowlisted, sender-checked
bridge returns actions/results and bounded state updates without starting a
second agent. Native UI bounds expand for menus; tab reattachment preserves
the input view's child order. Search hides it and pending tool permissions
return to Chat. Failure returns to the accessible chat; uncertain actions are
never replayed. Themes/fonts and reduced-motion preferences are preserved.
The floating model selector is an icon-only Brain button with the current
model and reasoning level in its accessible label and tooltip. Its full
model/reasoning menu is unchanged. The full Chat composer retains its labels.
Clicking the floating composer (or focusing its editable with the keyboard)
expands the chat above it. Outside focus/input collapses it to just the composer;
interactions inside the chat and its menus retain expansion. Its disclosure and
top-edge resize handle allow pointer or Arrow/Home/End keyboard sizing. It shows a bounded
tail of the current conversation: up to 24 user/assistant text messages,
48,000 total characters and 12,000 per message, excluding tools, reasoning
and attachments. Earlier messages/Open full chat restore the complete chat.
Live updates follow the bottom only while the user remains near the bottom.
Browser presentation animates measured position and size for 300ms; the same
native guest follows the changing rectangle. Input is hidden during motion.
Reduced motion switches immediately; interruption/resize restores layout.
Context usage is calculated from the complete main transcript before sending
bounded reply data. Speech uses the trusted native renderer identity; changing
presentation stops any active voice cycle, which can be restarted in the visible
composer. Page guests do not receive these app speech privileges.

## Execution and Ownership

Resolve each command against its originating chat and retained tab. Unknown
explicit IDs fail. Native popups retain opener/page history and have their own
incarnation. Tab create/select/close/mark events synchronize the GUI; each chat
has at most 20 tabs. Closing the final tab closes the panel.
Background link popups preserve selection; self-closing pages remove their tabs.
Native destruction releases services using retained identities and session
handles without accessing destroyed Electron objects.

ADR 0266 makes Main authoritative for selection. Creation/activation announce
completed state atomically; snapshots carry monotonic per-chat revisions and
the renderer ignores older/duplicate updates. Observing tabs never activates
them. Pending user selection is protected from older host work until its
activation settles; superseded activation replies cannot update it. Geometry
reports cannot select a tab or chat, recreate closed tabs, or
hide the selected page when an old surface unmounts. Native/agent selection
updates the presentation without requiring a renderer activation echo. The
host does not reuse an inactive tab's surface to keep another page visible.

Playwright Core 1.63.0 connects through guest-only in-memory CDP. Semantic
role/name, label, text, placeholder, test ID and CSS locators support up to
eight nested frame selectors. Matches are strict unless indexed. Native
actionability applies without forced-click fallback. Hidden rendering uses
the existing retained render host; explicit viewport emulation survives until
reset. Cancellation disconnects an operation without destroying the page.
Uncertain mutations are reported and never replayed automatically.
Keyboard actions accept case-insensitive common named keys/modifiers and the
Return/Esc/Ctrl/Cmd aliases, while retaining printable character case and
Playwright chord semantics. Unsupported keys still fail explicitly.
Navigation returns on main-document DOM readiness (or earlier full-load
completion), allowing inspection while subresources continue loading. Returned
navigation state and GUI still report `isLoading`; explicit page-load waits
retain their full-load meaning. A document that never becomes ready still hits
the bounded navigation deadline. Later resource/navigation errors remain visible
through the page lifecycle; navigation is never silently retried.
Snapshot, console and page inspection remain available while an uncertain
mutation is pending. Later mutations retain their ordering fence.

User takeover cancels admitted agent work and blocks further mutations until
the user resumes. Inspection and user controls remain available. Plan permits
snapshot/screenshot, URL/text/load wait, page content/asset inventory, download
listing, annotation reading, dialog status and WebMCP discovery. It denies
export/asset saves, console clearing, interaction, Developer enablement, upload,
style changes, evaluation and public CDP. Resuming clears annotation click
handlers before agent control is restored.

## Tool and GUI Contract

`BROWSER_TOOL_NAMES` is authoritative. Existing tools remain, with capabilities,
tabs, locator interactions, dialogs, Developer approval, events, downloads,
uploads, page content/assets/exports, annotations, styles and WebMCP added.
Main advertises and executes matching schemas.

The existing GUI drawer offers Overview, Page, Downloads and Developer views.
Screenshot results display actual images and saving controls. Viewport controls
show current emulation, including agent-set dimensions, and restore panel sizing.
Arrow/Home/End keys select drawer tabs. Material chrome uses a 48px tab band
with separated 32px tabs, a 54px navigation row and a 38px inspection toolbar.
Panel/Desktop/Mobile select actual host emulation; Capture opens the real image
in Page tools, and Inspect toggles the existing tools. Narrow panels retain all
controls as labelled icon buttons. A single viewport read updates at most every
two seconds while the browser is active and ready or loading, reflecting
agent-set/custom dimensions without guessing the device mode. Pending changes
and old-tab results cannot select another tab's viewport.

Page content starts directly below the inspection toolbar, without permanent
readiness, operation or error bands. Loading remains visible in the tab spinner
and Stop control. A themed warning button opens Inspect, where the current
error is readable on every tools tab. Stable screen-reader live regions retain
readiness, operation and error announcements without reserving page space.

At widths of at least 760px the inspector reserves 380px beside the native page.
Narrower inspectors cover only page content and hide the guest. Browser tab and
overflow menus use a trusted native UI view above the retained live webpage
(ADR 0269). Menus keep the guest visible, clamp to window bounds and support
Arrow/Home/End, Escape, outside focus/input and resize dismissal. Only the main
renderer can publish menu snapshots; the menu can select an enabled current
item once, and the main renderer executes its existing callback. Stale menu,
wrong session and foreign sender requests fail. All these controls hide the native floating composer while open;
closing one overlay cannot override another overlay's blocking state. Existing
theme tokens and reduced-motion behavior apply.
Pending screenshot/control/annotation results cannot update a different tab or
chat after target changes. Control requests are admitted once; copy confirmations
expire without leaving controls busy.

Built-in UI designer/fixer/test runner receive all browser tools; explorer and
code reviewer receive inspection tools. Custom presets retain saved restrictions.
Configured Codex sessions retain exact models/providers. Actual screenshot input
still depends on the model advertising image support.

## Approval and Boundaries

Developer access is explicitly approved for the current tab/origin, with a
120-second deny timeout and a document recheck. Cross-origin navigation revokes
it. Event history is bounded to 250 records/1 MiB and returns cursor, historyLost
and hasMore. Events redact authorization/cookie headers and post data. Response
body retrieval requires a request ID observed under the active approval.
Revocation resets Developer emulation and disables diagnostic domains before
a new grant; automation reconnects so its domains initialize afresh.
Public CDP keeps global cookies/storage/targets/interception denied.

Camera, microphone, notifications and location require separate per-request
user approval. Permission checks reuse explicit live-document grants; audio
and video are distinct. Navigation invalidates grants and pending approval.
Unknown permissions, screen capture, filesystem access, cross-origin frames and
requests without an owned page remain denied. OS/device availability may still
prevent approved media or location use.

Uploads accept only native-picker selections and recheck document identity.
WebMCP calls require a fresh list's documentUrl/documentGeneration and per-call
approval. Documents without the experimental API return supported=false.

## Result Limits

- AX: 2,000 visible nodes, depth 64, 4,000 characters per field, 512 KiB total;
  cycle protection and explicit truncation. Protected values are omitted.
  Text waits retain prior content when snapshots report unchanged.
- Screenshots: PNG/JPEG, document-coordinate crops, maximum 4,096 output rows
  and 4 MiB. Out-of-document crops fail; shortened images report truncated.
  Actual images and viewport metadata reach eligible models.
- Console: repeats aggregate counts and first/last timestamps, with type/text/time
  filters and explicit clearing.
- Downloads/PDFs: 32 MiB; saved assets: 8 MiB. Artifacts stay in chat scratch.
  Downloads are managed at guest creation. Page content/links/assets and exports
  are bounded. HTML is a snapshot, not a complete offline archive. Cancellation
  or document changes prevent stale artifact saves.
- Temporary CSS/annotations disappear on navigation and never edit project files.
- Tabs share Nexus's persistent browser accounts/cookies. External browser
  profiles and extensions are excluded from this release.
