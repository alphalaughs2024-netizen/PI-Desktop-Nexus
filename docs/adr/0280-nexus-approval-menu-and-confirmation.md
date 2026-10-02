# ADR 0280: Nexus approval menu and confirmation

- Status: Implemented; manual acceptance pending

## Decision

Adapt the supplied approval-menu reference to the existing Nexus policies and
theme tokens. Agent displays Ask for approval, Approve for me and Full access;
Plan retains Accept edits. Descriptions explain permitted actions and remaining
restrictions rather than claiming a new risk classifier or policy bypass.
Use existing Lucide icons and React/CSS without adding dependencies.

Keep configuration and approvals routed through existing session/host services.
Extract the Full access confirmation into a reusable modal with safe initial
focus, Tab containment, Escape/backdrop cancellation, focus restoration, visible
save errors and synchronous single-submission protection. Changing the intended
chat/mode or approval lock closes the confirmation. This does not widen grants.

Permission cards omit unavailable allow actions and guard repeated submissions.
Existing native Allow once/Deny, expiry, cancellation and legacy host session
approval behavior remain. Use scoped opaque action ink across scenic themes.
