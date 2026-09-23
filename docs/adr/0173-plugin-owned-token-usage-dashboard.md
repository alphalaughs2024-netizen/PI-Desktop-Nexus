# ADR 0173: Native token usage dashboard

- Status: Superseded by the native Nexus Usage destination
- Date: 2026-09-07
- Deciders: PI-Desktop core
- Related: D103, D331, D335, ADR 0171, `04-ux/06-settings-ia.md`,
  E2E-186, marketplace plugin `pi.token-insights`

## Context

ADR 0171 added host-owned completed-turn token history and a Settings → Usage
destination. The marketplace plugin `pi.token-insights` already ships a private
local dashboard (heatmap, KPIs, filters, streaks, agent tool) across
PI-Desktop, Claude Code, Codex, and OpenCode. Keeping both surfaces duplicated
a weaker PI-Desktop-only matrix inside Preferences.

Plugins cannot write `pi.sqlite` (D002). They already read appearance and
provider labels read-only. The host still needs `session.endTurn.usage` so
subagent spend is durable without rewriting parent `message.usage`.

## Superseded decision

1. **Nexus Settings owns the Usage destination.** Settings exposes a native
   Usage page indexed by `usage`, `tokens`, and `用量`.
2. The page reads host-owned `stats.getTokenUsageHistory` data directly. It is
   not loaded through the plugin runtime and does not require marketplace
   installation.
3. **Host persistence stays.** Electron still sums parent `message_end` usages
   plus `turn_end.subagentUsage` into `session.endTurn.usage`.
   `stats.getTokenUsageHistory` remains an additive host RPC / IPC for local
   completed-turn rollups. It is not a Settings page.
4. **The plugin may fold host completed-turn remainders** into its PI-Desktop
   fact cube when those totals exceed transcript assistant `meta.usage`, so
   subagent spend is visible without double-counting JSONL messages. It still
   never rewrites `message.usage`.

## Consequences

- Users see token usage as a built-in Nexus capability. The former
  `pi.token-insights` marketplace dashboard is not required for this surface.
- Historical turns from before Electron sent `usage` may still be zero in the
  host RPC; the plugin's JSONL scan remains the backfill for those days.
- A later first-party plugin API wrapping `stats.getTokenUsageHistory` is a
  separate change.

## Alternatives

- Keep Settings → Usage beside the plugin: rejected (duplicate IA).
- Delete host turn persistence: rejected (D331 accounting).
- Let the plugin replace JSONL with the turns table: rejected (loses
  per-message model/provider rankings and pre-persistence history).
