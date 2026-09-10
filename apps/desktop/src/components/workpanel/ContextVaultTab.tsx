import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContextVaultCategory, ContextVaultClaim, ContextVaultClaimInput } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { IconBookOpen } from "../icons";
import { WorkTabEmpty } from "./WorkTabEmpty";

const categories: ContextVaultCategory[] = ["architecture", "decisions", "conventions", "gotchas", "notes"];
const blank = (): ContextVaultClaimInput => ({ claim: "", category: "notes", impact: "", scope: "", recheckGuidance: "", tags: [], evidence: [], provenance: { kind: "manual" }, relationships: [] });

function draftFrom(claim: ContextVaultClaim): ContextVaultClaimInput {
  const { id: _id, projectPath: _path, freshness: _freshness, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = claim;
  return input;
}

export function ContextVaultTab() {
  const { t } = useTranslation();
  const projectPath = useAppStore((state) => state.activeProjectPath);
  const [claims, setClaims] = useState<ContextVaultClaim[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ContextVaultClaim | null>(null);
  const [draft, setDraft] = useState<ContextVaultClaimInput>(blank);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectPath) { setClaims([]); return; }
    try { const result = await api.listContextVault(projectPath, query); setClaims(result.claims); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [projectPath, query]);
  useEffect(() => { void refresh(); }, [refresh]);
  const health = useMemo(() => ({
    reviewed: claims.filter((claim) => claim.category === "architecture" && claim.verification.state === "reviewed").length,
    decisions: claims.filter((claim) => claim.provenance.kind === "user" && claim.freshness === "unverified").length,
    stale: claims.filter((claim) => claim.freshness === "possibly_stale" || claim.freshness === "stale").length,
  }), [claims]);
  const select = (claim: ContextVaultClaim) => { setSelected(claim); setDraft(draftFrom(claim)); setCreating(false); };
  const change = <K extends keyof ContextVaultClaimInput>(key: K, value: ContextVaultClaimInput[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!projectPath) return;
    try {
      if (creating) await api.createContextVaultClaim(projectPath, draft);
      else if (selected) await api.updateContextVaultClaim(projectPath, selected.id, draft);
      setCreating(false); setSelected(null); setDraft(blank()); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const saveUserDecision = () => { setSelected(null); setCreating(true); setDraft({ ...blank(), category: "decisions", provenance: { kind: "user" } }); };
  if (!projectPath) return <WorkTabEmpty icon={IconBookOpen} title={t("panel.tabs.contextVault")} body={t("contextVault.noProject")} />;
  return <section className="context-vault-tab">
    <header className="context-vault-header"><div><strong>{t("panel.tabs.contextVault")}</strong><span>{t("contextVault.health", health)}</span></div><div><button onClick={() => { setCreating(true); setSelected(null); setDraft(blank()); }}>{t("contextVault.newClaim")}</button><button onClick={saveUserDecision}>{t("contextVault.userDecision")}</button><button onClick={() => void api.exportContextVault(projectPath)}>{t("contextVault.export")}</button><button onClick={() => void api.importContextVault(projectPath).then(refresh)}>{t("contextVault.import")}</button></div></header>
    <input className="context-vault-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("contextVault.search")} />
    {error && <p className="context-vault-error">{error}</p>}
    <div className="context-vault-grid"><aside className="context-vault-list">{claims.map((claim) => <button key={claim.id} className={selected?.id === claim.id ? "active" : ""} onClick={() => select(claim)}><b>{t(`contextVault.categories.${claim.category}`)}</b><span>{claim.claim}</span><small>{t(`contextVault.freshness.${claim.freshness}`)} · {t(`contextVault.review.${claim.verification.state}`)}</small></button>)}{!claims.length && <WorkTabEmpty icon={IconBookOpen} title={t("contextVault.emptyTitle")} body={t("contextVault.emptyBody")} />}</aside>
    {(creating || selected) && <form className="context-vault-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}><label>{t("contextVault.claim")}<textarea value={draft.claim} onChange={(event) => change("claim", event.target.value)} required /></label><label>{t("contextVault.category")}<select value={draft.category} onChange={(event) => change("category", event.target.value as ContextVaultCategory)}>{categories.map((category) => <option key={category} value={category}>{t(`contextVault.categories.${category}`)}</option>)}</select></label><label>{t("contextVault.impact")}<textarea value={draft.impact} onChange={(event) => change("impact", event.target.value)} required /></label><label>{t("contextVault.scope")}<input value={draft.scope} onChange={(event) => change("scope", event.target.value)} required /></label><label>{t("contextVault.recheckGuidance")}<textarea value={draft.recheckGuidance} onChange={(event) => change("recheckGuidance", event.target.value)} required /></label>{draft.provenance?.kind !== "user" && <><label>{t("contextVault.evidencePath")}<input value={draft.evidence?.[0]?.path ?? ""} placeholder="src/example.ts" onChange={(event) => change("evidence", event.target.value ? [{ path: event.target.value, excerpt: draft.evidence?.[0]?.excerpt ?? "" }] : [])} /></label><label>{t("contextVault.evidenceExcerpt")}<textarea value={draft.evidence?.[0]?.excerpt ?? ""} onChange={(event) => change("evidence", [{ path: draft.evidence?.[0]?.path ?? "", excerpt: event.target.value }])} /></label></>}<footer><button type="submit">{t("contextVault.save")}</button>{selected && <><button type="button" onClick={() => void api.recheckContextVaultClaim(projectPath, selected.id).then(refresh)}>{t("contextVault.recheck")}</button><button type="button" onClick={() => void api.reviewContextVaultClaim(projectPath, selected.id, "reviewed").then(refresh)}>{t("contextVault.markReviewed")}</button><button type="button" onClick={() => void api.deleteContextVaultClaim(projectPath, selected.id).then(() => { setSelected(null); void refresh(); })}>{t("contextVault.delete")}</button></>}</footer></form>}</div>
  </section>;
}
