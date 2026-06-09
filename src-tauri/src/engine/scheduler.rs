use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use chrono::{DateTime, Utc, Datelike, Timelike, Weekday};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledTask {
    pub id: String,
    pub download_id: Option<String>,
    pub url: Option<String>,
    pub start_at: DateTime<Utc>,
    pub end_at: Option<DateTime<Utc>>,
    pub action: String, // "start", "pause", "resume", "stop"
    pub repeat: Option<String>, // "once", "daily", "weekly", "monthly"
    pub bandwidth_limit_kbps: Option<u64>,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BandwidthProfile {
    pub name: String,
    pub enabled: bool,
    pub rules: Vec<BandwidthRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BandwidthRule {
    pub day_of_week: Option<u8>, // 0=Sunday, 6=Saturday
    pub start_hour: u8,
    pub end_hour: u8,
    pub limit_kbps: u64,
}

pub async fn add_scheduled_task(pool: &SqlitePool, task: &ScheduledTask) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO scheduled_tasks (id, download_id, url, start_at, end_at, action, repeat, bandwidth_limit_kbps, enabled, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&task.id)
    .bind(&task.download_id)
    .bind(&task.url)
    .bind(task.start_at.to_rfc3339())
    .bind(task.end_at.as_ref().map(|d| d.to_rfc3339()))
    .bind(&task.action)
    .bind(&task.repeat)
    .bind(task.bandwidth_limit_kbps.map(|v| v as i64))
    .bind(task.enabled as i64)
    .bind(task.created_at.to_rfc3339())
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_pending_tasks(pool: &SqlitePool) -> Result<Vec<ScheduledTask>, String> {
    let now = Utc::now();
    let rows: Vec<(String, Option<String>, Option<String>, String, Option<String>, String, Option<String>, Option<i64>, i64, String)> =
        sqlx::query_as(
            "SELECT id, download_id, url, start_at, end_at, action, repeat, bandwidth_limit_kbps, enabled, created_at FROM scheduled_tasks WHERE enabled = 1 AND start_at <= ?"
        )
        .bind(now.to_rfc3339())
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for row in rows {
        tasks.push(ScheduledTask {
            id: row.0,
            download_id: row.1,
            url: row.2,
            start_at: row.3.parse().unwrap_or_else(|_| Utc::now()),
            end_at: row.4.and_then(|d| d.parse().ok()),
            action: row.5,
            repeat: row.6,
            bandwidth_limit_kbps: row.7.map(|v| v as u64),
            enabled: row.8 != 0,
            created_at: row.9.parse().unwrap_or_else(|_| Utc::now()),
        });
    }
    Ok(tasks)
}

pub async fn delete_scheduled_task(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM scheduled_tasks WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn current_bandwidth_limit(profile: &BandwidthProfile) -> Option<u64> {
    if !profile.enabled { return None; }
    let now = Utc::now();
    let weekday = now.weekday();
    let weekday_num = match weekday {
        Weekday::Sun => 0, Weekday::Mon => 1, Weekday::Tue => 2,
        Weekday::Wed => 3, Weekday::Thu => 4, Weekday::Fri => 5,
        Weekday::Sat => 6,
    };
    let hour = now.hour() as u8;

    profile.rules.iter()
        .filter(|rule| {
            rule.day_of_week.map(|d| d == weekday_num).unwrap_or(true)
                && hour >= rule.start_hour
                && hour < rule.end_hour
        })
        .map(|r| r.limit_kbps)
        .max()
}

/// Background worker that processes scheduled tasks
pub async fn start_scheduler_worker(pool: SqlitePool) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
    loop {
        interval.tick().await;
        let tasks = match get_pending_tasks(&pool).await {
            Ok(t) => t,
            Err(_) => continue,
        };
        for task in tasks {
            execute_scheduled_action(&pool, &task).await;
            // Disable single-shot tasks after execution
            if task.repeat.as_deref() != Some("daily")
                && task.repeat.as_deref() != Some("weekly")
                && task.repeat.as_deref() != Some("monthly")
            {
                let _ = sqlx::query("UPDATE scheduled_tasks SET enabled = 0 WHERE id = ?")
                    .bind(&task.id)
                    .execute(&pool)
                    .await;
            } else {
                // Compute next occurrence
                let next = next_occurrence(&task);
                let _ = sqlx::query("UPDATE scheduled_tasks SET start_at = ? WHERE id = ?")
                    .bind(next.to_rfc3339())
                    .bind(&task.id)
                    .execute(&pool)
                    .await;
            }
        }
    }
}

async fn execute_scheduled_action(pool: &SqlitePool, task: &ScheduledTask) {
    if let Some(download_id) = &task.download_id {
        match task.action.as_str() {
            "start" | "resume" => {
                let _ = sqlx::query("UPDATE downloads SET status = 'Downloading' WHERE id = ?")
                    .bind(download_id)
                    .execute(pool)
                    .await;
            }
            "pause" => {
                let _ = sqlx::query("UPDATE downloads SET status = 'Paused' WHERE id = ?")
                    .bind(download_id)
                    .execute(pool)
                    .await;
            }
            "stop" | "cancel" => {
                let _ = sqlx::query("UPDATE downloads SET status = 'Error' WHERE id = ?")
                    .bind(download_id)
                    .execute(pool)
                    .await;
            }
            _ => {}
        }
    }
}

fn next_occurrence(task: &ScheduledTask) -> DateTime<Utc> {
    let now = Utc::now();
    match task.repeat.as_deref() {
        Some("daily") => now + chrono::Duration::days(1),
        Some("weekly") => now + chrono::Duration::weeks(1),
        Some("monthly") => now + chrono::Duration::days(30),
        _ => now,
    }
}
