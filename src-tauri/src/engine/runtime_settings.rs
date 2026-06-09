use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RuntimeSettings {
    pub cloud_mirroring_enabled: bool,
    pub cloud_mirroring_provider: String,
    pub cloud_access_token: Option<String>,
    pub cloud_folder_id: Option<String>,
    pub language: String,
    pub auto_check_updates: bool,
    pub update_endpoint: Option<String>,
    pub update_public_key: Option<String>,
    pub smart_sorting_enabled: bool,
    pub av_scan_enabled: bool,
    pub debrid_api_key: Option<String>,
    pub auto_extract_archives: bool,
    pub auto_convert_enabled: bool,
    pub default_conversion_preset: Option<String>,
    pub api_server_enabled: bool,
    pub api_server_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RuntimeSettingsInput {
    pub cloud_mirroring_enabled: Option<bool>,
    pub cloud_mirroring_provider: Option<String>,
    pub cloud_access_token: Option<String>,
    pub cloud_folder_id: Option<String>,
    pub language: Option<String>,
    pub auto_check_updates: Option<bool>,
    pub update_endpoint: Option<String>,
    pub update_public_key: Option<String>,
    pub smart_sorting_enabled: Option<bool>,
    pub av_scan_enabled: Option<bool>,
    pub debrid_api_key: Option<String>,
    pub auto_extract_archives: Option<bool>,
    pub auto_convert_enabled: Option<bool>,
    pub default_conversion_preset: Option<String>,
    pub api_server_enabled: Option<bool>,
    pub api_server_port: Option<u16>,
}

pub async fn load_runtime_settings(pool: &SqlitePool) -> RuntimeSettings {
    let mut settings = RuntimeSettings {
        cloud_mirroring_enabled: false,
        cloud_mirroring_provider: "google_drive".to_string(),
        cloud_access_token: None,
        cloud_folder_id: None,
        language: "en".to_string(),
        auto_check_updates: false,
        update_endpoint: None,
        update_public_key: None,
        smart_sorting_enabled: true,
        av_scan_enabled: true,
        debrid_api_key: None,
        auto_extract_archives: true,
        auto_convert_enabled: false,
        default_conversion_preset: None,
        api_server_enabled: false,
        api_server_port: 9527,
    };

    let rows = sqlx::query_as::<_, (String, String)>("SELECT key, value FROM settings")
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    for (key, value) in rows {
        match key.as_str() {
            "cloudMirroringEnabled" => settings.cloud_mirroring_enabled = value == "true",
            "cloudMirroringProvider" => settings.cloud_mirroring_provider = value,
            "cloudAccessToken" => settings.cloud_access_token = Some(value),
            "cloudFolderId" => settings.cloud_folder_id = Some(value),
            "language" => settings.language = value,
            "autoCheckUpdates" => settings.auto_check_updates = value == "true",
            "updateEndpoint" => settings.update_endpoint = Some(value),
            "updatePublicKey" => settings.update_public_key = Some(value),
            "smartSortingEnabled" => settings.smart_sorting_enabled = value == "true",
            "avScanEnabled" => settings.av_scan_enabled = value == "true",
            "debridApiKey" => settings.debrid_api_key = Some(value),
            "autoExtractArchives" => settings.auto_extract_archives = value == "true",
            "autoConvertEnabled" => settings.auto_convert_enabled = value == "true",
            "defaultConversionPreset" => settings.default_conversion_preset = Some(value),
            "apiServerEnabled" => settings.api_server_enabled = value == "true",
            "apiServerPort" => settings.api_server_port = value.parse().unwrap_or(9527),
            _ => {}
        }
    }

    settings
}

pub async fn save_runtime_setting(pool: &SqlitePool, key: &str, value: &str) -> Result<(), String> {
    sqlx::query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(key)
        .bind(value)
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub async fn save_runtime_settings(pool: &SqlitePool, input: RuntimeSettingsInput) -> Result<(), String> {
    if let Some(v) = input.cloud_mirroring_enabled {
        save_runtime_setting(pool, "cloudMirroringEnabled", if v { "true" } else { "false" }).await?;
    }
    if let Some(v) = input.cloud_mirroring_provider {
        save_runtime_setting(pool, "cloudMirroringProvider", &v).await?;
    }
    if let Some(v) = input.cloud_access_token {
        save_runtime_setting(pool, "cloudAccessToken", &v).await?;
    }
    if let Some(v) = input.cloud_folder_id {
        save_runtime_setting(pool, "cloudFolderId", &v).await?;
    }
    if let Some(v) = input.language {
        save_runtime_setting(pool, "language", &v).await?;
    }
    if let Some(v) = input.auto_check_updates {
        save_runtime_setting(pool, "autoCheckUpdates", if v { "true" } else { "false" }).await?;
    }
    if let Some(v) = input.update_endpoint {
        save_runtime_setting(pool, "updateEndpoint", &v).await?;
    }
    if let Some(v) = input.update_public_key {
        save_runtime_setting(pool, "updatePublicKey", &v).await?;
    }
    if let Some(v) = input.smart_sorting_enabled {
        save_runtime_setting(pool, "smartSortingEnabled", if v { "true" } else { "false" }).await?;
    }
    if let Some(v) = input.av_scan_enabled {
        save_runtime_setting(pool, "avScanEnabled", if v { "true" } else { "false" }).await?;
    }
    if let Some(v) = input.debrid_api_key {
        save_runtime_setting(pool, "debridApiKey", &v).await?;
    }
    if let Some(v) = input.auto_extract_archives {
        save_runtime_setting(pool, "autoExtractArchives", if v { "true" } else { "false" }).await?;
    }
    if let Some(v) = input.auto_convert_enabled {
        save_runtime_setting(pool, "autoConvertEnabled", if v { "true" } else { "false" }).await?;
    }
    if let Some(v) = input.default_conversion_preset {
        save_runtime_setting(pool, "defaultConversionPreset", &v).await?;
    }
    if let Some(v) = input.api_server_enabled {
        save_runtime_setting(pool, "apiServerEnabled", if v { "true" } else { "false" }).await?;
    }
    if let Some(v) = input.api_server_port {
        save_runtime_setting(pool, "apiServerPort", &v.to_string()).await?;
    }

    Ok(())
}
