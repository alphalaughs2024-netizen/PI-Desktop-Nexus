//! Native, project-scoped durable knowledge. This intentionally owns only
//! concise claims and cited evidence metadata: never session content, secrets,
//! plugin state, or a workspace index.

use anyhow::{anyhow, Result};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::Path;
use uuid::Uuid;

use crate::db::{now_ms, Database};

const CATEGORIES: &[&str] = &["architecture", "decisions", "conventions", "gotchas", "notes"];
const MAX_CLAIMS_PER_PACK: usize = 250;
const MAX_EVIDENCE: usize = 6;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    pub path: String,
    pub excerpt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol_hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtime_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Relationship { pub r#type: String, pub target_id: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Verification { pub state: String, #[serde(skip_serializing_if = "Option::is_none")] pub note: Option<String>, #[serde(skip_serializing_if = "Option::is_none")] pub last_checked_at: Option<i64> }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provenance { pub kind: String, #[serde(skip_serializing_if = "Option::is_none")] pub label: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Claim {
    pub id: String, pub project_path: String, pub claim: String, pub category: String,
    pub impact: String, pub scope: String, pub recheck_guidance: String,
    pub tags: Vec<String>, pub evidence: Vec<Evidence>, pub verification: Verification,
    pub freshness: String, pub provenance: Provenance, pub relationships: Vec<Relationship>,
    pub created_at: i64, pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimInput {
    pub claim: String, pub category: String, pub impact: String, pub scope: String,
    pub recheck_guidance: String, #[serde(default)] pub tags: Vec<String>,
    #[serde(default)] pub evidence: Vec<Evidence>, #[serde(default)] pub verification: Option<Verification>,
    #[serde(default)] pub provenance: Option<Provenance>, #[serde(default)] pub relationships: Vec<Relationship>,
}

fn invalid(message: impl Into<String>) -> anyhow::Error { anyhow!("CONTEXT_VAULT_INVALID: {}", message.into()) }
fn canonical_project(path: &str) -> Result<String> {
    let p = path.trim().replace('\\', "/");
    if p.is_empty() { return Err(invalid("project path required")); }
    Ok(p.trim_end_matches('/').to_ascii_lowercase())
}
fn bounded(value: &str, label: &str, max: usize) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.len() > max { return Err(invalid(format!("{label} must be 1..{max} characters"))); }
    Ok(value.to_string())
}
fn safe_evidence_path(value: &str) -> Result<String> {
    let value = value.trim().replace('\\', "/");
    if value.is_empty() || value.starts_with('/') || value.contains("../") || value == ".." || value.get(1..2) == Some(":") { return Err(invalid("evidence paths must be workspace-relative")); }
    Ok(value)
}
fn json<T: Serialize>(value: &T) -> Result<String> { Ok(serde_json::to_string(value)?) }
fn relevance_text(input: &ClaimInput) -> String { format!("{} {} {} {} {}", input.claim, input.impact, input.scope, input.category, input.tags.join(" ")).to_ascii_lowercase() }

fn validate(input: &ClaimInput, agent: bool) -> Result<(ClaimInput, String)> {
    let mut input = input.clone();
    input.claim = bounded(&input.claim, "claim", 240)?;
    input.impact = bounded(&input.impact, "impact", 1200)?;
    input.scope = bounded(&input.scope, "scope", 300)?;
    input.recheck_guidance = bounded(&input.recheck_guidance, "re-check guidance", 800)?;
    input.category = input.category.trim().to_ascii_lowercase();
    if !CATEGORIES.contains(&input.category.as_str()) { return Err(invalid("unsupported category")); }
    if input.tags.len() > 12 { return Err(invalid("at most 12 tags")); }
    input.tags = input.tags.into_iter().map(|tag| bounded(&tag, "tag", 48).map(|v| v.to_ascii_lowercase())).collect::<Result<_>>()?;
    input.tags.sort(); input.tags.dedup();
    let provenance = input.provenance.clone().unwrap_or(Provenance { kind: if agent { "agent".into() } else { "manual".into() }, label: None });
    if !["agent", "manual", "user", "import"].contains(&provenance.kind.as_str()) { return Err(invalid("unsupported provenance")); }
    if agent && provenance.kind == "user" { return Err(invalid("agents cannot create user decisions")); }
    if provenance.kind == "user" {
        if !input.evidence.is_empty() { return Err(invalid("user decisions cannot contain repository evidence")); }
    } else {
        if input.evidence.is_empty() || input.evidence.len() > MAX_EVIDENCE { return Err(invalid("repository claims require 1..6 evidence references")); }
        for evidence in &mut input.evidence { evidence.path = safe_evidence_path(&evidence.path)?; evidence.excerpt = bounded(&evidence.excerpt, "evidence excerpt", 600)?; if evidence.excerpt.len() < 20 { return Err(invalid("evidence excerpts need at least 20 characters")); } }
    }
    if input.relationships.len() > 12 { return Err(invalid("at most 12 relationships")); }
    for relation in &input.relationships { if !["supersedes", "related_to"].contains(&relation.r#type.as_str()) || relation.target_id.trim().is_empty() { return Err(invalid("invalid relationship")); } }
    input.provenance = Some(provenance);
    let text = relevance_text(&input);
    Ok((input, text))
}

fn evidence_mtime(path: &Path) -> Option<i64> {
    std::fs::metadata(path).ok()?.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_millis() as i64)
}

fn attach_evidence_metadata(input: &mut ClaimInput, workspace: Option<&Path>) {
    let Some(workspace) = workspace else { return; };
    for evidence in &mut input.evidence {
        if let Ok(path) = crate::workspace::resolve_in_workspace(workspace, &evidence.path) {
            evidence.mtime_ms = evidence_mtime(&path);
        }
    }
}

fn validate_relationships(db: &Database, project: &str, owner_id: Option<&str>, relationships: &[Relationship]) -> Result<()> {
    for relation in relationships {
        if owner_id == Some(relation.target_id.as_str()) { return Err(invalid("a claim cannot relate to itself")); }
        let target = get(db, &relation.target_id)?.ok_or_else(|| invalid("relationship target does not exist"))?;
        if target.project_path != project { return Err(invalid("relationship target belongs to another project")); }
        if relation.r#type == "supersedes" {
            let mut cursor = target;
            let mut seen = HashSet::new();
            while seen.insert(cursor.id.clone()) {
                if owner_id == Some(cursor.id.as_str()) { return Err(invalid("supersedes relationships cannot form a cycle")); }
                let next = cursor.relationships.iter().find(|item| item.r#type == "supersedes");
                let Some(next) = next else { break; };
                cursor = get(db, &next.target_id)?.ok_or_else(|| invalid("relationship target does not exist"))?;
            }
        }
    }
    Ok(())
}

fn row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Claim> {
    let tags: String = row.get(7)?; let evidence: String = row.get(8)?; let verification: String = row.get(9)?; let provenance: String = row.get(11)?; let relationships: String = row.get(12)?;
    Ok(Claim { id: row.get(0)?, project_path: row.get(1)?, claim: row.get(2)?, category: row.get(3)?, impact: row.get(4)?, scope: row.get(5)?, recheck_guidance: row.get(6)?, tags: serde_json::from_str(&tags).unwrap_or_default(), evidence: serde_json::from_str(&evidence).unwrap_or_default(), verification: serde_json::from_str(&verification).unwrap_or(Verification { state: "unverified".into(), note: None, last_checked_at: None }), freshness: row.get(10)?, provenance: serde_json::from_str(&provenance).unwrap_or(Provenance { kind: "manual".into(), label: None }), relationships: serde_json::from_str(&relationships).unwrap_or_default(), created_at: row.get(14)?, updated_at: row.get(15)? })
}
const SELECT: &str = "SELECT id,project_path,claim,category,impact,scope,recheck_guidance,tags_json,evidence_json,verification_json,freshness,provenance_json,relationships_json,relevance_text,created_at,updated_at FROM context_vault_claims";

pub fn list(db: &Database, project: &str, query: Option<&str>) -> Result<Vec<Claim>> {
    let project = canonical_project(project)?;
    let mut statement = db.conn().prepare_cached(&format!("{SELECT} WHERE project_path=?1 ORDER BY updated_at DESC"))?;
    let claims = statement.query_map(params![project], row)?.collect::<rusqlite::Result<Vec<_>>>()?;
    let tokens: Vec<String> = query.unwrap_or("").to_ascii_lowercase().split_whitespace().map(str::to_string).collect();
    Ok(claims.into_iter().filter(|claim| tokens.iter().all(|token| format!("{} {} {} {}", claim.claim, claim.impact, claim.scope, claim.tags.join(" ")).to_ascii_lowercase().contains(token))).collect())
}

pub fn list_with_staleness(db: &Database, project: &str, query: Option<&str>, workspace: Option<&Path>) -> Result<Vec<Claim>> {
    let mut claims = list(db, project, query)?;
    let Some(workspace) = workspace else { return Ok(claims); };
    for claim in &mut claims {
        if claim.evidence.iter().any(|evidence| {
            crate::workspace::resolve_in_workspace(workspace, &evidence.path).ok().and_then(|path| evidence_mtime(&path)).zip(evidence.mtime_ms).is_some_and(|(current, recorded)| current != recorded)
        }) && claim.freshness != "stale" && claim.freshness != "unavailable" {
            claim.freshness = "possibly_stale".into();
        }
    }
    Ok(claims)
}

pub fn create_with_workspace(db: &Database, project: &str, input: ClaimInput, agent: bool, workspace: Option<&Path>) -> Result<Value> {
    let project = canonical_project(project)?; let (mut input, relevance) = validate(&input, agent)?;
    attach_evidence_metadata(&mut input, workspace);
    validate_relationships(db, &project, None, &input.relationships)?;
    let existing = list(db, &project, None)?;
    if let Some(claim) = existing.iter().find(|old| old.category == input.category && old.claim.eq_ignore_ascii_case(&input.claim) && old.scope.eq_ignore_ascii_case(&input.scope)) { return Ok(json!({"status":"duplicate","claim":claim})); }
    if let Some(claim) = existing.iter().find(|old| old.category == input.category && old.claim.split_whitespace().filter(|word| input.claim.to_ascii_lowercase().contains(&word.to_ascii_lowercase())).count() >= 3) { return Ok(json!({"status":"possible_overlap","claim":claim,"recommendedAction":"review, edit, or supersede the existing claim"})); }
    let now = now_ms(); let id = Uuid::new_v4().to_string(); let provenance = input.provenance.clone().unwrap();
    let verification = input.verification.unwrap_or(Verification { state: "unverified".into(), note: None, last_checked_at: None });
    let freshness = if provenance.kind == "user" { "unverified" } else { "unverified" };
    db.conn().execute("INSERT INTO context_vault_claims (id,project_path,claim,category,impact,scope,recheck_guidance,tags_json,evidence_json,verification_json,freshness,provenance_json,relationships_json,relevance_text,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?15)", params![id, project, input.claim, input.category, input.impact, input.scope, input.recheck_guidance, json(&input.tags)?, json(&input.evidence)?, json(&verification)?, freshness, json(&provenance)?, json(&input.relationships)?, relevance, now])?;
    for relation in &input.relationships { if relation.r#type == "supersedes" { let verification = Verification { state: "superseded".into(), note: Some(format!("Superseded by {id}")), last_checked_at: None }; db.conn().execute("UPDATE context_vault_claims SET verification_json=?1, updated_at=?2 WHERE id=?3", params![json(&verification)?, now, relation.target_id])?; } }
    Ok(json!({"status":"created","claim": get(db, &id)?}))
}
pub fn create(db: &Database, project: &str, input: ClaimInput, agent: bool) -> Result<Value> { create_with_workspace(db, project, input, agent, None) }
pub fn get(db: &Database, id: &str) -> Result<Option<Claim>> { Ok(db.conn().query_row(&format!("{SELECT} WHERE id=?1"), params![id], row).optional()?) }
pub fn delete(db: &Database, project: &str, id: &str) -> Result<bool> { Ok(db.conn().execute("DELETE FROM context_vault_claims WHERE id=?1 AND project_path=?2", params![id, canonical_project(project)?])? > 0) }

pub fn update(db: &Database, project: &str, id: &str, input: ClaimInput, workspace: Option<&Path>) -> Result<Option<Claim>> {
    let project = canonical_project(project)?;
    let existing = get(db, id)?.ok_or_else(|| anyhow!("CONTEXT_VAULT_NOT_FOUND: claim missing"))?;
    if existing.project_path != project { return Ok(None); }
    let (mut input, relevance) = validate(&input, false)?;
    attach_evidence_metadata(&mut input, workspace);
    validate_relationships(db, &project, Some(id), &input.relationships)?;
    let verification = input.verification.unwrap_or(existing.verification);
    let freshness = if input.provenance.as_ref().is_some_and(|p| p.kind == "user") { "unverified" } else { "unverified" };
    db.conn().execute("UPDATE context_vault_claims SET claim=?1,category=?2,impact=?3,scope=?4,recheck_guidance=?5,tags_json=?6,evidence_json=?7,verification_json=?8,freshness=?9,provenance_json=?10,relationships_json=?11,relevance_text=?12,updated_at=?13 WHERE id=?14", params![input.claim,input.category,input.impact,input.scope,input.recheck_guidance,json(&input.tags)?,json(&input.evidence)?,json(&verification)?,freshness,json(&input.provenance)?,json(&input.relationships)?,relevance,now_ms(),id])?;
    Ok(get(db, id)?)
}

pub fn review(db: &Database, project: &str, id: &str, state: &str, note: &str) -> Result<Option<Claim>> {
    if !["unverified", "reviewed", "conflicted", "superseded"].contains(&state) { return Err(invalid("unsupported review state")); }
    let claim = get(db, id)?.ok_or_else(|| anyhow!("CONTEXT_VAULT_NOT_FOUND: claim missing"))?;
    if claim.project_path != canonical_project(project)? { return Ok(None); }
    let note = note.trim();
    let verification = Verification { state: state.to_string(), note: if note.is_empty() { None } else { Some(bounded(note, "review note", 600)?) }, last_checked_at: claim.verification.last_checked_at };
    db.conn().execute("UPDATE context_vault_claims SET verification_json=?1, updated_at=?2 WHERE id=?3", params![json(&verification)?, now_ms(), id])?;
    get(db, id)
}

pub fn recheck(db: &Database, project: &str, id: &str, workspace: &Path) -> Result<Option<Claim>> {
    let mut claim = get(db, id)?.ok_or_else(|| anyhow!("CONTEXT_VAULT_NOT_FOUND: claim missing"))?;
    if claim.project_path != canonical_project(project)? { return Ok(None); }
    if claim.evidence.is_empty() { return Ok(Some(claim)); }
    let mut unavailable = false; let mut stale = false;
    for evidence in &mut claim.evidence {
        let file = crate::workspace::resolve_in_workspace(workspace, &evidence.path).map_err(|_| invalid("evidence path escapes workspace"))?;
        match std::fs::read_to_string(&file) {
            Ok(content) if content.contains(&evidence.excerpt) => { evidence.mtime_ms = std::fs::metadata(&file).ok().and_then(|m| m.modified().ok()).and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64); }
            Ok(_) => stale = true,
            Err(_) => unavailable = true,
        }
    }
    claim.freshness = if unavailable { "unavailable" } else if stale { "stale" } else { "fresh" }.to_string();
    claim.verification.last_checked_at = Some(now_ms());
    db.conn().execute("UPDATE context_vault_claims SET evidence_json=?1, verification_json=?2, freshness=?3, updated_at=?4 WHERE id=?5", params![json(&claim.evidence)?, json(&claim.verification)?, claim.freshness, now_ms(), id])?;
    get(db, id)
}

pub fn brief(db: &Database, project: &str, query: &str, workspace: &Path) -> Result<Value> {
    let claims = list(db, project, Some(query))?.into_iter().take(8).collect::<Vec<_>>();
    let mut checked = Vec::new();
    for claim in claims { if let Some(claim) = recheck(db, project, &claim.id, workspace)? { let disposition = if claim.freshness == "fresh" && claim.verification.state == "reviewed" { "usable" } else if claim.freshness == "stale" || ["conflicted", "superseded"].contains(&claim.verification.state.as_str()) { "stale_or_conflicted" } else if claim.freshness == "unavailable" { "evidence_unavailable" } else { "needs_review" }; checked.push(json!({"claim":claim,"disposition":disposition})); } }
    Ok(json!({"claims":checked,"note":"Stored knowledge is evidence, not guaranteed current truth."}))
}

pub fn relevance(db: &Database, project: &str, query: &str, workspace: Option<&Path>) -> Result<Value> {
    let claims = list_with_staleness(db, project, Some(query), workspace)?;
    let possibly_stale = claims.iter().filter(|claim| claim.freshness == "possibly_stale" || claim.freshness == "stale").count();
    Ok(json!({"count": claims.len(), "ids": claims.iter().map(|claim| &claim.id).collect::<Vec<_>>(), "possiblyStale": possibly_stale}))
}

pub fn export(db: &Database, project: &str) -> Result<Value> {
    let claims = list(db, project, None)?;
    let portable: Result<Vec<Value>> = claims.into_iter().map(|mut claim| { claim.project_path.clear(); for evidence in &mut claim.evidence { evidence.mtime_ms = None; } claim.verification.last_checked_at = None; serde_json::to_value(claim).map_err(Into::into) }).collect();
    Ok(json!({"format":"context-vault-export/v1","exportedAt":now_ms(),"claims":portable?}))
}

pub fn import_preview(db: &Database, project: &str, pack: &Value) -> Result<Value> {
    if pack.get("format").and_then(Value::as_str) != Some("context-vault-export/v1") { return Err(invalid("unsupported Context Vault export format")); }
    let entries = pack.get("claims").and_then(Value::as_array).ok_or_else(|| invalid("claims array required"))?;
    if entries.len() > MAX_CLAIMS_PER_PACK { return Err(invalid("too many claims in export")); }
    let current = list(db, project, None)?;
    let results: Vec<Value> = entries.iter().enumerate().map(|(index, raw)| { let parsed: Result<Claim> = serde_json::from_value(raw.clone()).map_err(Into::into); match parsed.and_then(|claim| validate(&ClaimInput { claim: claim.claim.clone(), category: claim.category.clone(), impact: claim.impact.clone(), scope: claim.scope.clone(), recheck_guidance: claim.recheck_guidance.clone(), tags: claim.tags.clone(), evidence: claim.evidence.clone(), verification: Some(claim.verification.clone()), provenance: Some(claim.provenance.clone()), relationships: vec![] }, false).map(|_| claim)) { Ok(claim) if current.iter().any(|existing| existing.claim.eq_ignore_ascii_case(&claim.claim) && existing.scope.eq_ignore_ascii_case(&claim.scope)) => json!({"index":index,"status":"duplicate","claim":claim.claim}), Ok(claim) if current.iter().any(|existing| existing.category == claim.category && existing.claim.split_whitespace().filter(|word| claim.claim.to_ascii_lowercase().contains(&word.to_ascii_lowercase())).count() >= 3) => json!({"index":index,"status":"overlap","claim":claim.claim}), Ok(claim) => json!({"index":index,"status":"selectable","claim":claim.claim}), Err(error) => json!({"index":index,"status":"invalid","reason":error.to_string()}) } }).collect();
    Ok(json!({"items":results}))
}

pub fn import_apply(db: &Database, project: &str, pack: &Value, selected: &[usize]) -> Result<Value> {
    if pack.get("format").and_then(Value::as_str) != Some("context-vault-export/v1") { return Err(invalid("unsupported Context Vault export format")); }
    let entries = pack.get("claims").and_then(Value::as_array).ok_or_else(|| invalid("claims array required"))?;
    if entries.len() > MAX_CLAIMS_PER_PACK { return Err(invalid("too many claims in export")); }
    let selected: HashSet<usize> = selected.iter().copied().collect(); let mut imported = 0; let mut skipped = 0;
    for (index, raw) in entries.iter().enumerate() { if !selected.contains(&index) { continue; } let claim: Claim = match serde_json::from_value(raw.clone()) { Ok(value) => value, Err(_) => { skipped += 1; continue; } }; let input = ClaimInput { claim: claim.claim, category: claim.category, impact: claim.impact, scope: claim.scope, recheck_guidance: claim.recheck_guidance, tags: claim.tags, evidence: claim.evidence, verification: Some(claim.verification), provenance: Some(claim.provenance), relationships: vec![] }; match create(db, project, input, false)? .get("status").and_then(Value::as_str) { Some("created") => imported += 1, _ => skipped += 1 } }
    Ok(json!({"imported":imported,"skipped":skipped}))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repository_claim(path: &str) -> ClaimInput {
        ClaimInput {
            claim: "A durable architecture boundary".into(), category: "architecture".into(),
            impact: "Future changes need to preserve this boundary.".into(), scope: "host core".into(),
            recheck_guidance: "Read the cited implementation before changing it.".into(), tags: vec!["host".into()],
            evidence: vec![Evidence { path: path.into(), excerpt: "This is an exact durable evidence excerpt.".into(), symbol_hint: None, mtime_ms: None }],
            verification: None, provenance: None, relationships: vec![],
        }
    }

    #[test]
    fn evidence_paths_are_relative_and_user_decisions_have_no_evidence() {
        assert!(validate(&repository_claim("../outside.rs"), false).is_err());
        let mut user = repository_claim("src/lib.rs");
        user.provenance = Some(Provenance { kind: "user".into(), label: None });
        assert!(validate(&user, false).is_err());
        user.evidence.clear();
        assert!(validate(&user, false).is_ok());
    }

    #[test]
    fn agents_cannot_claim_user_provenance() {
        let mut input = repository_claim("src/lib.rs");
        input.provenance = Some(Provenance { kind: "user".into(), label: None });
        assert!(validate(&input, true).is_err());
    }
}
