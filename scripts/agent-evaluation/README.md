# Agent evaluation prototype

This is Phase 1 instrumentation, not the rebuilt Nexus app. It never changes
production themes, renderer, engine, or data.

```powershell
node scripts/agent-evaluation/cli.mjs doctor
node --test scripts/agent-evaluation/evaluation.test.mjs
node scripts/agent-evaluation/cli.mjs run --engine codex --image
node scripts/agent-evaluation/cli.mjs run --engine opencode --image
node scripts/agent-evaluation/cli.mjs run --engine pi --image
node scripts/agent-evaluation/cli.mjs serve
```

The last command prints a private loopback dashboard URL. Stop it with Ctrl+C.
Fixtures exercise real engines but generate scripted responses: they cannot
prove model quality. `--allow-cloud` enables capped xkiro trials after checking
current catalog pricing. The CLI uses the existing xkiro credential in Nexus's
secret store; a caller can instead pass an evaluation key to `evaluate`/`serve`
in memory. No credentials are written to engine profiles or reports.

```powershell
node scripts/agent-evaluation/cli.mjs run --engine codex --source xkiro --allow-cloud --model qwen/qwen3.7-flash:free --image
node scripts/agent-evaluation/cli.mjs serve --allow-cloud
```

Profiles and metadata evidence live under `%LOCALAPPDATA%/NexusAgentEvaluation`.
Native engine histories are private local artifacts and are never committed.
Only metadata exports are intended for sharing. The dashboard shows response
text locally; exports exclude it. Each required trial remains unresolved unless
its own evidence exists. No engine can win merely by passing transport tests.

Version pins: Codex 0.157.1, OpenCode 1.18.23, pi 0.85.1. Windows npm launchers
are resolved to their actual executable/Node entrypoint without shell-built
commands. Pi uses the installed workspace dependency; set
`NEXUS_EVALUATION_PI_ROOT` to an explicit `@earendil-works` module directory if
working outside the repository. No engine is installed or updated automatically.
