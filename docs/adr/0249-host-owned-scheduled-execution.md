# ADR 0249: Host-owned scheduled execution

## Decision

The Rust host owns task settings, due admission, overlap checks, missed-run history, and the next run time. Electron polls while Nexus is open and starts admitted runs through the normal durable prompt path. The Scheduled page only edits tasks and shows status; opening it is not required for execution.

Daily and weekly times use the computer's current local time zone. Hourly runs use elapsed time. A due occurrence older than 90 seconds is recorded as missed and never executed later. Missed rows retain the latest 50 occurrences per task; `olderMissedCount` accounts for removed rows. The run row carries `scheduledAt` separately from `startedAt`.

Schema v18 adds `task_runs.scheduled_at`. Its migration disables existing recurring tasks and marks them for review. A recurring task is armed only after a project choice (including explicit no project), provider, model, permission mode, and valid schedule are saved. Unattended Plan/Goal tasks are rejected. Unavailable projects and models surface explicit error codes and failed run records.

An optional `keepAwakeDuringWork` setting requests Electron's app-suspension blocker only while an agent or scheduled turn is active. The setting never keeps an idle computer awake.

## Consequences

The host remains the sole persistence owner. Desktop restarts may miss occurrences but do not create catch-up bursts. Renderer state can be discarded without losing a schedule or a run record.
