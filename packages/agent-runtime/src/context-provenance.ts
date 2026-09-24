import type { ContextPromptProvenance, ContextVaultClaim } from "@pi-desktop/shared";

export type ContextSelection = { claim: ContextVaultClaim; include: boolean; reason: string; tokens: number };

export function selectContextClaims(claims: ContextVaultClaim[], budget = 1200): ContextSelection[] {
  const seen = new Set<string>();
  let used = 0;
  return claims.map((claim) => {
    const key = `${claim.id}:${claim.claim.trim().toLowerCase()}`;
    const tokens = Math.ceil(claim.claim.length / 4);
    if (seen.has(key)) return { claim, include: false, reason: "duplicate", tokens };
    seen.add(key);
    if (claim.verification.state === "conflicted") return { claim, include: false, reason: "conflicted", tokens };
    if (claim.verification.state === "superseded") return { claim, include: false, reason: "superseded", tokens };
    if (used > 0 && used + tokens > budget) return { claim, include: false, reason: "budget", tokens };
    used += tokens;
    return { claim, include: true, reason: "verified project context", tokens };
  });
}

export function provenanceForContextSelection(selection: ContextSelection): ContextPromptProvenance {
  return { contextId: selection.claim.id, contextSource: selection.claim.provenance.kind, scope: selection.claim.scope, verificationState: selection.claim.verification.state, inclusionReason: selection.reason, ...(selection.include ? {} : { omissionReason: selection.reason }) };
}
