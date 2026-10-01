# ADR 0264: User-selected file previews outside the workspace

- Status: Implemented; manual acceptance pending
- Date: 2026-10-01
- Related: ADR 0019, ADR 0163, ADR 0254

## Decision

The user authorizes viewing files outside the workspace by explicitly selecting
their links. A dedicated renderer-only fsReadUserFile IPC previews that selected
regular file and returns its canonical path with the existing text/image/binary
classification and byte limits. It does not grant a directory, change the chat
workspace, attach content to the model or add an agent tool. The file tree and
automatic markdown-image reads retain their contained APIs.

Relative references use the originating chat's project root (or temporary-chat
scratch root), not another project's visible workspace. A bare AGENTS.md first
checks that root, then its ancestors for the nearest inherited instruction file.
Other missing basenames are not searched for or silently redirected. Explicit
Windows drive paths, POSIX paths and file URLs retain their absolute identities.
Unresolved home paths and arbitrary URI schemes remain unavailable.

The file panel displays the canonical selected location. A bounded in-memory set
of at most 100 successfully selected files permits Reveal for those exact files;
it grants no directory reads or model capabilities. External user-message file
chips use the viewer rather than launching an external application. Existing
workspace HTML handling and contained external-handler behavior stay in force.
Reads ignore stale responses after another selection, chat switch or unmount.

The renderer is a trusted application surface behind the existing preload IPC
allowlist. This does not claim proof of a physical user gesture from IPC alone.
Agent tools, browser guests and automatic content loading receive no access to
this channel. Native command policy and browser file-navigation containment are
separate boundaries and are unchanged.

## Evidence and validation

The reported AGENTS.md click came from a chat rooted in the test checkout's apps
subfolder; its instruction file lived in the parent. Focused tests exercise that
case, prefer a local instruction file when present, reject generic basename
fallback, open an explicitly selected external file, and prove the contained
reader remains restricted afterward. Path tests cover Windows case handling,
file URLs and external markdown links. One symlink fixture is skipped on hosts
without permission to create that link; full local E2E remains unrun.
