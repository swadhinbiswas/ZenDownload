use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionInfo {
    pub path: String,
    pub file_name: String,
    pub category: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct CompletionMeta {
    #[serde(rename = "cloudMirroringEnabled")]
    cloud_mirroring_enabled: Option<bool>,
    #[serde(rename = "cloudMirroringProvider")]
    cloud_mirroring_provider: Option<String>,
    #[serde(rename = "cloudAccessToken")]
    cloud_access_token: Option<String>,
    #[serde(rename = "cloudFolderId")]
    cloud_folder_id: Option<String>,
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

async fn maybe_mirror_completed_file(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    file_path: &str,
    meta: &CompletionMeta,
) {
    let runtime = crate::engine::runtime_settings::load_runtime_settings(pool).await;

    let enabled = meta
        .cloud_mirroring_enabled
        .unwrap_or(runtime.cloud_mirroring_enabled);
    if !enabled {
        return;
    }

    let provider = normalize_optional_string(meta.cloud_mirroring_provider.clone())
        .unwrap_or(runtime.cloud_mirroring_provider);
    let token = normalize_optional_string(meta.cloud_access_token.clone())
        .or(runtime.cloud_access_token);
    let folder_id = normalize_optional_string(meta.cloud_folder_id.clone())
        .or(runtime.cloud_folder_id)
        .unwrap_or_default();

    let Some(token) = token else {
        return;
    };

    if let Err(err) = crate::engine::cloud::CloudDriveEngine::upload_file_to_node(
        &provider,
        file_path,
        &folder_id,
        &token,
    ).await {
        eprintln!("Cloud mirroring failed for {}: {}", file_path, err);
    }
}

pub async fn finalize_completed_download(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    download_id: &str,
    input_path: &str,
    extra_meta: Option<&str>,
) -> Result<String, String> {
    let mut action = crate::engine::post_processor::PostProcessAction::None;
    let mut completion_meta = CompletionMeta::default();

    if let Some(meta_json) = extra_meta {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(meta_json) {
            if let Some(act) = val.get("postProcessAction").and_then(|v| v.as_str()) {
                match act {
                    "ConvertToMp4" => action = crate::engine::post_processor::PostProcessAction::ConvertToMp4,
                    "ExtractAudio" => action = crate::engine::post_processor::PostProcessAction::ExtractAudio,
                    "ExtractArchive" => action = crate::engine::post_processor::PostProcessAction::ExtractArchive,
                    _ => {}
                }
            }

            if let Ok(parsed) = serde_json::from_value::<CompletionMeta>(val) {
                completion_meta = parsed;
            }
        }
    }

    // Auto-detect archive formats if no explicit post-process action was set
    if matches!(action, crate::engine::post_processor::PostProcessAction::None) {
        let runtime = crate::engine::runtime_settings::load_runtime_settings(pool).await;
        if runtime.auto_extract_archives {
            let ext = Path::new(input_path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            match ext.as_str() {
                "zip" | "tar" | "gz" | "tgz" | "bz2" | "xz" | "7z" | "rar" => {
                    action = crate::engine::post_processor::PostProcessAction::ExtractArchive;
                }
                _ => {}
            }
        }
    }

    let mut final_path = match crate::engine::post_processor::run_post_processing(input_path, action).await {
        Ok(path) => path,
        Err(err) => {
            eprintln!("Post-processing failed for {}: {}", input_path, err);
            input_path.to_string()
        }
    };

    // Phase 1.5: Auto-conversion if enabled in settings
    {
        let runtime = crate::engine::runtime_settings::load_runtime_settings(pool).await;
        if runtime.auto_convert_enabled {
            if let Some(ref preset_id) = runtime.default_conversion_preset {
                let ext = Path::new(&final_path)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                // Don't convert if already in target format
                let preset = crate::engine::converter::get_preset_for_file(&final_path, preset_id);
                if let Some(p) = preset {
                    if p.output_ext != ext {
                        match crate::engine::converter::convert_file(&final_path, preset_id, download_id).await {
                            Ok(result) => {
                                if result.status == "Completed" {
                                    if let Some(ref out) = result.output_path {
                                        final_path = out.clone();
                                        println!("Converted {} → {}", input_path, out);
                                    }
                                } else if let Some(ref err) = result.error {
                                    eprintln!("Conversion failed for {}: {}", final_path, err);
                                }
                            }
                            Err(e) => eprintln!("Conversion error: {}", e),
                        }
                    }
                }
            }
        }
    }

    // Phase 2: Smart Sorting & AV Scan
    let runtime = crate::engine::runtime_settings::load_runtime_settings(pool).await;
    
    // Smart Sorting: Move to categorized folder if enabled
    if runtime.smart_sorting_enabled {
        let category = sqlx::query_scalar::<_, String>("SELECT category FROM downloads WHERE id = ?")
            .bind(download_id)
            .fetch_one(pool)
            .await
            .unwrap_or_else(|_| "Other".to_string());
            
        let current_path = Path::new(&final_path);
        if let Some(parent) = current_path.parent() {
            let categorized_dir = parent.join(&category);
            if !categorized_dir.exists() {
                let _ = tokio::fs::create_dir_all(&categorized_dir).await;
            }
            if let Some(filename) = current_path.file_name() {
                let new_sorted_path = categorized_dir.join(filename);
                if tokio::fs::rename(&final_path, &new_sorted_path).await.is_ok() {
                    final_path = new_sorted_path.to_string_lossy().to_string();
                }
            }
        }
    }
    
    // AV Scan
    if runtime.av_scan_enabled {
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("MpCmdRun.exe")
                .args(["-Scan", "-ScanType", "3", "-File", &final_path])
                .output();
        }
        #[cfg(not(windows))]
        {
            println!("AV Scan simulated on non-Windows platform for: {}", final_path);
        }
    }

    let final_file_name = Path::new(&final_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "downloaded_file".to_string());

    sqlx::query("UPDATE downloads SET save_path = ?, file_name = ? WHERE id = ?")
        .bind(&final_path)
        .bind(&final_file_name)
        .bind(download_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE downloads SET status = 'Completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(download_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    maybe_mirror_completed_file(pool, &final_path, &completion_meta).await;

    let _ = archive_download(
        pool,
        &CompletionInfo {
            path: final_path.clone(),
            file_name: final_file_name,
            category: None,
        },
    ).await;

    // Auto-resume: start next queued download if scheduler is enabled
    let scheduler_enabled = sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'schedulerEnabled'")
        .fetch_one(pool)
        .await
        .unwrap_or_else(|_| "false".to_string());
    if scheduler_enabled == "true" {
        if let Some(next_id) = sqlx::query_scalar::<_, String>(
            "SELECT id FROM downloads WHERE status = 'Queued' ORDER BY priority DESC, created_at ASC LIMIT 1"
        )
        .fetch_optional(pool)
        .await
        .unwrap_or(None)
        {
            sqlx::query("UPDATE downloads SET status = 'Downloading' WHERE id = ?")
                .bind(&next_id)
                .execute(pool)
                .await
                .ok();
            println!("Auto-resumed next queued download: {}", next_id);
        }
    }

    Ok(final_path)
}

pub async fn archive_download(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    info: &CompletionInfo,
) -> Result<(), String> {
    let _ = sqlx::query(
        "INSERT INTO history (id, download_id, file_name, save_path, url, total_size, completed_at, category) \
         SELECT ?, id, file_name, save_path, url, total_size, completed_at, category FROM downloads WHERE save_path = ? AND file_name = ?"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&info.path)
    .bind(&info.file_name)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
