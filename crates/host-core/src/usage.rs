use anyhow::{anyhow, Result};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use crate::db::Database;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    id: String, session_id: String, turn_id: String, provider_id: String, model_id: String,
    #[serde(skip_serializing_if = "Option::is_none")] agent_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] response_id: Option<String>,
    occurred_at: i64, kind: String, outcome: String,
    #[serde(skip_serializing_if = "Option::is_none")] usage: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")] amount_usd: Option<String>,
    provenance: String,
}

fn nanos(amount: &str) -> Option<u128> {
    if amount.len() > 30 { return None; }
    let mut parts = amount.split('.');
    let whole = parts.next()?;
    let fraction = parts.next().unwrap_or("");
    if parts.next().is_some() || whole.is_empty() || fraction.len() > 9
        || !whole.bytes().all(|v| v.is_ascii_digit()) || !fraction.bytes().all(|v| v.is_ascii_digit()) { return None; }
    whole.parse::<u128>().ok()?.checked_mul(1_000_000_000)?.checked_add(
        format!("{fraction:0<9}").parse::<u128>().ok()?)
}
fn dollars(value: u128) -> String { format!("{}.{:09}", value / 1_000_000_000, value % 1_000_000_000) }
fn count(usage: &Value, key: &str) -> u64 { usage.get(key).and_then(Value::as_u64).unwrap_or(0) }

pub fn record(db: &Database, value: Value) -> Result<Value> {
    let record: Request = serde_json::from_value(value)?;
    for id in [&record.id, &record.session_id, &record.turn_id, &record.provider_id, &record.model_id] {
        if id.trim().is_empty() || id.len() > 512 { return Err(anyhow!("INVALID_USAGE_ID")); }
    }
    if record.agent_name.as_ref().is_some_and(|v| v.len() > 128) || record.response_id.as_ref().is_some_and(|v| v.len() > 512)
        || record.occurred_at < 0 || !["response", "compaction"].contains(&record.kind.as_str())
        || !["running", "completed", "failed", "interrupted"].contains(&record.outcome.as_str())
        || !["provider_reported", "provider_generation", "provider_estimate", "catalog_estimate", "unpriced", "unavailable"].contains(&record.provenance.as_str()) {
        return Err(anyhow!("INVALID_USAGE_RECORD"));
    }
    if let Some(usage) = &record.usage {
        for key in ["inputTokens", "outputTokens", "totalTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens"] {
            if usage.get(key).is_none() && ["cacheReadTokens", "cacheWriteTokens", "reasoningTokens"].contains(&key) { continue; }
            if !usage.get(key).and_then(Value::as_u64).is_some_and(|v| v <= 9_007_199_254_740_991) { return Err(anyhow!("INVALID_USAGE_TOKENS")); }
        }
        if !usage.is_object() || usage.as_object().unwrap().keys().any(|key| !["inputTokens", "outputTokens", "totalTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens"].contains(&key.as_str())) {
            return Err(anyhow!("INVALID_USAGE_FIELDS"));
        }
    }
    if record.amount_usd.as_ref().is_some_and(|v| nanos(v).is_none()) || record.amount_usd.is_some() && ["unpriced", "unavailable"].contains(&record.provenance.as_str()) {
        return Err(anyhow!("INVALID_USAGE_COST"));
    }
    let owner: Option<String> = db.conn().query_row("SELECT session_id FROM turns WHERE id=?1", [&record.turn_id], |r| r.get(0)).optional()?;
    if owner.as_deref() != Some(&record.session_id) { return Err(anyhow!("USAGE_TURN_OWNERSHIP")); }
    let existing: Option<(String, String)> = db.conn().query_row("SELECT turn_id, record_json FROM usage_requests WHERE id=?1", [&record.id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
    if let Some((turn, raw)) = existing {
        let old: Request = serde_json::from_str(&raw)?;
        if turn != record.turn_id || old.session_id != record.session_id || old.provider_id != record.provider_id || old.model_id != record.model_id
            || old.kind != record.kind || old.occurred_at != record.occurred_at || old.agent_name != record.agent_name { return Err(anyhow!("USAGE_ID_CONFLICT")); }
        if serde_json::from_str::<Value>(&raw)? == serde_json::to_value(&record)? { return Ok(json!({"recorded": false})); }
        if old.outcome != "running" { return Err(anyhow!("USAGE_FINAL_IMMUTABLE")); }
        db.conn().execute("UPDATE usage_requests SET record_json=?1 WHERE id=?2", params![serde_json::to_string(&record)?, record.id])?;
        return Ok(json!({"recorded": true}));
    }
    db.conn().execute("INSERT INTO usage_requests(id,turn_id,record_json) VALUES(?1,?2,?3)", params![record.id,record.turn_id,serde_json::to_string(&record)?])?;
    Ok(json!({"recorded": true}))
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Totals {
    turn_count: usize, request_count: u64, total_tokens: u64, input_tokens: u64, output_tokens: u64,
    cache_read_tokens: u64, cache_write_tokens: u64, reasoning_tokens: u64,
    reported_usd: String, estimated_usd: String, priced_requests: u64, reported_requests: u64, estimated_requests: u64, unknown_requests: u64, legacy_turns: u64,
    #[serde(skip)] reported: u128, #[serde(skip)] estimated: u128, #[serde(skip)] turns: BTreeSet<String>,
}
impl Totals {
    fn add(&mut self, request: &Request, legacy: bool) {
        self.turns.insert(request.turn_id.clone());
        if legacy { self.legacy_turns += 1; } else { self.request_count += 1; }
        if let Some(u) = &request.usage {
            self.input_tokens += count(u,"inputTokens"); self.output_tokens += count(u,"outputTokens");
            self.cache_read_tokens += count(u,"cacheReadTokens"); self.cache_write_tokens += count(u,"cacheWriteTokens");
            self.reasoning_tokens += count(u,"reasoningTokens"); self.total_tokens += count(u,"totalTokens");
        }
        if let Some(amount) = request.amount_usd.as_deref().and_then(nanos) {
            self.priced_requests += 1;
            if ["provider_reported", "provider_generation"].contains(&request.provenance.as_str()) { self.reported += amount; self.reported_requests += 1; }
            else { self.estimated += amount; self.estimated_requests += 1; }
        } else { self.unknown_requests += 1; }
    }
    fn finish(mut self) -> Value {
        self.turn_count = self.turns.len(); self.reported_usd = dollars(self.reported); self.estimated_usd = dollars(self.estimated);
        serde_json::to_value(self).unwrap()
    }
}

pub fn history(db: &Database, query: &Value) -> Result<Value> {
    let start = query.get("startDate").and_then(Value::as_i64).unwrap_or(0);
    let end = query.get("endDate").and_then(Value::as_i64).unwrap_or(i64::MAX);
    if start < 0 || end < start { return Err(anyhow!("INVALID_USAGE_RANGE")); }
    let mut stmt = db.conn().prepare("SELECT t.id,t.session_id,t.provider_id,t.model_id,t.started_at,t.usage_json,t.input_tokens,t.output_tokens,s.title,u.record_json
        FROM turns t JOIN sessions s ON s.id=t.session_id LEFT JOIN usage_requests u ON u.turn_id=t.id
        WHERE COALESCE(json_extract(u.record_json,'$.occurredAt'),t.started_at) >= ?1
        AND COALESCE(json_extract(u.record_json,'$.occurredAt'),t.started_at) <= ?2
        AND (?3 IS NULL OR t.session_id=?3)
        ORDER BY COALESCE(json_extract(u.record_json,'$.occurredAt'),t.started_at) DESC,u.id")?;
    let rows = stmt.query_map(params![start,end,query.get("sessionId").and_then(Value::as_str)], |r| Ok((
        r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,Option<String>>(2)?.unwrap_or_default(),r.get::<_,Option<String>>(3)?.unwrap_or_default(),
        r.get::<_,i64>(4)?,r.get::<_,Option<String>>(5)?,r.get::<_,i64>(6)?.max(0) as u64,r.get::<_,i64>(7)?.max(0) as u64,r.get::<_,String>(8)?,r.get::<_,Option<String>>(9)?)))?;
    let mut totals = Totals::default();
    let mut sessions: BTreeMap<String,(String,Totals)> = BTreeMap::new();
    let mut models: BTreeMap<String,(String,String,Totals)> = BTreeMap::new();
    let mut days: BTreeMap<String,Totals> = BTreeMap::new();
    let mut recent = Vec::new();
    for row in rows {
        let (turn,session,provider,model,at,usage,input,output,title,raw) = row?;
        let legacy = raw.is_none();
        let record = if let Some(raw) = raw { serde_json::from_str::<Request>(&raw)? } else {
            let usage = usage.and_then(|v| serde_json::from_str::<Value>(&v).ok()).or_else(|| if input+output > 0 {Some(json!({"inputTokens":input,"outputTokens":output,"totalTokens":input+output}))} else {None});
            Request { id:format!("legacy:{turn}"),session_id:session.clone(),turn_id:turn,provider_id:provider,model_id:model,agent_name:None,response_id:None,occurred_at:at,kind:"response".into(),outcome:"completed".into(),usage,amount_usd:None,provenance:"unavailable".into() }
        };
        if query.get("providerId").and_then(Value::as_str).is_some_and(|v| v != record.provider_id)
            || query.get("modelId").and_then(Value::as_str).is_some_and(|v| v != record.model_id) { continue; }
        totals.add(&record,legacy);
        sessions.entry(session).or_insert_with(|| (title,Totals::default())).1.add(&record,legacy);
        let key = format!("{}:{}",record.provider_id,record.model_id);
        models.entry(key).or_insert_with(|| (record.provider_id.clone(),record.model_id.clone(),Totals::default())).2.add(&record,legacy);
        let day = chrono::DateTime::from_timestamp_millis(record.occurred_at).ok_or_else(||anyhow!("INVALID_USAGE_DATE"))?.format("%Y-%m-%d").to_string();
        days.entry(day).or_default().add(&record,legacy);
        if recent.len() < 200 && !legacy { recent.push(record); }
    }
    let sessions: Vec<Value> = sessions.into_iter().map(|(id,(label,t))| {let mut v=t.finish();v["id"]=json!(id);v["label"]=json!(if label.is_empty(){"Untitled chat"}else{&label});v}).collect();
    let models: Vec<Value> = models.into_iter().map(|(id,(provider,model,t))| {let mut v=t.finish();v["id"]=json!(id);v["label"]=json!(model);v["modelId"]=json!(model);v["providerId"]=json!(provider);v}).collect();
    let days: Vec<Value> = days.into_iter().map(|(id,t)|{let mut v=t.finish();v["id"]=json!(id);v["label"]=json!(id);v}).collect();
    Ok(json!({"totals":totals.finish(),"sessions":sessions,"models":models,"days":days,"requests":recent}))
}

pub fn turn_usage(db: &Database, turn_id: &str) -> Result<Option<Value>> {
    let mut stmt=db.conn().prepare("SELECT record_json FROM usage_requests WHERE turn_id=?1")?;
    let mut total=Totals::default(); let mut found=false;
    for row in stmt.query_map([turn_id],|r|r.get::<_,String>(0))? {
        let record:Request=serde_json::from_str(&row?)?;
        if record.usage.is_some(){found=true;total.add(&record,false);}
    }
    if !found {return Ok(None);}
    Ok(Some(json!({"inputTokens":total.input_tokens,"outputTokens":total.output_tokens,"cacheReadTokens":total.cache_read_tokens,"cacheWriteTokens":total.cache_write_tokens,"reasoningTokens":total.reasoning_tokens,"totalTokens":total.total_tokens})))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, Database) {
        let dir=tempfile::tempdir().unwrap(); let db=Database::open(&dir.path().join("usage.sqlite")).unwrap();
        db.conn().execute_batch("INSERT INTO sessions(id,title,created_at,updated_at) VALUES('s','Chat',1,1),('other','Other',1,1);
            INSERT INTO turns(id,session_id,status,provider_id,model_id,started_at) VALUES('t','s','error','p','m',1),('old','s','completed','p','m',2);").unwrap();
        (dir,db)
    }
    fn request(id: &str, amount: Option<&str>, source: &str) -> Value {
        json!({"id":id,"sessionId":"s","turnId":"t","providerId":"p","modelId":"m","occurredAt":1,"kind":"response","outcome":"failed",
            "usage":{"inputTokens":10,"outputTokens":20,"reasoningTokens":5,"cacheReadTokens":2,"totalTokens":37},"amountUsd":amount,"provenance":source})
    }
    #[test]
    fn ledger_is_durable_idempotent_and_counts_parent_turns_once() {
        let (dir,db)=fixture(); let a=request("a",Some("0.1"),"provider_reported");
        record(&db,a.clone()).unwrap(); record(&db,a).unwrap();
        let mut b=request("b",Some("0.2"),"provider_estimate"); b["agentName"]=json!("Reviewer"); b["providerId"]=json!("delegate-provider"); record(&db,b).unwrap();
        let h=history(&db,&json!({})).unwrap();
        assert_eq!(h["totals"]["requestCount"],2); assert_eq!(h["totals"]["turnCount"],2);
        assert_eq!(h["totals"]["reportedUsd"],"0.100000000"); assert_eq!(h["totals"]["estimatedUsd"],"0.200000000");
        assert_eq!(h["totals"]["legacyTurns"],1); assert_eq!(h["totals"]["unknownRequests"],1);
        assert_eq!(h["totals"]["totalTokens"],74); assert_eq!(h["models"].as_array().unwrap().len(),2);
        assert_eq!(turn_usage(&db,"t").unwrap().unwrap()["reasoningTokens"],10);
        drop(db); let db=Database::open(&dir.path().join("usage.sqlite")).unwrap();
        assert_eq!(history(&db,&json!({"providerId":"delegate-provider"})).unwrap()["totals"]["requestCount"],1);
    }
    #[test]
    fn pending_records_can_finish_but_final_cost_and_ownership_are_immutable() {
        let (_dir,db)=fixture(); let mut pending=request("a",None,"unavailable"); pending.as_object_mut().unwrap().remove("usage"); pending["outcome"]=json!("running");
        record(&db,pending).unwrap(); record(&db,request("a",Some("0"),"provider_reported")).unwrap();
        assert!(record(&db,request("a",Some("1"),"provider_reported")).is_err());
        let mut wrong=request("b",Some("1"),"provider_reported"); wrong["sessionId"]=json!("other"); assert!(record(&db,wrong).is_err());
        let mut negative=request("c",Some("-1"),"provider_reported"); assert!(record(&db,negative.clone()).is_err());
        negative["amountUsd"]=json!("1"); negative["usage"]["inputTokens"]=json!(-1); assert!(record(&db,negative).is_err());
        assert_eq!(history(&db,&json!({"sessionId":"s"})).unwrap()["totals"]["reportedRequests"],1);
    }
    #[test]
    fn dates_filter_request_time_and_latest_list_does_not_truncate_totals() {
        let (_dir,db)=fixture();
        for i in 0..205 {let mut r=request(&format!("r{i}"),Some("0.000000001"),"provider_reported");r["occurredAt"]=json!(100+i); record(&db,r).unwrap();}
        let h=history(&db,&json!({"startDate":100})).unwrap();
        assert_eq!(h["requests"].as_array().unwrap().len(),200); assert_eq!(h["totals"]["requestCount"],205);
        assert_eq!(h["totals"]["reportedUsd"],"0.000000205"); assert_eq!(h["totals"]["turnCount"],1);
    }
}
