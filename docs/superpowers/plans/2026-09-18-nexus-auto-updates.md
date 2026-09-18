# Nexus automatic updates

## Goal

Use the Nexus GitHub Releases feed for packaged PI Desktop Nexus builds. On
startup, perform a non-blocking update check; for supported in-app installers,
download available releases in the background and expose the existing restart
action. Keep manual Settings → Info checks and release links intact.

## Scope

- Keep update delivery disabled for unpackaged development runs.
- Keep portable Windows, macOS, and non-AppImage Linux in manual delivery mode.
- Make the Nexus feed identity explicit and testable in the updater source and
  electron-builder metadata.
- Start the first check as soon as the first window is ready, without awaiting
  it on the boot path; retain the periodic check.
- Add regression coverage and update the release/E2E specifications.

## Validation

- Run the focused auto-update test suite.
- Run shared build/typecheck where available.
- Run `git diff --check` and review the complete diff before merging.
