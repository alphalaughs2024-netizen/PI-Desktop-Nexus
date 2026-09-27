# Browser compact header composition

The Browser resource uses the existing Nexus Work Panel switcher row as its
single host-level Browser identity. Browser-specific duplicate title/session
rows are not rendered in the Browser resource.

For the compact Browser composition, the visible resource content begins with
the tab strip, followed by the navigation toolbar and Browser viewport. The
viewport owns readiness, operation status, errors, New Tab, recovery, and the
native webpage surface. The outer Work Panel frame title row is visually
suppressed only while Browser is active so it does not consume vertical space.

This is a renderer composition rule only. Browser navigation, session
ownership, native guest ownership, Main, IPC, and backend behavior are unchanged.
