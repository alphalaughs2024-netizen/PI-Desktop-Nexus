# Runtime investigation: website-building test

## Evidence and changes

- A native preview command returned process handle 67834; the server responded
  HTTP 200 (16,433 bytes) while browser tools continued. Nexus treated the open
  process item as foreground and would mark it failed on successful turn end.
  Command-return and exit observations are now distinct; later work owns progress.
- TaskWait allowed/defaulted to 900/600 seconds behind a 240-second transport
  timeout. Codex waits now default to 60 and cap at 180 seconds, with resumable
  timeout results. Worker lifetime and approval expiry remain unchanged.
- An invented browser ID failed; browser-core-1 worked. Browser results now
  expose the resolved ID and errors list only the current chat's IDs. Explicit
  bad IDs never redirect. Preview rejection reports bound roots and HTTP guidance.
- Three growing full-snapshot clones per sustained output event were used for
  routing/run/envelope metadata. Those paths now read bounded contract metadata.
  A 100-chunk regression check verifies the adapter avoids those snapshot calls.
  This is not a measured claim about provider speed.

## Findings requiring no policy change

- Ten workers are supported, but shell-enabled presets can mutate. The existing
  scheduler permits one mutating worker per shared workspace. Disjoint ownership
  labels are scheduling guidance, not filesystem access controls. Read-only
  workers can overlap. No concurrency policy was weakened.
- The generated site was outside the session's workspace and scratch roots.
  File preview rejection was expected; HTTP serving worked.
- Native Start-Process calls were rejected by Codex policy. Reference source
  includes command-safety URL checks; the exact installed-policy cause remains
  unconfirmed. No blanket policy bypass was added. Native unified exec already
  supplied an inspectable server handle.
- PowerShell quoting, Windows path guards, WebP decoding and website content
  mistakes were agent/task issues, not evidence of a broken Nexus viewport.

## Validation

- Four focused runtime files: 91 checks pass, including lifecycle/steering,
  process observations, snapshot routing and resumable waits.
- Browser broker: nine checks pass via esbuild bundle and node:test. Direct Node
  imports fail on existing extensionless TypeScript dependencies; jiti register
  also fails named-export loading in Node 26.7.0. Bundling exercises the actual
  broker code and its tests without modifying production import paths.
- Runtime TypeScript build passes. Desktop typecheck and fresh launch are final
  gates recorded in the completion report.
- Full local E2E suites and packaged builds were not run. Manual acceptance of
  the runtime fixes is pending; accepted Phase 3 visual work is separate.

Branch: codex/nexus-runtime-observability-20261001.
Worktree: C:\wt\nexus-runtime-observability-20261001.
No remote publishing. No credentials are included.
