use anyhow::{bail, Result};
use chrono::{Datelike, Local, TimeZone, Timelike};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Schedule {
    pub hour: u32,
    pub minute: u32,
    pub weekday: u32,
}

impl Schedule {
    pub fn validate(&self) -> Result<()> {
        if self.hour > 23 || self.minute > 59 || self.weekday > 6 {
            bail!("invalid schedule time or weekday");
        }
        Ok(())
    }

    pub fn next(&self, cadence: &str, after: i64) -> Option<i64> {
        if self.validate().is_err() { return None; }
        if cadence == "hourly" { return after.checked_add(3_600_000); }
        if !matches!(cadence, "daily" | "weekly") { return None; }
        let first = after.div_euclid(60_000).checked_add(1)?.checked_mul(60_000)?;
        let current = Local.timestamp_millis_opt(after).single()?;
        let passed_today = (current.hour(), current.minute()) >= (self.hour, self.minute);
        for offset in 0..(8 * 24 * 60) {
            let timestamp = first.checked_add(offset * 60_000)?;
            let local = Local.timestamp_millis_opt(timestamp).single()?;
            if local.hour() == self.hour && local.minute() == self.minute
                && (!passed_today || local.date_naive() != current.date_naive())
                && (cadence != "weekly" || local.weekday().num_days_from_monday() == self.weekday)
            {
                return Some(timestamp);
            }
        }
        None
    }
}
