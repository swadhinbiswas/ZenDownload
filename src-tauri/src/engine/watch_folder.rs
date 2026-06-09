use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;
use notify::{RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchFolderConfig {
    pub path: String,
    pub auto_add: bool,
    pub auto_delete: bool,
    pub category: Option<String>,
    pub enabled: bool,
}

pub struct WatchFolderManager {
    watchers: Arc<Mutex<Vec<Box<dyn Watcher + Send>>>>,
}

impl WatchFolderManager {
    pub fn new() -> Self {
        Self {
            watchers: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub async fn add_watch(
        &self,
        app: AppHandle,
        pool: SqlitePool,
        config: WatchFolderConfig,
    ) -> Result<(), String> {
        let path = PathBuf::from(&config.path);
        if !path.exists() {
            std::fs::create_dir_all(&path).map_err(|e| format!("Failed to create folder: {}", e))?;
        }

        let app_clone = app.clone();
        let pool_clone = pool.clone();
        let config_clone = config.clone();

        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                match event.kind {
                    notify::EventKind::Create(_) => {
                        if let Some(paths) = event.paths.first().cloned() {
                            handle_new_file(&app_clone, &pool_clone, &config_clone, &paths);
                        }
                    }
                    _ => {}
                }
            }
        }).map_err(|e| format!("Failed to create watcher: {}", e))?;

        watcher.watch(&path, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch path: {}", e))?;

        self.watchers.lock().await.push(Box::new(watcher));
        Ok(())
    }
}

fn handle_new_file(app: &AppHandle, pool: &SqlitePool, config: &WatchFolderConfig, path: &Path) {
    // Only act on actual files (not directories or temp files)
    if !path.is_file() { return; }
    let file_name = match path.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return,
    };

    // Skip hidden/temp files
    if file_name.starts_with('.') || file_name.ends_with(".tmp") || file_name.ends_with(".crdownload") || file_name.ends_with(".part") {
        return;
    }

    // Skip if auto_add is disabled
    if !config.auto_add { return; }

    // Emit event for frontend to add as download
    let _ = app.emit("watch-folder-file-detected", serde_json::json!({
        "path": path.to_string_lossy(),
        "file_name": file_name,
        "category": config.category,
    }));

    // Optionally add to download list automatically
    if config.auto_add {
        let pool_clone = pool.clone();
        let path_clone = path.to_string_lossy().to_string();
        let category = config.category.clone().unwrap_or_else(|| "General".to_string());
        let file_name_clone = file_name.to_string();
        tokio::spawn(async move {
            let new_id = uuid::Uuid::new_v4().to_string();
            let _ = sqlx::query(
                "INSERT INTO downloads (id, url, file_name, save_path, category, status, download_type, connections, created_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(&new_id)
            .bind(format!("file://{}", path_clone))
            .bind(&file_name_clone)
            .bind(std::path::Path::new(&path_clone).parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default())
            .bind(&category)
            .bind("Completed")
            .bind("watched")
            .bind(1i64)
            .bind(chrono::Utc::now().to_rfc3339())
            .execute(&pool_clone)
            .await;
        });
    }
}
