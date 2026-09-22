//! Desktop search projections. SQLite owns discovery; JSONL owns message content.

use anyhow::Result;
use rusqlite::{functions::FunctionFlags, params, OptionalExtension};
use serde::Serialize;

use crate::db::{ms_to_ts, Database};
use crate::sessions::{self, SessionSummary};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageMatch {
    pub message_id: String,
    pub role: String,
    pub created_at: String,
    pub snippet: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMatch {
    pub session: SessionSummary,
    pub project_name: Option<String>,
    pub metadata_match: bool,
    pub message_count: i64,
    pub matches: Vec<MessageMatch>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage {
    pub hits: Vec<SessionMatch>,
    pub next_offset: Option<i64>,
}

/// Unicode lowercase is shared with the renderer. A scalar function keeps
/// short and non-ASCII queries literal without relying on SQLite's ASCII LIKE.
fn register_contains(db: &Database) -> Result<()> {
    db.conn().create_scalar_function(
        "pi_search_contains",
        2,
        FunctionFlags::SQLITE_UTF8
            | FunctionFlags::SQLITE_DETERMINISTIC
            | FunctionFlags::SQLITE_INNOCUOUS,
        |ctx| {
            let text = ctx.get::<Option<String>>(0)?.unwrap_or_default();
            let query = ctx.get::<String>(1)?;
            Ok(text.to_lowercase().contains(&query.to_lowercase()))
        },
    )?;
    Ok(())
}

/// FTS is a prefilter for ASCII and uncased text such as CJK. Non-ASCII
/// case mappings use a literal scan to avoid the FTS tokenizer's older Unicode
/// tables dropping characters handled by the host/renderer lowercase rules.
pub fn search(db: &Database, query: &str, offset: i64) -> Result<SearchPage> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(SearchPage {
            hits: vec![],
            next_offset: None,
        });
    }
    let offset = offset.max(0);
    register_contains(db)?;
    let quoted = format!("\"{}\"", query.replace('"', "\"\""));
    let fts = if query.chars().count() >= 3
        && !query.contains('\u{0307}')
        && query
            .chars()
            .all(|ch| ch.is_ascii() || (!ch.is_lowercase() && !ch.is_uppercase()))
    {
        "AND m.mid IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?2)"
    } else {
        "AND ?2 IS NOT NULL"
    };
    let sql = format!(
        "WITH matched AS (
           SELECT m.session_id, COUNT(*) AS count FROM messages m
           WHERE m.role IN ('user', 'assistant') AND pi_search_contains(m.text, ?1) {fts}
           GROUP BY m.session_id
         )
         SELECT s.id, s.title, s.last_seq, p.path, s.model_id, s.provider_id, s.mode,
                s.thinking_level, s.permission_mode, s.updated_at, s.created_at,
                p.name, COALESCE(matched.count, 0),
                (pi_search_contains(s.title, ?1) OR pi_search_contains(p.name, ?1)
                 OR pi_search_contains(p.path, ?1)) AS metadata_match
         FROM sessions s LEFT JOIN projects p ON p.id = s.project_id
         LEFT JOIN matched ON matched.session_id = s.id
         WHERE s.deleted_at IS NULL AND (matched.count > 0 OR metadata_match)
         ORDER BY s.updated_at DESC, s.id ASC LIMIT 31 OFFSET ?3"
    );
    let mut hits = db
        .conn()
        .prepare_cached(&sql)?
        .query_map(params![query, quoted, offset], |row| {
            Ok(SessionMatch {
                session: sessions::summary_from_row(row)?,
                project_name: row.get(11)?,
                message_count: row.get(12)?,
                metadata_match: row.get(13)?,
                matches: vec![],
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let next_offset = (hits.len() > 30).then(|| offset.saturating_add(30));
    hits.truncate(30);
    let mut snippets = db.conn().prepare_cached(
        "SELECT id, role, created_at, text FROM messages
         WHERE session_id = ?1 AND role IN ('user', 'assistant') AND pi_search_contains(text, ?2)
         ORDER BY created_at DESC, seq DESC, id ASC LIMIT 2",
    )?;
    for hit in &mut hits {
        if hit.message_count == 0 {
            continue;
        }
        hit.matches = snippets
            .query_map(params![hit.session.id, query], |row| {
                Ok(MessageMatch {
                    message_id: row.get(0)?,
                    role: row.get(1)?,
                    created_at: ms_to_ts(row.get(2)?),
                    snippet: sentence_excerpt(&row.get::<_, String>(3)?, query, 180),
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
    }
    Ok(SearchPage { hits, next_offset })
}

/// Map lowercase expansion offsets back to original Unicode characters.
fn match_range(text: &str, query: &str) -> Option<(usize, usize)> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return None;
    }
    let hit = text.to_lowercase().find(&needle)?;
    let mut folded_offset = 0;
    let mut position = 0;
    let mut found_start = false;
    for (index, ch) in text.chars().enumerate() {
        let next = folded_offset + ch.to_lowercase().map(char::len_utf8).sum::<usize>();
        if !found_start && next > hit {
            position = index;
            found_start = true;
        }
        if next >= hit + needle.len() {
            return Some((position, index + 1));
        }
        folded_offset = next;
    }
    None
}

/// Return the sentence or line containing the match. Long sentences retain a
/// bounded window around the complete query, rather than adjacent sentences.
fn sentence_excerpt(text: &str, query: &str, budget: usize) -> String {
    let Some((position, match_end)) = match_range(text, query) else {
        return excerpt(text, query, budget);
    };
    let chars: Vec<char> = text.chars().collect();
    let is_closing = |ch: char| matches!(ch, '"' | '\'' | '”' | '’' | '」' | '』' | ')' | '）');
    let mut start = 0;
    let mut end = chars.len();
    let mut index = 0;
    while index < chars.len() {
        let ch = chars[index];
        let newline = matches!(ch, '\n' | '\r' | '\u{2028}' | '\u{2029}');
        let boundary = newline
            || matches!(ch, '。' | '！' | '？' | '!' | '?')
            || (ch == '.'
                && chars
                    .get(index + 1)
                    .is_none_or(|next| next.is_whitespace() || is_closing(*next)));
        index += 1;
        if !boundary {
            continue;
        }
        if !newline {
            while index < chars.len()
                && (is_closing(chars[index])
                    || matches!(chars[index], '.' | '!' | '?' | '。' | '！' | '？'))
            {
                index += 1;
            }
        }
        if index <= position {
            start = index;
        } else if index >= match_end {
            end = index;
            break;
        }
    }
    let sentence: String = chars[start..end].iter().collect();
    let sentence = sentence.trim();
    if sentence.chars().count() <= budget {
        sentence.to_owned()
    } else {
        excerpt(sentence, query, budget)
    }
}

/// Center a bounded excerpt on the literal match without splitting Unicode.
pub fn excerpt(text: &str, query: &str, budget: usize) -> String {
    let (position, match_end) = match_range(text, query).unwrap_or((0, 0));
    let total = text.chars().count();
    let start = position.saturating_sub(budget / 3);
    let end = (start + budget).max(match_end).min(total);
    format!(
        "{}{}{}",
        if start > 0 { "…" } else { "" },
        text.chars()
            .skip(start)
            .take(end - start)
            .collect::<String>(),
        if end < total { "…" } else { "" }
    )
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextMessage {
    pub id: String,
    pub role: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchContext {
    pub messages: Vec<ContextMessage>,
    pub has_more_before: bool,
    pub has_more_after: bool,
    pub previous_match_id: Option<String>,
    pub next_match_id: Option<String>,
}

