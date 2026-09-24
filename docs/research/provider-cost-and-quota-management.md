# Provider Cost and Quota Management Research

**Status:** Research complete; implementation not started  
**Date:** 2026-09-25  
**Product:** PI Desktop Nexus  

## Executive summary

Nexus currently stores normalized token usage and estimates money by multiplying those tokens by models.dev catalog prices. That is useful as a fallback, but it is not authoritative billing. Provider-reported cost is currently lost during normalization, so the UI cannot distinguish a provider charge from a local estimate.

The research separates two different products:

1. Request-level cost: what a provider says one generation cost.
2. Account-level usage: what a provider says the account or organization spent, what remains, and when limits reset.

Account totals are usually not attributable to one Nexus session. Local session totals are not authoritative provider billing unless the provider reports a request cost that Nexus associates with that turn.

Recommended order:

1. Preserve provider-reported request cost and generation IDs.
2. Add XKIRO account usage and history.
3. Preserve OpenRouter response cost and generation statistics.
4. Keep models.dev as a clearly labeled estimate fallback.
5. Redesign the chat popover and Settings Usage page around provenance, scope, refresh state, and unavailable data.

## Current Nexus behavior

Nexus already has provider/model metadata, durable input/output/cache/reasoning token counts, usage history facets, models.dev pricing, a chat cost popover, and a Settings Usage dashboard.

The current calculation is:

    estimated Nexus cost = normalized token counts x models.dev price

That is not the same as the amount charged by a provider. The runtime conversion in packages/agent-runtime/src/agent-messages.ts retains token quantities but does not retain provider-reported monetary cost or its source. The UI therefore collapses provider-reported, catalog-estimated, unpriced, and unavailable states.

The displayed $45.19 in the supplied screenshots should be labeled as a catalog estimate until provider cost is preserved and surfaced.

## Cost provenance model

Use explicit provenance:

| Provenance | Meaning |
|---|---|
| provider_reported | Provider returned cost for this request |
| provider_generation | Provider post-generation statistics returned cost |
| provider_account | Provider account or organization report |
| catalog_estimate | Nexus calculated cost from a price catalog |
| unpriced | No usable pricing source |
| unavailable | Source exists but could not be read |

Every value also needs scope: Nexus session, Nexus local history, provider request, provider account, provider organization, or provider credits.

Never add provider-account totals to Nexus session estimates as though they were one ledger.

## XKIRO

Documentation:

- https://docs.xkiro.com/api/overview/
- https://docs.xkiro.com/api/usage/

The documented endpoints are:

    GET https://api.xkiro.com/v1/usage
    GET https://api.xkiro.com/v1/usage/history?period=day|week|month

They use the same Bearer key as model requests.

The usage endpoint reports plan, spend windows, remaining USD, reset seconds, free-token allowance, wallet balance, and held balance. XKIRO states these counters are the same gateway counters used when accepting or rejecting requests.

The history endpoint reports bounded request/token/spend buckets and an aggregate total. spend_usd is a decimal string; preserve precision. The newest bucket remains open and may change.

XKIRO is the best first account-quota adapter. It is authoritative for the API-key account, but not automatically attributable to one Nexus session.

Adapter requirements:

- Electron Main owns the request and key.
- Renderer receives only bounded summaries.
- Poll usage no more than about once per minute.
- Cache updatedAt, staleAt, loading, and error state.
- Keep account spend separate from local session estimates.
- Treat missing wallet, plan, or free-token limits as valid nulls.
- Never block model requests when quota polling fails.

## OpenRouter

Documentation:

- https://openrouter.ai/docs/api-reference/overview
- https://openrouter.ai/docs

The public models endpoint, https://openrouter.ai/api/v1/models, returned 200 during research and included prompt, completion, and input-cache pricing strings.

OpenRouter responses can include prompt tokens, completion tokens, total tokens, cost, detailed cost breakdowns, upstream inference cost, server-tool cost, and BYOK information. OpenRouter documents post-request reconciliation through:

    GET https://openrouter.ai/api/v1/generation?id=<generation-id>

This makes OpenRouter the best first request-cost adapter.

Recommended behavior:

- Preserve response cost and cost_details.
- Store generation ID.
- Reconcile asynchronously through generation statistics when useful.
- Use models endpoint pricing for fallback estimates.
- Treat credits/account operations as a separate management-key connection.

## OpenAI

Documentation:

- https://platform.openai.com/docs/pricing
- https://platform.openai.com/docs/api-reference

Normal model responses provide usage. Organization usage and cost capabilities require separate organization/admin authorization. Unauthenticated probes returned 401, proving authentication is required but not proving entitlement.

Keep ordinary inference keys limited to inference. Any organization billing connector must have separate admin credential setup, explicit organization scope, Electron Main ownership, independent revocation, and no reuse of the ordinary provider secret field.

## Anthropic

Documentation:

- https://docs.anthropic.com/en/docs/about-claude/models
- https://docs.anthropic.com/en/docs/build-with-claude/administration/usage-and-cost-api

Anthropic responses provide usage. Organization usage and cost reporting requires an Admin API key. Unauthenticated probes returned 401.

Use the same architecture as OpenAI: normal inference credentials for model calls, optional separately authorized organization billing, and visible organization scope.

## Groq

Documentation:

- https://console.groq.com/docs/models
- https://console.groq.com/docs
- https://console.groq.com/docs/rate-limits

Groq response schemas provide prompt, completion, total usage, timing, and rate-limit metadata. Public docs reviewed did not confirm a generally available ordinary-key billing endpoint equivalent to XKIRO.

Use provider response usage and model pricing as an estimate. Show rate limits separately from spend. Do not claim authoritative account spend without a confirmed official endpoint.

## models.dev

Nexus already consumes https://models.dev/api.json. It provides model input/output/cache prices, capabilities, limits, and tier metadata.

models.dev is appropriate for picker display, capability enrichment, and fallback estimates. It is not a billing ledger and can differ from charges because of routing, discounts, credits, free tiers, subscriptions, BYOK, cache treatment, rounding, aliases, and marketplace markup.

## Recommended Nexus interfaces

Add optional additive cost metadata:

    provenance: provider_reported | provider_generation | provider_account | catalog_estimate | unpriced | unavailable
    amountUsd: decimal string
    scope: request | session | local_history | account | organization
    provider, model, generationId, observedAt

Token quantities remain authoritative for token accounting. Cost remains optional so unsupported providers continue to work.

Source precedence:

1. provider-reported request cost;
2. provider generation statistics;
3. provider account/history for account panels;
4. provider-specific pricing;
5. models.dev estimate;
6. unpriced/unavailable.

Retain both actual and estimate where useful, for example actual provider cost $0.0031 versus local estimate $0.0034 and variance -8.8%.

## UI recommendations

### Chat cost button

Separate two groups:

Nexus session:

- current session tokens;
- current session spend;
- completed turns;
- cost provenance;
- selected provider/model;
- updated time.

Provider account:

- XKIRO spend-window remaining;
- XKIRO wallet balance;
- OpenRouter credits when configured;
- account/organization scope;
- provider refresh time.

If unsupported or unconfigured, show Provider account data unavailable, not $0.00.

### Settings Usage page

Use four areas:

1. Local usage overview: requests, turns, tokens, local estimate, reported-versus-estimated split.
2. Provider account cards: XKIRO quota/spend, OpenRouter credits, optional OpenAI/Anthropic organization cards, Groq rate limits.
3. Cost breakdown: provider/model rows, source badges, refresh timestamps, unpriced states.
4. Token activity: existing heatmap and time series with provider/model/session/source filters.

Display rules:

- — means unavailable.
- Free means the provider explicitly reports free.
- Estimated means locally calculated.
- Provider reported means returned by the provider.

## Accuracy and security risks

- Free models can have non-zero tokens and zero spend.
- Subscriptions can report usage without per-token billing.
- Cache prices differ by provider.
- Decimal strings need precision-preserving handling.
- OpenRouter can include upstream and server-tool costs outside token arithmetic.
- Aliases can map to different upstream models.
- Catalogs can be stale.
- Account totals can include activity outside Nexus.
- Newest history buckets can change.
- Retries, concurrency, other devices, rounding, and failed requests create variance.
- Admin keys must never reach the renderer or ordinary inference-key fields.
- Billing payloads containing names, emails, balances, or account IDs must not be logged.
- Provider scope must always be visible.

## Recommended implementation waves

### Wave 1: correctness

1. Preserve provider cost and generation IDs.
2. Add cost provenance and scope to normalized and durable usage.
3. Make estimateUsageCost return explicit provenance.
4. Stop rendering $0.00 for unknown/unavailable pricing.
5. Test cache pricing, free models, missing catalog data, and response-cost precedence.

### Wave 2: providers

1. XKIRO /v1/usage.
2. XKIRO /v1/usage/history.
3. OpenRouter response cost and generation IDs.
4. Optional OpenRouter generation reconciliation.
5. Provider refresh status and timestamps.

### Wave 3: UI

1. Rework chat popover into local session versus provider account.
2. Rework Settings Usage around estimates, provider cards, source badges, and refresh controls.
3. Add provider/model/source filters.
4. Add loading, stale, error, and updated states.
5. Preserve Nexus themes and responsive layouts.

### Wave 4: optional admin connectors

1. Separate OpenAI and Anthropic billing credentials.
2. Organization scope and permission messaging.
3. Organization cards after credential/privacy review.
4. Investigate official Groq quota/billing before implementation.

## Evidence record: 2026-09-25

- models.dev/api.json returned 200 and included model cost metadata for OpenRouter, OpenAI, Anthropic, Groq, and many others.
- openrouter.ai/api/v1/models returned 200 without authentication and included prompt/completion/cache pricing.
- OpenRouter documentation describes response cost, cost_details, and /api/v1/generation.
- api.xkiro.com/v1 returned 404; official XKIRO docs identify /v1/usage and /v1/usage/history.
- XKIRO documentation says these endpoints use the same model-request key and expose spend windows, balances, free-token allowance, and history.
- OpenAI probes returned 401 without credentials; this proves authentication is required, not that billing is unavailable.
- Anthropic organization usage/cost probes returned 401 without credentials; admin authorization is required.
- Groq model probes returned 401; public docs exposed response usage/rate limits, but no equivalent ordinary-key billing endpoint was confirmed.

Authentication failures are not proof that a provider lacks a capability. Provider entitlement, key role, organization scope, and endpoint version must be checked with valid credentials.

## Final recommendation

The $45.19 currently shown by Nexus should be labeled as a catalog estimate until provider-reported cost is preserved. XKIRO should be the first account-quota adapter. OpenRouter should be the first request-cost adapter. OpenAI and Anthropic organization billing should remain optional, separately authorized integrations. Groq should use response usage and catalog estimates until an official account billing API is verified.
