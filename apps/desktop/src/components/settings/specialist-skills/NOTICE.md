# Bundled specialist skill sources

These 13 documents are copied from Seth Hobson's `agents` repository under the
MIT license (copyright 2024 Seth Hobson). The original skill text is preserved
in the catalog preview; Nexus stores an editable copy only after installation.

Source: https://github.com/wshobson/agents
Local review source: `C:\Games\new skills repos\agents\plugins`

The complete license text is in `LICENSE.txt`. The market does not fetch from
this source or treat it as a live update repository.

Selection review, 2026-09-29:

The supplied folder contains 1,488 skill documents: `agents` 183,
`awesome-claude-skills` 864, `claude-skills` 388, `skills` 38, and
`superpowers` 15. The `awesome-claude-skills` collection alone contains 832
Composio automation entries, which require an external connector rather than
just a Markdown instruction. This is an inventory, not an endorsement of all
entries for Nexus.

- Kept independent domain guidance for web components, iOS design, screen
  reader testing, Python structure and Temporal testing, build caching,
  protocol analysis, recommendations, startup analysis, CI, and service meshes.
- Excluded general planning, debugging, review, delegation, and worktree skills
  because Nexus already has built-in workflows for those activities.
- Excluded broad visual and interaction design skills because Nexus already
  ships `interface-design`; retained only narrower design specialties.
- Excluded alternative entries in the supplied repositories covering the same
  domain, and entries that require companion references, scripts, assets, or
  Claude-specific commands. A single Markdown import could not preserve those
  dependencies faithfully.
- Document-processing examples (`docx`, `xlsx`, `pptx`, `pdf`) were deferred
  because their operational scripts and runtime dependencies are part of the
  capability; listing only their instruction file would imply functionality
  Nexus has not packaged. This also avoids duplicate variants across sources.
- The other supplied repositories remain research sources. This first local
  catalog uses one consistently licensed collection while the market has no
  remote source or package format.
