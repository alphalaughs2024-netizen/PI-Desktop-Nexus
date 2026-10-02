use super::*;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

const MAX_ACTIVE: usize = 8;
const MAX_SESSION_ACTIVE: usize = 4;
const MAX_RECORDS: usize = 128;
const LOG_BYTES: usize = 96 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    id: String,
    session_id: String,
    command: String,
    cwd: String,
    status: String,
    started_at: u64,
    completed_at: Option<u64>,
    exit_code: Option<i32>,
    error: Option<String>,
    #[serde(default)]
    preview_url: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    fn options(session: &str) -> BashExecutionOptions {
        let mut options = BashExecutionOptions::local(shell::default_shell_id().into(), None);
        options.session_id = session.into();
        options
    }
    #[tokio::test]
    async fn process_survives_start_return_and_is_isolated_until_stopped() {
        let dir = tempfile::tempdir().unwrap();
        let registry = Registry::open(dir.path()).unwrap();
        let command = if cfg!(windows) {
            "Write-Output 'ready'; Start-Sleep -Seconds 30"
        } else {
            "printf 'ready\\n'; sleep 30"
        };
        let result = registry
            .start(
                dir.path(),
                None,
                &json!({ "command": command }),
                options("a"),
            )
            .await
            .unwrap();
        let id = result["process"]["id"].as_str().unwrap();
        assert_eq!(result["process"]["status"], "running");
        assert_eq!(
            registry
                .read("b", &json!({ "id": id }))
                .await
                .unwrap_err()
                .0,
            "PROCESS_NOT_FOUND"
        );
        assert_eq!(
            registry.stop("b", id).await.unwrap_err().0,
            "PROCESS_NOT_FOUND"
        );
        let waited = registry
            .read("a", &json!({ "id": id, "waitMs": 100 }))
            .await
            .unwrap();
        assert_eq!(waited["timedOut"], true);
        assert_eq!(waited["process"]["status"], "running");
        assert_eq!(
            registry.stop("a", id).await.unwrap()["process"]["status"],
            "stopped"
        );
        assert_eq!(
            registry.stop("a", id).await.unwrap()["process"]["status"],
            "stopped"
        );
    }
    #[tokio::test]
    async fn actual_exit_and_output_are_observed_after_start_return() {
        let dir = tempfile::tempdir().unwrap();
        let registry = Registry::open(dir.path()).unwrap();
        let command = if cfg!(windows) {
            "Write-Output 'before-exit'; exit 7"
        } else {
            "printf 'before-exit\\n'; exit 7"
        };
        let result = registry
            .start(
                dir.path(),
                None,
                &json!({ "command": command }),
                options("a"),
            )
            .await
            .unwrap();
        let id = result["process"]["id"].as_str().unwrap();
        let exited = registry
            .read("a", &json!({ "id": id, "waitMs": 5000 }))
            .await
            .unwrap();
        assert_eq!(exited["process"]["status"], "failed");
        assert_eq!(exited["process"]["exitCode"], 7);
        assert!(exited["output"].to_string().contains("before-exit"));
        let reread = registry
            .read("a", &json!({ "id": id, "cursor": exited["nextCursor"] }))
            .await
            .unwrap();
        assert_eq!(reread["output"], json!([]));
    }
    #[tokio::test]
    async fn invalid_cwd_and_cancelled_admission_do_not_spawn() {
        let dir = tempfile::tempdir().unwrap();
        let registry = Registry::open(dir.path()).unwrap();
        assert!(registry
            .start(
                dir.path(),
                None,
                &json!({ "command": "echo no", "cwd": ".." }),
                options("a")
            )
            .await
            .is_err());
        let mut cancelled = options("a");
        let (_, receiver) = watch::channel(true);
        cancelled.cancellation = Some(receiver);
        assert_eq!(
            registry
                .start(
                    dir.path(),
                    None,
                    &json!({ "command": "echo no" }),
                    cancelled
                )
                .await
                .unwrap_err()
                .0,
            "TOOL_ABORTED"
        );
        assert_eq!(
            registry.read("a", &json!({})).await.unwrap()["processes"],
            json!([])
        );
    }
    #[tokio::test]
    async fn logs_are_bounded_and_recovery_never_adopts_or_replays() {
        let dir = tempfile::tempdir().unwrap();
        let registry = Registry::open(dir.path()).unwrap();
        let (stop, _) = watch::channel(false);
        registry.inner.lock().unwrap().entries.insert(
            "fixture".into(),
            Entry {
                record: Record {
                    id: "fixture".into(),
                    session_id: "a".into(),
                    command: "not replayed".into(),
                    cwd: dir.path().to_string_lossy().into(),
                    status: "running".into(),
                    started_at: now(),
                    completed_at: None,
                    exit_code: None,
                    error: None,
                    preview_url: None,
                },
                stop,
                log: VecDeque::new(),
                bytes: 0,
                cursor: 0,
            },
        );
        for _ in 0..40 {
            registry.append("fixture", OutputStream::Stdout, "x".repeat(8192));
        }
        let output = registry
            .read("a", &json!({ "id": "fixture" }))
            .await
            .unwrap();
        assert_eq!(output["outputDropped"], true);
        assert!(output["output"].to_string().len() <= LOG_BYTES + 100);
        registry.save(&registry.inner.lock().unwrap()).unwrap();
        let recovered = Registry::open(dir.path()).unwrap();
        let record = recovered
            .read("a", &json!({ "id": "fixture" }))
            .await
            .unwrap();
        assert_eq!(record["process"]["status"], "interrupted");
        assert_eq!(record["logsAvailable"], false);
        assert_eq!(record["process"]["exitCode"], Value::Null);
    }
    #[tokio::test]
    async fn shutdown_closes_admission_and_reaps_running_work() {
        let dir = tempfile::tempdir().unwrap();
        let registry = Registry::open(dir.path()).unwrap();
        let command = if cfg!(windows) {
            "Start-Sleep -Seconds 30"
        } else {
            "sleep 30"
        };
        let result = registry
            .start(
                dir.path(),
                None,
                &json!({ "command": command }),
                options("a"),
            )
            .await
            .unwrap();
        registry.shutdown();
        registry.drain().await;
        assert_eq!(
            registry
                .read("a", &json!({ "id": result["process"]["id"] }))
                .await
                .unwrap()["process"]["status"],
            "stopped"
        );
        assert_eq!(
            registry
                .start(
                    dir.path(),
                    None,
                    &json!({ "command": "echo no" }),
                    options("a")
                )
                .await
                .unwrap_err()
                .0,
            "PROCESS_CAPACITY"
        );
    }
}
struct Entry {
    record: Record,
    stop: watch::Sender<bool>,
    log: VecDeque<Value>,
    bytes: usize,
    cursor: u64,
}
struct Inner {
    entries: HashMap<String, Entry>,
    closed: bool,
}
#[derive(Clone)]
pub struct Registry {
    inner: Arc<Mutex<Inner>>,
    path: PathBuf,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn active(record: &Record) -> bool {
    matches!(record.status.as_str(), "starting" | "running" | "stopping")
}
impl Registry {
    pub fn open(data_dir: &Path) -> Result<Self> {
        let path = data_dir.join("managed-processes.json");
        let records: Vec<Record> = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes)?,
            Err(error) if error.kind() == ErrorKind::NotFound => Vec::new(),
            Err(error) => return Err(error.into()),
        };
        let mut entries = HashMap::new();
        for mut record in records.into_iter().take(MAX_RECORDS) {
            if active(&record) {
                record.status = "interrupted".into();
                record.completed_at = Some(now());
                record.error = Some(
                    "Previous host is unavailable; process was not adopted or replayed.".into(),
                );
            }
            let (stop, _) = watch::channel(false);
            entries.insert(
                record.id.clone(),
                Entry {
                    record,
                    stop,
                    log: VecDeque::new(),
                    bytes: 0,
                    cursor: 0,
                },
            );
        }
        let registry = Self {
            inner: Arc::new(Mutex::new(Inner {
                entries,
                closed: false,
            })),
            path,
        };
        registry.save(&registry.inner.lock().unwrap())?;
        Ok(registry)
    }
    fn save(&self, inner: &Inner) -> Result<()> {
        let records: Vec<&Record> = inner.entries.values().map(|entry| &entry.record).collect();
        let temporary = self.path.with_extension("json.tmp");
        std::fs::write(&temporary, serde_json::to_vec(&records)?)?;
        std::fs::rename(temporary, &self.path)?;
        Ok(())
    }
    fn finish(&self, id: &str, status: &str, exit_code: Option<i32>, error: Option<String>) {
        let mut inner = self.inner.lock().unwrap();
        if let Some(entry) = inner.entries.get_mut(id) {
            entry.record.status = status.into();
            entry.record.completed_at = Some(now());
            entry.record.exit_code = exit_code;
            entry.record.error = error;
        }
        if let Err(error) = self.save(&inner) {
            tracing::error!(%error, "managed process state could not be saved");
        }
    }
    fn append(&self, id: &str, stream: OutputStream, text: String) {
        if text.is_empty() {
            return;
        }
        let mut inner = self.inner.lock().unwrap();
        if let Some(entry) = inner.entries.get_mut(id) {
            entry.cursor += 1;
            let value = json!({ "cursor": entry.cursor, "stream": stream.as_str(), "text": text });
            entry.bytes += value.to_string().len();
            entry.log.push_back(value);
            while entry.bytes > LOG_BYTES {
                if let Some(old) = entry.log.pop_front() {
                    entry.bytes -= old.to_string().len();
                }
            }
        }
    }
    pub fn shutdown(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.closed = true;
        for entry in inner.entries.values() {
            if active(&entry.record) {
                let _ = entry.stop.send(true);
            }
        }
    }
    pub async fn stop_session(&self, session_id: &str) -> Result<Value, (String, String)> {
        let ids: Vec<String> = {
            let inner = self.inner.lock().unwrap();
            inner
                .entries
                .values()
                .filter(|entry| entry.record.session_id == session_id && active(&entry.record))
                .map(|entry| entry.record.id.clone())
                .collect()
        };
        {
            let inner = self.inner.lock().unwrap();
            for id in &ids {
                let _ = inner.entries[id].stop.send(true);
            }
        }
        for id in &ids {
            self.stop(session_id, id).await?;
        }
        Ok(json!({ "stopped": ids }))
    }
    pub async fn drain(&self) {
        for _ in 0..100 {
            if !self
                .inner
                .lock()
                .unwrap()
                .entries
                .values()
                .any(|entry| active(&entry.record))
            {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        tracing::error!("managed process shutdown did not settle within five seconds");
    }
    pub async fn stop(&self, session_id: &str, id: &str) -> Result<Value, (String, String)> {
        {
            let mut inner = self.inner.lock().unwrap();
            let entry = inner
                .entries
                .get_mut(id)
                .filter(|entry| entry.record.session_id == session_id)
                .ok_or_else(|| {
                    (
                        "PROCESS_NOT_FOUND".into(),
                        "No such process belongs to this session.".into(),
                    )
                })?;
            if active(&entry.record) {
                entry.record.status = "stopping".into();
                let _ = entry.stop.send(true);
            }
        }
        let result = self
            .read(session_id, &json!({ "id": id, "waitMs": 5000 }))
            .await?;
        if result["timedOut"] == true {
            return Err((
                "PROCESS_STOP_PENDING".into(),
                "Stop is requested but process exit is not yet confirmed; inspect the same handle."
                    .into(),
            ));
        }
        Ok(result)
    }
    pub async fn read(&self, session_id: &str, args: &Value) -> Result<Value, (String, String)> {
        let id = args.get("id").and_then(Value::as_str);
        let cursor = args.get("cursor").and_then(Value::as_u64).unwrap_or(0);
        let wait_ms = args
            .get("waitMs")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            .min(30_000);
        let deadline = Instant::now() + Duration::from_millis(wait_ms);
        loop {
            {
                let inner = self.inner.lock().unwrap();
                if let Some(id) = id {
                    let entry = inner
                        .entries
                        .get(id)
                        .filter(|entry| entry.record.session_id == session_id)
                        .ok_or_else(|| {
                            (
                                "PROCESS_NOT_FOUND".into(),
                                "No such process belongs to this session.".into(),
                            )
                        })?;
                    if !active(&entry.record) || Instant::now() >= deadline {
                        return Ok(
                            json!({ "process": entry.record, "output": entry.log.iter().filter(|event| event["cursor"].as_u64().unwrap_or(0) > cursor).collect::<Vec<_>>(),
                            "nextCursor": entry.cursor, "outputDropped": entry.log.front().is_some_and(|event| event["cursor"].as_u64().unwrap_or(0) > cursor.saturating_add(1)),
                            "logsAvailable": entry.cursor > 0, "timedOut": active(&entry.record) && wait_ms > 0 }),
                        );
                    }
                } else {
                    let mut processes: Vec<&Record> = inner
                        .entries
                        .values()
                        .filter(|entry| entry.record.session_id == session_id)
                        .map(|entry| &entry.record)
                        .collect();
                    processes.sort_by_key(|record| record.started_at);
                    return Ok(json!({ "processes": processes }));
                }
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }
    pub async fn start(
        &self,
        workspace: &Path,
        scratch: Option<&Path>,
        args: &Value,
        options: BashExecutionOptions,
    ) -> Result<Value, (String, String)> {
        let command = args
            .get("command")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty() && value.len() <= 16 * 1024)
            .ok_or_else(|| {
                (
                    "INVALID_ARGUMENT".into(),
                    "command is required and must be at most 16KB.".into(),
                )
            })?;
        let cwd = args.get("cwd").and_then(Value::as_str).unwrap_or(".");
        let root = simple_canonicalize(workspace)
            .map_err(|error| ("INVALID_ARGUMENT".into(), error.to_string()))?;
        let cwd = simple_canonicalize(&workspace.join(cwd))
            .map_err(|error| ("INVALID_ARGUMENT".into(), error.to_string()))?;
        if !cwd.starts_with(&root) || !cwd.is_dir() {
            return Err((
                "INVALID_ARGUMENT".into(),
                "cwd must be a directory inside this session workspace.".into(),
            ));
        }
        let resolved = shell::resolve_shell(&options.command_shell_id)
            .map_err(|error| ("SHELL_NOT_FOUND".into(), error))?;
        let invocation = shell::build_invocation_for_platform(
            shell::current_platform(),
            &options.command_shell_id,
            resolved.program,
            command,
        )
        .map_err(|error| ("INVALID_ARGUMENT".into(), error))?;
        if options
            .cancellation
            .as_ref()
            .is_some_and(|signal| *signal.borrow())
        {
            return Err(("TOOL_ABORTED".into(), "Process start was cancelled.".into()));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let (stop, mut cancellation) = watch::channel(false);
        {
            let mut inner = self.inner.lock().unwrap();
            let count = inner
                .entries
                .values()
                .filter(|entry| active(&entry.record))
                .count();
            let session_count = inner
                .entries
                .values()
                .filter(|entry| {
                    entry.record.session_id == options.session_id && active(&entry.record)
                })
                .count();
            if inner.closed || count >= MAX_ACTIVE || session_count >= MAX_SESSION_ACTIVE {
                return Err((
                    "PROCESS_CAPACITY".into(),
                    "Managed process capacity is unavailable; inspect or stop an existing process."
                        .into(),
                ));
            }
            if inner.entries.len() >= MAX_RECORDS {
                if let Some(oldest) = inner
                    .entries
                    .values()
                    .filter(|entry| !active(&entry.record))
                    .min_by_key(|entry| entry.record.started_at)
                    .map(|entry| entry.record.id.clone())
                {
                    inner.entries.remove(&oldest);
                }
            }
            let preview_url = args
                .get("previewUrl")
                .and_then(Value::as_str)
                .filter(|value| value.len() <= 2048)
                .map(str::to_string);
            if let Some(url) = preview_url.as_deref() {
                let authority = url.split('/').nth(2);
                if inner.entries.values().any(|entry| active(&entry.record) && entry.record.preview_url.as_deref().is_some_and(|existing| existing.split('/').nth(2) == authority)) {
                    return Err(("PREVIEW_PORT_IN_USE".into(), "An active managed preview already owns this address; inspect or stop it before starting another.".into()));
                }
            }
            inner.entries.insert(
                id.clone(),
                Entry {
                    record: Record {
                        id: id.clone(),
                        session_id: options.session_id.clone(),
                        command: command.into(),
                        cwd: cwd.to_string_lossy().into(),
                        status: "starting".into(),
                        started_at: now(),
                        completed_at: None,
                        exit_code: None,
                        error: None,
                        preview_url,
                    },
                    stop,
                    log: VecDeque::new(),
                    bytes: 0,
                    cursor: 0,
                },
            );
            if let Err(error) = self.save(&inner) {
                inner.entries.remove(&id);
                return Err(("PROCESS_STORAGE_FAILED".into(), error.to_string()));
            }
        }
        let spawned = spawn_tool_runner(&ToolRunnerStartConfig {
            program: invocation.program,
            args: invocation.args,
            workspace: cwd,
            scratch_dir: scratch.map(Path::to_path_buf),
            env_path: shell::user_login_path().map(str::to_string),
        })
        .await;
        let runner = match spawned {
            Ok(runner) => runner,
            Err(error) => {
                self.finish(&id, "failed", None, Some(error.1.clone()));
                return Err(error);
            }
        };
        let storage_failed = {
            let mut inner = self.inner.lock().unwrap();
            let entry = inner.entries.get_mut(&id).unwrap();
            if entry.record.status == "starting" {
                entry.record.status = "running".into();
            }
            if let Err(error) = self.save(&inner) {
                tracing::error!(%error, "managed process launch state could not be saved");
                let _ = inner.entries[&id].stop.send(true);
                true
            } else {
                false
            }
        };
        let registry = self.clone();
        let owned_id = id.clone();
        tokio::spawn(async move {
            let SpawnedToolRunner {
                pid,
                mut ownership,
                mut control,
                stdout,
                stderr,
                mut wait_task,
            } = runner;
            let (chunk_tx, mut output_rx) = mpsc::channel(OUTPUT_CHANNEL_CAPACITY);
            let stdout_task =
                tokio::spawn(read_pipe(stdout, OutputStream::Stdout, chunk_tx.clone()));
            let stderr_task =
                tokio::spawn(read_pipe(stderr, OutputStream::Stderr, chunk_tx.clone()));
            drop(chunk_tx);
            let mut out_decoder = Utf8Decoder::default();
            let mut err_decoder = Utf8Decoder::default();
            let mut append = |chunk: OutputChunk| {
                let text = match chunk.stream {
                    OutputStream::Stdout => out_decoder.push(&chunk.bytes),
                    OutputStream::Stderr => err_decoder.push(&chunk.bytes),
                };
                registry.append(&owned_id, chunk.stream, text);
            };
            let result = loop {
                tokio::select! {
                    biased;
                    _ = async { if !*cancellation.borrow() { let _ = cancellation.changed().await; } } => {
                        let result = kill_and_reap(pid, &mut ownership, &mut control, &mut wait_task).await;
                        break result.map(|_| ("stopped", None)).map_err(|error| error.to_string());
                    }
                    waited = &mut wait_task => break match waited {
                        Ok(Ok(status)) => Ok((if status.success() { "exited" } else { "failed" }, status.code())),
                        other => Err(format!("Process wait failed: {other:?}")),
                    },
                    Some(chunk) = output_rx.recv() => append(chunk),
                }
            };
            control.take();
            let _ = terminate_runner_tree(pid, &mut ownership);
            let drain = async {
                while let Some(chunk) = output_rx.recv().await {
                    append(chunk);
                }
            };
            if tokio::time::timeout(PIPE_DRAIN_TIMEOUT, drain)
                .await
                .is_err()
            {
                stdout_task.abort();
                stderr_task.abort();
            }
            let _ = stdout_task.await;
            let _ = stderr_task.await;
            registry.append(&owned_id, OutputStream::Stdout, out_decoder.finish());
            registry.append(&owned_id, OutputStream::Stderr, err_decoder.finish());
            match result {
                Ok((status, code)) => registry.finish(&owned_id, status, code, None),
                Err(error) => registry.finish(&owned_id, "failed", None, Some(error)),
            }
        });
        if storage_failed
            || options
                .cancellation
                .as_ref()
                .is_some_and(|signal| *signal.borrow())
        {
            let _ = self.stop(&options.session_id, &id).await;
            if storage_failed {
                return Err((
                    "PROCESS_STORAGE_FAILED".into(),
                    "Launch state could not be saved; the owned process was stopped.".into(),
                ));
            }
            return Err((
                "TOOL_ABORTED".into(),
                "Process start was cancelled and its owned process stopped.".into(),
            ));
        }
        self.read(&options.session_id, &json!({ "id": id })).await
    }
}
