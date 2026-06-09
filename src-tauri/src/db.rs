use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite, FromRow};
use std::fs;
use tauri::Manager;
use serde::{Serialize, Deserialize};
use sqlx::Row;
use std::collections::HashSet;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct DownloadRecord {
    pub id: String,
    pub url: String,
    pub file_name: String,
    pub save_path: String,
    pub category: Option<String>,
    pub total_size: Option<i64>,
    pub downloaded: i64,
    pub status: String,
    pub download_type: String,
    pub connections: i64,
    pub speed_limit: i64,
    pub priority: i64,
    pub queue_id: Option<String>,
    pub extra_meta: Option<String>,
    pub error_msg: Option<String>,
    pub retry_count: i64,
    pub thumbnail: Option<String>,
    pub title: Option<String>,
    pub resolution: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

pub async fn init_db(app_handle: &tauri::AppHandle) -> Result<Pool<Sqlite>, Box<dyn std::error::Error>> {
    let app_dir = app_handle.path().app_data_dir().expect("Failed to get app data dir");
    fs::create_dir_all(&app_dir)?;
    
    let db_path = app_dir.join("zendownload.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.to_str().unwrap());
    
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url).await?;
        
    // Create new universal schema tables
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS downloads (
            id              TEXT PRIMARY KEY,
            url             TEXT NOT NULL,
            file_name       TEXT NOT NULL,
            save_path       TEXT NOT NULL,
            category        TEXT DEFAULT 'Other',
            total_size      INTEGER,
            downloaded      INTEGER DEFAULT 0,
            status          TEXT DEFAULT 'pending',
            download_type   TEXT DEFAULT 'http',
            connections     INTEGER DEFAULT 8,
            speed_limit     INTEGER DEFAULT 0,
            priority        INTEGER DEFAULT 1,
            queue_id        TEXT,
            checksum        TEXT,
            checksum_type   TEXT,
            extra_meta      TEXT,
            error_msg       TEXT,
            retry_count     INTEGER DEFAULT 0,
            thumbnail       TEXT,
            created_at      TEXT NOT NULL,
            started_at      TEXT,
            completed_at    TEXT
        );"
    ).execute(&pool).await?;

    // Migration: add thumbnail column if missing
    let _ = sqlx::query("ALTER TABLE downloads ADD COLUMN thumbnail TEXT")
        .execute(&pool).await;

    // Migration: add title + resolution columns if missing
    let _ = sqlx::query("ALTER TABLE downloads ADD COLUMN title TEXT")
        .execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE downloads ADD COLUMN resolution TEXT")
        .execute(&pool).await;

    // One-time cleanup: remove `#fragment` markers that leaked into
    // save_path/file_name/url from old versions of the URL parser.
    // The `#` is technically a valid path character on Linux but in this
    // app it almost always means a leaked URL fragment.
    let _ = sqlx::query(
        "UPDATE downloads SET save_path = substr(save_path, 1, instr(save_path, '#') - 1)
         WHERE instr(save_path, '#') > 0"
    ).execute(&pool).await;
    let _ = sqlx::query(
        "UPDATE downloads SET save_path = rtrim(save_path, '/')
         WHERE length(save_path) > 1 AND substr(save_path, length(save_path)) = '/'"
    ).execute(&pool).await;
    let _ = sqlx::query(
        "UPDATE downloads SET file_name = substr(file_name, 1, instr(file_name, '#') - 1)
         WHERE instr(file_name, '#') > 0"
    ).execute(&pool).await;
    let _ = sqlx::query(
        "UPDATE downloads SET url = substr(url, 1, instr(url, '#') - 1)
         WHERE instr(url, '#') > 0 AND url NOT LIKE 'magnet:%'"
    ).execute(&pool).await;

    // Also clean the history table (it mirrors downloads)
    let _ = sqlx::query(
        "UPDATE history SET save_path = substr(save_path, 1, instr(save_path, '#') - 1)
         WHERE instr(save_path, '#') > 0"
    ).execute(&pool).await;
    let _ = sqlx::query(
        "UPDATE history SET save_path = rtrim(save_path, '/')
         WHERE length(save_path) > 1 AND substr(save_path, length(save_path)) = '/'"
    ).execute(&pool).await;
    let _ = sqlx::query(
        "UPDATE history SET file_name = substr(file_name, 1, instr(file_name, '#') - 1)
         WHERE instr(file_name, '#') > 0"
    ).execute(&pool).await;
    let _ = sqlx::query(
        "UPDATE history SET url = substr(url, 1, instr(url, '#') - 1)
         WHERE instr(url, '#') > 0 AND url NOT LIKE 'magnet:%'"
    ).execute(&pool).await;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS segments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            download_id     TEXT NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
            seg_index       INTEGER NOT NULL,
            range_start     INTEGER NOT NULL,
            range_end       INTEGER NOT NULL,
            downloaded      INTEGER DEFAULT 0,
            status          TEXT DEFAULT 'pending',
            mirror_url      TEXT
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS mirrors (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            download_id     TEXT NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
            url             TEXT NOT NULL,
            priority        INTEGER DEFAULT 0,
            last_error      TEXT
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS queues (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            active          INTEGER DEFAULT 1,
            max_concurrent  INTEGER DEFAULT 3,
            speed_limit     INTEGER DEFAULT 0,
            start_time      TEXT,
            stop_time       TEXT,
            days            TEXT
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS credentials (
            id              TEXT PRIMARY KEY,
            service         TEXT NOT NULL,
            host            TEXT,
            username        TEXT,
            token_hint      TEXT
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS settings (
            key             TEXT PRIMARY KEY,
            value           TEXT NOT NULL
        );"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS history (
            id              TEXT PRIMARY KEY,
            download_id     TEXT,
            file_name       TEXT,
            save_path       TEXT,
            url             TEXT,
            total_size      INTEGER,
            completed_at    TEXT,
            category        TEXT
        );"
    ).execute(&pool).await?;
    
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS subscriptions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT,
            url             TEXT NOT NULL,
            sub_type        TEXT NOT NULL,
            enabled         INTEGER NOT NULL DEFAULT 1,
            interval_minutes INTEGER NOT NULL DEFAULT 60,
            include_keywords TEXT,
            exclude_keywords TEXT,
            category        TEXT DEFAULT 'General',
            last_checked    TEXT,
            last_error      TEXT
        );"
    ).execute(&pool).await?;

    ensure_subscription_schema(&pool).await?;

    // User custom IPTV playlists (per-country M3U URLs)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS user_playlists (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            url             TEXT NOT NULL,
            country_code    TEXT NOT NULL DEFAULT '',
            enabled         INTEGER NOT NULL DEFAULT 1,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );"
    ).execute(&pool).await?;

    Ok(pool)
}

async fn ensure_subscription_schema(pool: &Pool<Sqlite>) -> Result<(), Box<dyn std::error::Error>> {
    let rows = sqlx::query("PRAGMA table_info(subscriptions)").fetch_all(pool).await?;
    let existing: HashSet<String> = rows
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("name").ok())
        .collect();

    let columns = [
        ("name", "TEXT"),
        ("enabled", "INTEGER NOT NULL DEFAULT 1"),
        ("interval_minutes", "INTEGER NOT NULL DEFAULT 60"),
        ("include_keywords", "TEXT"),
        ("exclude_keywords", "TEXT"),
        ("category", "TEXT DEFAULT 'General'"),
        ("last_error", "TEXT"),
    ];

    for (column, definition) in columns {
        if !existing.contains(column) {
            let statement = format!("ALTER TABLE subscriptions ADD COLUMN {} {}", column, definition);
            sqlx::query(&statement).execute(pool).await?;
        }
    }

    Ok(())
}
