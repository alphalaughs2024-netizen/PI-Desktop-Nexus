import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContextVaultCategory, ContextVaultClaim, ContextVaultClaimInput, ContextVaultEvidence, ContextVaultRelationship } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { IconBookOpen, IconCheck, IconClose, IconLink, IconListChecks, IconPlus, IconSearch, IconTrash } from "../icons";
import { WorkTabEmpty } from "./WorkTabEmpty";

const categories: ContextVaultCategory[] = ["architecture", "decisions", "conventions", "gotchas", "notes"];
type ImportItem = { index: number; status: "selectable" | "duplicate" | "overlap" | "invalid" | "incompatible" | string; claim?: string; reason?: string };
type ImportSheet = { pack: unknown; items: ImportItem[] };

const blank = (): ContextVaultClaimInput => ({ claim: "", category: "notes", impact: "", scope: "", recheckGuidance: "", tags: [], evidence: [], provenance: { kind: "manual" }, relationships: [] });
const evidenceRow = (): ContextVaultEvidence => ({ path: "", excerpt: "" });
const statusMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const parseTags = (value: string) => [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];

function draftFrom(claim: ContextVaultClaim): ContextVaultClaimInput {
  const { id: _id, projectPath: _path, freshness: _freshness, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = claim;
  return input;
}

export function ContextVaultTab() {
  const { t } = useTranslation();
  const projectPath = useAppStore((state) => {
    const activeSession = state.activeSessionId
      ? state.sessions.find((session) => session.id === state.activeSessionId)
      : undefined;
    return activeSession?.projectPath ?? state.activeProjectPath;
  });
  const [claims, setClaims] = useState<ContextVaultClaim[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ContextVaultCategory | "all">("all");
  const [tag, setTag] = useState<string | null>(null);
  const [selected, setSelected] = useState<ContextVaultClaim | null>(null);
  const [draft, setDraft] = useState<ContextVaultClaimInput>(blank);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState("reviewed");
  const [reviewNote, setReviewNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importSheet, setImportSheet] = useState<ImportSheet | null>(null);
  const [selectedImportIndexes, setSelectedImportIndexes] = useState<number[]>([]);
  const [memoryText, setMemoryText] = useState("");
  const [claimsLoading, setClaimsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectPath) { setClaims([]); setClaimsLoading(false); return; }
    setClaimsLoading(true);
    try { const result = await api.listContextVault(projectPath, query); setClaims(result.claims); setError(null); }
    catch (reason) { setError(statusMessage(reason)); }
    finally { setClaimsLoading(false); }
  }, [projectPath, query]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!projectPath) { setMemoryText(""); return; }
    void api.getProjectMemory(projectPath, query).then((result) => {
      const usable = result.claims.map((item) => "disposition" in item ? item.claim : item).filter((claim) => claim.verification.state === "reviewed" && claim.freshness === "fresh");
      setMemoryText(usable.map((claim) => `[${claim.category}] ${claim.claim}`).join("\n"));
    }).catch(() => setMemoryText(""));
  }, [projectPath, query]);
  useEffect(() => { setCategory("all"); setTag(null); setSelected(null); setCreating(false); setConfirmDelete(false); }, [projectPath]);

  const health = useMemo(() => ({
    reviewed: claims.filter((claim) => claim.category === "architecture" && claim.verification.state === "reviewed").length,
    decisions: claims.filter((claim) => claim.provenance.kind === "user" && claim.freshness === "unverified").length,
    stale: claims.filter((claim) => claim.freshness === "possibly_stale" || claim.freshness === "stale").length,
  }), [claims]);
  const tags = useMemo(() => [...new Set(claims.flatMap((claim) => claim.tags))].sort((left, right) => left.localeCompare(right)), [claims]);
  const visibleClaims = useMemo(() => claims.filter((claim) => (category === "all" || claim.category === category) && (!tag || claim.tags.includes(tag))), [category, claims, tag]);
  const isEditing = creating || selected !== null;
  const operationLabel = busy === "import" || busy === "importApply" ? t("contextVault.import") : busy === "export" ? t("contextVault.export") : busy === "save" ? t("contextVault.saving") : null;
  const clearFilters = () => { setQuery(""); setCategory("all"); setTag(null); };
  const change = <K extends keyof ContextVaultClaimInput>(key: K, value: ContextVaultClaimInput[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const startClaim = () => { setCreating(true); setSelected(null); setConfirmDelete(false); setReviewNote(""); setDraft({ ...blank(), evidence: [evidenceRow()] }); };
  const startUserDecision = () => { setCreating(true); setSelected(null); setConfirmDelete(false); setReviewNote(""); setDraft({ ...blank(), category: "decisions", provenance: { kind: "user" } }); };
  const select = (claim: ContextVaultClaim) => { setSelected(claim); setCreating(false); setConfirmDelete(false); setReviewState(claim.verification.state); setReviewNote(claim.verification.note ?? ""); setDraft(draftFrom(claim)); };
  const closeEditor = () => { setSelected(null); setCreating(false); setConfirmDelete(false); setDraft(blank()); };
  const updateEvidence = (index: number, patch: Partial<ContextVaultEvidence>) => change("evidence", (draft.evidence ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const removeEvidence = (index: number) => change("evidence", (draft.evidence ?? []).filter((_, itemIndex) => itemIndex !== index));
  const updateRelationship = (index: number, patch: Partial<ContextVaultRelationship>) => change("relationships", (draft.relationships ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const removeRelationship = (index: number) => change("relationships", (draft.relationships ?? []).filter((_, itemIndex) => itemIndex !== index));

  const save = async () => {
    if (!projectPath) return;
    setBusy("save"); setError(null); setNotice(null);
    try {
      const result = creating ? await api.createContextVaultClaim(projectPath, draft) : selected ? await api.updateContextVaultClaim(projectPath, selected.id, draft) : null;
      if (result && "status" in result && result.status !== "created") { setNotice(t("contextVault.saveResult", { status: result.status })); return; }
      closeEditor(); await refresh(); setNotice(t("contextVault.saved"));
    } catch (reason) { setError(statusMessage(reason)); } finally { setBusy(null); }
  };
  const recheck = async () => {
    if (!projectPath || !selected) return;
    setBusy("recheck"); setError(null);
    try { const result = await api.recheckContextVaultClaim(projectPath, selected.id); if (result.claim) select(result.claim); await refresh(); setNotice(t("contextVault.rechecked")); }
    catch (reason) { setError(statusMessage(reason)); } finally { setBusy(null); }
  };
  const review = async () => {
    if (!projectPath || !selected) return;
    setBusy("review"); setError(null);
    try { const result = await api.reviewContextVaultClaim(projectPath, selected.id, reviewState, reviewNote); if (result.claim) select(result.claim); await refresh(); setNotice(t("contextVault.reviewed")); }
    catch (reason) { setError(statusMessage(reason)); } finally { setBusy(null); }
  };
  const deleteClaim = async () => {
    if (!projectPath || !selected) return;
    setBusy("delete"); setError(null);
    try { await api.deleteContextVaultClaim(projectPath, selected.id); closeEditor(); await refresh(); setNotice(t("contextVault.deleted")); }
    catch (reason) { setError(statusMessage(reason)); } finally { setBusy(null); }
  };
  const exportVault = async () => {
    if (!projectPath) return;
    setBusy("export"); setError(null);
    try { const result = await api.exportContextVault(projectPath); if (result.ok) setNotice(t("contextVault.exported")); }
    catch (reason) { setError(statusMessage(reason)); } finally { setBusy(null); }
  };
  const previewImport = async () => {
    if (!projectPath) return;
    setBusy("import"); setError(null);
    try { const result = await api.previewContextVaultImport(projectPath); if (result.canceled || !result.pack) return; const items = result.preview?.items ?? []; setImportSheet({ pack: result.pack, items }); setSelectedImportIndexes(items.filter((item) => item.status === "selectable").map((item) => item.index)); }
    catch (reason) { setError(statusMessage(reason)); } finally { setBusy(null); }
  };
  const applyImport = async () => {
    if (!projectPath || !importSheet) return;
    setBusy("importApply"); setError(null);
    try { const result = await api.applyContextVaultImport(projectPath, importSheet.pack, selectedImportIndexes); setImportSheet(null); await refresh(); setNotice(t("contextVault.imported", result)); }
    catch (reason) { setError(statusMessage(reason)); } finally { setBusy(null); }
  };

  if (!projectPath) return <WorkTabEmpty icon={IconBookOpen} title={t("panel.tabs.contextVault")} body={t("contextVault.noProject")} />;

  return <section className="context-vault-tab">
    <div className="context-vault-workspace">
      <aside className="context-vault-rail" aria-label={t("panel.tabs.contextVault")}>
        <div className="context-vault-rail-brand"><IconBookOpen size={16} aria-hidden="true" /><span>{t("panel.tabs.contextVault")}</span></div>
        <button type="button" aria-pressed={category === "all" && !tag} className={`context-vault-category${category === "all" && !tag ? " active" : ""}`} onClick={() => { setCategory("all"); setTag(null); }}><span>{t("contextVault.allEntries")}</span><small>{claims.length}</small></button>
        <div className="context-vault-rail-label">{t("contextVault.categoriesLabel")}</div>
        <div className="context-vault-category-group">{categories.map((item) => <button type="button" aria-pressed={category === item && !tag} key={item} className={`context-vault-category${category === item && !tag ? " active" : ""}`} onClick={() => { setCategory(item); setTag(null); }}><span>{t(`contextVault.categories.${item}`)}</span><small>{claims.filter((claim) => claim.category === item).length}</small></button>)}</div>
        {tags.length > 0 && <><div className="context-vault-rail-label">{t("contextVault.tags")}</div><div className="context-vault-tag-rail">{tags.map((item) => <button type="button" aria-pressed={tag === item} key={item} className={`context-vault-category${tag === item ? " active" : ""}`} onClick={() => { setCategory("all"); setTag(item); }}><span>#{item}</span><small>{claims.filter((claim) => claim.tags.includes(item)).length}</small></button>)}</div></>}
        <div className="context-vault-rail-health"><IconListChecks size={15} aria-hidden="true" /><p>{t("contextVault.health", health)}</p></div>
      </aside>
      <div className="context-vault-main">
        <header className="context-vault-toolbar"><label className="context-vault-search-shell"><IconSearch size={15} aria-hidden="true" /><input aria-label={t("contextVault.search")} className="context-vault-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("contextVault.search")} /></label><div className="context-vault-actions"><button type="button" className="context-vault-action context-vault-action-primary" disabled={busy !== null} aria-describedby={busy ? "context-vault-operation-status" : undefined} onClick={startClaim}><IconPlus size={15} aria-hidden="true" />{t("contextVault.newClaim")}</button><button type="button" className="context-vault-action context-vault-action-secondary" disabled={busy !== null} aria-describedby={busy ? "context-vault-operation-status" : undefined} onClick={() => void previewImport()}>{t("contextVault.import")}</button><button type="button" className="context-vault-action context-vault-action-secondary" disabled={busy !== null || claims.length === 0} aria-describedby={busy ? "context-vault-operation-status" : undefined} onClick={() => void exportVault()}>{t("contextVault.export")}</button></div></header>
        {memoryText ? <div className="context-vault-project-memory" role="status"><strong>{t("contextVault.projectMemory", { defaultValue: "Approved project memory" })}</strong><pre>{memoryText}</pre></div> : null}
        {operationLabel && <p id="context-vault-operation-status" className="context-vault-message context-vault-notice" role="status">{operationLabel}</p>}{error && <p className="context-vault-message context-vault-error" role="alert">{error}</p>}{notice && <p className="context-vault-message context-vault-notice" role="status">{notice}</p>}
        {!isEditing && claimsLoading ? <div className="context-vault-empty"><h2>{t("common.loading")}</h2></div> : !isEditing && !visibleClaims.length ? (query || category !== "all" || tag ? <div className="context-vault-empty context-vault-search-empty"><h2>{t("contextVault.noMatchingClaims")}</h2><p>{t("contextVault.emptyBody")}</p><button type="button" className="context-vault-action context-vault-action-secondary" onClick={clearFilters}>{t("common.cancel")}</button></div> : <div className="context-vault-empty"><div className="context-vault-empty-orbit" aria-hidden="true"><span /><span /><span /><div className="context-vault-empty-icon"><IconBookOpen size={32} /></div></div><h2>{t("contextVault.emptyTitle")}</h2><p>{t("contextVault.emptyBody")}</p><button type="button" className="context-vault-action context-vault-action-primary context-vault-empty-action" onClick={startClaim}><IconPlus size={15} aria-hidden="true" />{t("contextVault.addFirst")}</button><div className="context-vault-empty-tools"><button type="button" className="context-vault-action context-vault-action-secondary" onClick={startUserDecision}>{t("contextVault.userDecision")}</button><button type="button" className="context-vault-action context-vault-action-secondary" onClick={() => void previewImport()}>{t("contextVault.import")}</button></div></div>) : <div className={`context-vault-grid${isEditing ? " is-editing" : ""}`}>
          <aside className="context-vault-list" aria-label={t("contextVault.claimList")}>{visibleClaims.map((claim) => <button key={claim.id} className={`context-vault-claim${selected?.id === claim.id ? " active" : ""}`} onClick={() => select(claim)}><b>{t(`contextVault.categories.${claim.category}`)}</b><span>{claim.claim}</span><small>{t(`contextVault.freshness.${claim.freshness}`)} · {t(`contextVault.review.${claim.verification.state}`)}</small></button>)}{!visibleClaims.length && <WorkTabEmpty icon={IconBookOpen} title={t("contextVault.noMatchingClaims")} body={t("contextVault.emptyBody")} />}</aside>
          {isEditing && <form className="context-vault-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}><header className="context-vault-editor-header"><div><strong>{creating ? t("contextVault.newClaim") : t("contextVault.editClaim")}</strong><span>{draft.provenance?.kind === "user" ? t("contextVault.userDecisionHint") : t("contextVault.evidenceHint")}</span></div><button className="context-vault-icon-button" type="button" onClick={closeEditor} aria-label={t("contextVault.closeEditor")}><IconClose size={15} /></button></header><label>{t("contextVault.claim")}<textarea value={draft.claim} onChange={(event) => change("claim", event.target.value)} required /></label><div className="context-vault-field-grid"><label>{t("contextVault.category")}<select value={draft.category} onChange={(event) => change("category", event.target.value as ContextVaultCategory)}>{categories.map((item) => <option key={item} value={item}>{t(`contextVault.categories.${item}`)}</option>)}</select></label><label>{t("contextVault.tags")}<input value={(draft.tags ?? []).join(", ")} placeholder={t("contextVault.tagsPlaceholder")} onChange={(event) => change("tags", parseTags(event.target.value))} /></label></div><label>{t("contextVault.impact")}<textarea value={draft.impact} onChange={(event) => change("impact", event.target.value)} required /></label><label>{t("contextVault.scope")}<input value={draft.scope} onChange={(event) => change("scope", event.target.value)} required /></label><label>{t("contextVault.recheckGuidance")}<textarea value={draft.recheckGuidance} onChange={(event) => change("recheckGuidance", event.target.value)} required /></label>
            {draft.provenance?.kind !== "user" && <section className="context-vault-evidence-section"><div className="context-vault-section-heading"><strong>{t("contextVault.evidence")}</strong><button className="context-vault-inline-button" type="button" onClick={() => change("evidence", [...(draft.evidence ?? []), evidenceRow()])}><IconPlus size={13} />{t("contextVault.addEvidence")}</button></div>{(draft.evidence ?? []).map((evidence, index) => <div className="context-vault-evidence-row" key={index}><label>{t("contextVault.evidencePath")}<input value={evidence.path} placeholder="src/example.ts" onChange={(event) => updateEvidence(index, { path: event.target.value })} required /></label><label>{t("contextVault.evidenceExcerpt")}<textarea value={evidence.excerpt} onChange={(event) => updateEvidence(index, { excerpt: event.target.value })} required /></label><button className="context-vault-icon-button" type="button" onClick={() => removeEvidence(index)} aria-label={t("contextVault.removeEvidence")}><IconClose size={14} /></button></div>)}</section>}
            <section className="context-vault-relationship-section"><div className="context-vault-section-heading"><strong><IconLink size={13} />{t("contextVault.relationship")}</strong><button className="context-vault-inline-button" type="button" disabled={(draft.relationships ?? []).length >= 12} onClick={() => change("relationships", [...(draft.relationships ?? []), { type: "related_to", targetId: "" }])}><IconPlus size={13} />{t("contextVault.addRelationship")}</button></div>{(draft.relationships ?? []).map((relationship, index) => <div className="context-vault-field-grid context-vault-relationship-row" key={`${relationship.targetId}-${index}`}><label>{t("contextVault.relationshipType")}<select value={relationship.type} onChange={(event) => updateRelationship(index, { type: event.target.value as ContextVaultRelationship["type"] })}><option value="related_to">{t("contextVault.relatedTo")}</option><option value="supersedes">{t("contextVault.supersedes")}</option></select></label><label>{t("contextVault.relationshipTarget")}<select value={relationship.targetId} onChange={(event) => updateRelationship(index, { targetId: event.target.value })} required><option value="">{t("contextVault.none")}</option>{claims.filter((claim) => claim.id !== selected?.id && !(draft.relationships ?? []).some((item, itemIndex) => itemIndex !== index && item.targetId === claim.id)).map((claim) => <option key={claim.id} value={claim.id}>{claim.claim}</option>)}</select></label><button className="context-vault-icon-button" type="button" onClick={() => removeRelationship(index)} aria-label={t("contextVault.removeRelationship")}><IconClose size={14} /></button></div>)}</section>
            {selected && <section className="context-vault-review-section"><div className="context-vault-section-heading"><strong>{t("contextVault.reviewLabel")}</strong><button className="context-vault-inline-button" type="button" disabled={busy !== null} onClick={() => void recheck()}>{t("contextVault.recheck")}</button></div><div className="context-vault-field-grid"><label>{t("contextVault.reviewState")}<select value={reviewState} onChange={(event) => setReviewState(event.target.value)}><option value="reviewed">{t("contextVault.review.reviewed")}</option><option value="conflicted">{t("contextVault.review.conflicted")}</option><option value="superseded">{t("contextVault.review.superseded")}</option></select></label><label>{t("contextVault.reviewNote")}<input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label></div><button className="context-vault-action context-vault-action-secondary" type="button" disabled={busy !== null} onClick={() => void review()}><IconCheck size={14} />{t("contextVault.applyReview")}</button></section>}
            <footer><button className="context-vault-action context-vault-action-primary" disabled={busy !== null} type="submit">{busy === "save" ? t("contextVault.saving") : t("contextVault.save")}</button><button className="context-vault-action context-vault-action-secondary" type="button" disabled={busy !== null} onClick={closeEditor}>{t("contextVault.cancel")}</button>{selected && <button className="context-vault-action context-vault-action-danger" type="button" disabled={busy !== null} onClick={() => setConfirmDelete(true)}><IconTrash size={14} />{t("contextVault.delete")}</button>}</footer></form>}
        </div>}
      </div>
    </div>
    {confirmDelete && selected && <div className="context-vault-modal-backdrop" role="presentation"><section className="context-vault-modal" role="dialog" aria-modal="true" aria-labelledby="context-vault-delete-title"><h2 id="context-vault-delete-title">{t("contextVault.deleteTitle")}</h2><p>{t("contextVault.deleteBody")}</p><footer><button className="context-vault-action context-vault-action-secondary" type="button" onClick={() => setConfirmDelete(false)}>{t("contextVault.cancel")}</button><button className="context-vault-action context-vault-action-danger" type="button" disabled={busy !== null} onClick={() => void deleteClaim()}>{t("contextVault.delete")}</button></footer></section></div>}
    {importSheet && <div className="context-vault-modal-backdrop" role="presentation"><section className="context-vault-modal context-vault-import-sheet" role="dialog" aria-modal="true" aria-labelledby="context-vault-import-title"><header><div><h2 id="context-vault-import-title">{t("contextVault.importPreview")}</h2><p>{t("contextVault.importPreviewBody")}</p></div><button className="context-vault-icon-button" type="button" onClick={() => setImportSheet(null)} aria-label={t("contextVault.closeImport")}><IconClose size={15} /></button></header><div className="context-vault-import-items">{importSheet.items.map((item) => { const selectable = item.status === "selectable"; const checked = selectedImportIndexes.includes(item.index); return <label className={`context-vault-import-item is-${item.status}`} key={item.index}><input type="checkbox" disabled={!selectable || busy !== null} checked={checked} onChange={() => setSelectedImportIndexes((current) => checked ? current.filter((index) => index !== item.index) : [...current, item.index])} /><span><b>{item.claim ?? t("contextVault.invalidClaim")}</b><small>{t(`contextVault.importStatus.${item.status}`, { defaultValue: item.status })}{item.reason ? ` · ${item.reason}` : ""}</small></span></label>; })}</div><footer><button className="context-vault-action context-vault-action-secondary" type="button" disabled={busy !== null} onClick={() => setImportSheet(null)}>{t("contextVault.cancel")}</button><button className="context-vault-action context-vault-action-primary" type="button" disabled={busy !== null || selectedImportIndexes.length === 0} onClick={() => void applyImport()}>{t("contextVault.importSelected", { count: selectedImportIndexes.length })}</button></footer></section></div>}
  </section>;
}
