# User-selected file preview fix

- Branch: codex/nexus-chat-file-links-20261001
- Worktree: C:\wt\nexus-chat-file-links-20261001
- Scope: Explicit file-link viewing, including external files and inherited
  AGENTS.md; existing Nexus appearance is preserved.
- Documentation: ADR 0264, IPC specification, component specification and E2E
  scenario for user-selected files.
- Validation: 33 filesystem/path checks pass; one symlink fixture is skipped
  because this Windows host cannot create its link. Desktop typecheck and
  dependency builds pass. Transcript file-chip checks pass. The unrelated
  work-panel context test expects no browserTabs field, whereas the established
  empty context contains browserTabs: undefined; it fails identically on main.
  No local E2E or packaged Windows suite was run. Live click acceptance remains
  the user's next test.
- User data: The retired visual checkout is replaced by a Windows junction to
  the original Nexus repository. Native session workspace strings and the test
  profile remain intact. Git removed the merged worktree and branch; dangling
  generated directory links left by removal were moved aside rather than deleted.
- The runtime investigation changes and accepted animations are already merged
  into original local main. This request adds no remote publishing.
