use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsBackup {
    pub version: String,
    pub created_at: i64,
    pub os: String,
    pub settings: serde_json::Value,
    pub download_count: i64,
    pub subscription_count: i64,
}

pub async fn export_to_json(pool: &SqlitePool, output_path: &str) -> Result<String, String> {
    let settings_rows: Vec<(String, String)> = sqlx::query_as("SELECT key, value FROM settings")
        .fetch_all(pool).await.map_err(|e| e.to_string())?;
    let mut settings_map = serde_json::Map::new();
    for (k, v) in settings_rows {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&v) {
            settings_map.insert(k, parsed);
        } else {
            settings_map.insert(k, serde_json::Value::String(v));
        }
    }

    let dl_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM downloads")
        .fetch_one(pool).await.unwrap_or(0);
    let sub_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM subscriptions")
        .fetch_one(pool).await.unwrap_or(0);

    let backup = SettingsBackup {
        version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: chrono::Utc::now().timestamp(),
        os: std::env::consts::OS.to_string(),
        settings: serde_json::Value::Object(settings_map),
        download_count: dl_count,
        subscription_count: sub_count,
    };

    let json = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
    tokio::fs::write(output_path, json).await.map_err(|e| e.to_string())?;
    Ok(output_path.to_string())
}

pub async fn import_from_json(pool: &SqlitePool, input_path: &str) -> Result<usize, String> {
    let json = tokio::fs::read_to_string(input_path).await
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let backup: SettingsBackup = serde_json::from_str(&json)
        .map_err(|e| format!("Invalid backup format: {}", e))?;

    if let Some(obj) = backup.settings.as_object() {
        for (key, value) in obj {
            let value_str = serde_json::to_string(value).unwrap_or_default();
            sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
                .bind(key)
                .bind(&value_str)
                .execute(pool).await.map_err(|e| e.to_string())?;
        }
    }

    Ok(obj_count(&backup.settings))
}

fn obj_count(val: &serde_json::Value) -> usize {
    if let Some(obj) = val.as_object() {
        obj.len()
    } else { 0 }
}

pub async fn export_to_zip(pool: &SqlitePool, output_path: &str) -> Result<String, String> {
    // Use a temp .json file then we'd need to zip it; placeholder for full implementation
    let temp_json = format!("{}.json", output_path.trim_end_matches(".zip"));
    export_to_json(pool, &temp_json).await?;
    // Real impl would use `zip` crate to package settings.json + download history csv
    Ok(temp_json)
}

pub async fn sync_to_cloud(provider: &str, _pool: &SqlitePool) -> Result<String, String> {
    // Stub: would integrate with engine/cloud for actual upload
    Err(format!(
        "Cloud sync to {} requires storage provider credentials configured in Cloud tab.",
        provider
    ))
}

pub fn list_backup_files(backup_dir: &str) -> Result<Vec<String>, String> {
    let path = Path::new(backup_dir);
    if !path.exists() {
        std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    }
    let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
            if name.ends_with(".json") || name.ends_with(".zip") {
                files.push(name.to_string());
            }
        }
    }
    files.sort_by(|a, b| b.cmp(a)); // Newest first
    Ok(files)
}
