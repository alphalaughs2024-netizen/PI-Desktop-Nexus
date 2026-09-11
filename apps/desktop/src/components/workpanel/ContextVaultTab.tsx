import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContextVaultCategory, ContextVaultClaim, ContextVaultClaimInput } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { IconBookOpen, IconPlus, IconSearch } from "../icons";
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
  const [category, setCategory] = useState<ContextVaultCategory | "all">("all");
  const [selected, setSelected] = useState<ContextVaultClaim | null>(null);
  const [draft, setDraft] = useState<ContextVaultClaimInput>(blank);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectPath) { setClaims([]); return; }
    try {
      const result = await api.listContextVault(projectPath, query);
      setClaims(result.claims);
      setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [projectPath, query]);
  useEffect(() => { void refresh(); }, [refresh]);

  const health = useMemo(() => ({
    reviewed: claims.filter((claim) => claim.category === "architecture" && claim.verification.state === "reviewed").length,
    decisions: claims.filter((claim) => claim.provenance.kind === "user" && claim.freshness === "unverified").length,
    stale: claims.filter((claim) => claim.freshness === "possibly_stale" || claim.freshness === "stale").length,
  }), [claims]);
  const visibleClaims = category === "all" ? claims : claims.filter((claim) => claim.category === category);
  const isEditing = creating || selected !== null;
  const startClaim = () => { setCreating(true); setSelected(null); setDraft(blank()); };
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
    <div className="context-vault-workspace">
      <aside className="context-vault-rail" aria-label={t("panel.tabs.contextVault")}>
        <button className={`context-vault-category${category === "all" ? " active" : ""}`} onClick={() => setCategory("all")}><span>All entries</span><small>{claims.length}</small></button>
        <div className="context-vault-category-group">{categories.map((item) => <button key={item} className={`context-vault-category${category === item ? " active" : ""}`} onClick={() => setCategory(item)}><span>{t(`contextVault.categories.${item}`)}</span><small>{claims.filter((claim) => claim.category === item).length}</small></button>)}</div>
        <p className="context-vault-rail-health">{t("contextVault.health", health)}</p>
      </aside>
      <div className="context-vault-main">
        <header className="context-vault-toolbar">
          <label className="context-vault-search-shell"><IconSearch size={14} aria-hidden="true" /><input className="context-vault-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("contextVault.search")} /></label>
          <div className="context-vault-actions"><button className="context-vault-action context-vault-action-secondary" onClick={() => void api.exportContextVault(projectPath)}>{t("contextVault.export")}</button><button className="context-vault-action context-vault-action-secondary" onClick={() => void api.importContextVault(projectPath).then(refresh)}>{t("contextVault.import")}</button><button className="context-vault-action context-vault-action-primary" onClick={startClaim}><IconPlus size={14} aria-hidden="true" />{t("contextVault.newClaim")}</button></div>
        </header>
        {error && <p className="context-vault-error">{error}</p>}
        {!isEditing && !visibleClaims.length ? <div className="context-vault-empty"><div className="context-vault-empty-icon"><IconBookOpen size={34} aria-hidden="true" /></div><h2>{t("contextVault.emptyTitle")}</h2><p>{t("contextVault.emptyBody")}</p><button className="context-vault-action context-vault-action-primary context-vault-empty-action" onClick={startClaim}><IconPlus size={14} aria-hidden="true" />{t("contextVault.newClaim")}</button><div className="context-vault-empty-tools"><button className="context-vault-action context-vault-action-secondary" onClick={saveUserDecision}>{t("contextVault.userDecision")}</button><button className="context-vault-action context-vault-action-secondary" onClick={() => void api.importContextVault(projectPath).then(refresh)}>{t("contextVault.import")}</button></div></div> : <div className={`context-vault-grid${isEditing ? " is-editing" : ""}`}>
          <aside className="context-vault-list">{visibleClaims.map((claim) => <button key={claim.id} className={`context-vault-claim${selected?.id === claim.id ? " active" : ""}`} onClick={() => select(claim)}><b>{t(`contextVault.categories.${claim.category}`)}</b><span>{claim.claim}</span><small>{t(`contextVault.freshness.${claim.freshness}`)} · {t(`contextVault.review.${claim.verification.state}`)}</small></button>)}{!visibleClaims.length && <WorkTabEmpty icon={IconBookOpen} title={t("contextVault.emptyTitle")} body={t("contextVault.emptyBody")} />}</aside>
          {isEditing && <form className="context-vault-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}><label>{t("contextVault.claim")}<textarea value={draft.claim} onChange={(event) => change("claim", event.target.value)} required /></label><label>{t("contextVault.category")}<select value={draft.category} onChange={(event) => change("category", event.target.value as ContextVaultCategory)}>{categories.map((item) => <option key={item} value={item}>{t(`contextVault.categories.${item}`)}</option>)}</select></label><label>{t("contextVault.impact")}<textarea value={draft.impact} onChange={(event) => change("impact", event.target.value)} required /></label><label>{t("contextVault.scope")}<input value={draft.scope} onChange={(event) => change("scope", event.target.value)} required /></label><label>{t("contextVault.recheckGuidance")}<textarea value={draft.recheckGuidance} onChange={(event) => change("recheckGuidance", event.target.value)} required /></label>{draft.provenance?.kind !== "user" && <><label>{t("contextVault.evidencePath")}<input value={draft.evidence?.[0]?.path ?? ""} placeholder="src/example.ts" onChange={(event) => change("evidence", event.target.value ? [{ path: event.target.value, excerpt: draft.evidence?.[0]?.excerpt ?? "" }] : [])} /></label><label>{t("contextVault.evidenceExcerpt")}<textarea value={draft.evidence?.[0]?.excerpt ?? ""} onChange={(event) => change("evidence", [{ path: draft.evidence?.[0]?.path ?? "", excerpt: event.target.value }])} /></label></>}<footer><button className="context-vault-action context-vault-action-primary" type="submit">{t("contextVault.save")}</button>{selected && <><button className="context-vault-action context-vault-action-secondary" type="button" onClick={() => void api.recheckContextVaultClaim(projectPath, selected.id).then(refresh)}>{t("contextVault.recheck")}</button><button className="context-vault-action context-vault-action-secondary" type="button" onClick={() => void api.reviewContextVaultClaim(projectPath, selected.id, "reviewed").then(refresh)}>{t("contextVault.markReviewed")}</button><button className="context-vault-action context-vault-action-danger" type="button" onClick={() => void api.deleteContextVaultClaim(projectPath, selected.id).then(() => { setSelected(null); void refresh(); })}>{t("contextVault.delete")}</button></>}</footer></form>}
        </div>}
      </div>
    </div>
  </section>;
}
