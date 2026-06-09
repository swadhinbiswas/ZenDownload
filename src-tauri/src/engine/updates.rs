use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateState {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub available: bool,
    pub notes: Option<String>,
}

pub async fn check_for_updates(app: &tauri::AppHandle) -> Result<UpdateState, String> {
    use tauri_plugin_updater::UpdaterExt;

    let updater = app.updater().map_err(|e| format!("Updater not configured: {}", e))?;
    match updater.check().await {
        Ok(Some(update)) => {
            Ok(UpdateState {
                current_version: app.package_info().version.to_string(),
                latest_version: Some(update.version.clone()),
                available: true,
                notes: update.body.clone(),
            })
        }
        Ok(None) => {
            Ok(UpdateState {
                current_version: app.package_info().version.to_string(),
                latest_version: None,
                available: false,
                notes: None,
            })
        }
        Err(e) => Err(format!("Failed to check for updates: {}", e)),
    }
}

pub async fn install_update(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;

    let updater = app.updater().map_err(|e| format!("Updater not configured: {}", e))?;
    let update = updater.check().await
        .map_err(|e| format!("Failed to check for updates: {}", e))?
        .ok_or("No update available")?;

    update.download_and_install(
        |_chunk_len, _total_opt| {},
        || {},
    ).await.map_err(|e| format!("Failed to install update: {}", e))?;

    // Restart the app after successful update
    app.restart();
}
