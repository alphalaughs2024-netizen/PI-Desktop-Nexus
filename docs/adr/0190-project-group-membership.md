# ADR 0190: Project group membership ownership

## Decision

Project groups are renderer-owned organizational containers over canonical
normalized project paths. A project may belong to multiple groups through
`projectCollectionMemberships`; membership changes never duplicate or delete a
project, its sessions, its folder, or its Context Vault data. Group deletion
removes only the container and memberships. Collection order and per-group
membership order are persisted independently and normalized at load time.

Assignment uses a searchable anchored side panel, with drag-and-drop backed by
keyboard/menu alternatives. Sessions are canonical records and may be moved
between projects without changing their id or transcript. The host validates
the move and rejects running sessions; moving a session changes its
project-scoped instruction and Context Vault resolution on the next turn. A
non-empty session drag asks for confirmation, while Shift-drag is an explicit
bypass; empty sessions move immediately. Session order uses existing
per-session metadata and remains independent of collection ordering. The panel
and drag layer must not alter native
window hit areas, work-panel geometry, scenic backdrop ownership, permissions,
or plugin isolation.

Reordering uses explicit drag handles with an 8px movement threshold so normal
row activation remains a click. Dragging a project into another group adds a
membership and preserves its other memberships; dragging to Ungrouped removes
only the active membership. Group and membership ordering remain independent.

## Context

The earlier compatibility model called these records `ProjectGroup` and mixed
group membership with project paths. The current collection model already
supports many-to-many membership, but its UI exposed only a basic checkbox
popover and lacked group actions, ordering, and clear ownership semantics.

## Consequences

Legacy `projectGroups` records are migrated once and are not written back as an
active model. Empty groups remain visible until explicitly deleted. Project
identity stays path-based, so Context Vault and session ownership remain stable
when users reorganize the sidebar.
