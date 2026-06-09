#![allow(dead_code)]
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudUploadResult {
    pub provider: String,
    pub remote_id: String,
    pub remote_name: String,
}
pub struct OAuthToken {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
}

pub struct CloudDriveEngine;

impl CloudDriveEngine {
    pub async fn authenticate(_provider: &str) -> Result<OAuthToken, String> {
        // MVP Abstraction tying into Phase 2's secure keychain map
        // e.g. Open localhost redirect browser, snag token securely.
        Ok(OAuthToken {
            access_token: "MOCK_DRIVE_TOKEN".to_string(),
            refresh_token: "MOCK_REFRESH".to_string(),
            expires_at: 0,
        })
    }

    pub async fn get_download_url_from_node(provider: &str, node_id: &str, token: &str) -> Result<String, String> {
        match provider {
            "google_drive" => {
                // Generates standardized HTTP export URL mapped natively into Engine 1
                Ok(format!("https://www.googleapis.com/drive/v3/files/{}?alt=media&access_token={}", node_id, token))
            },
            "onedrive" => {
                Ok(format!("https://graph.microsoft.com/v1.0/me/drive/items/{}/content?access_token={}", node_id, token))
            },
            _ => Err("Unsupported Cloud Provider".into()),
        }
    }

    pub async fn upload_file_to_node(provider: &str, local_path: &str, folder_id: &str, token: &str) -> Result<String, String> {
        let path = std::path::Path::new(local_path);
        if !path.exists() {
            return Err("Local file does not exist".into());
        }
        
        let filename = path.file_name().unwrap_or_default().to_string_lossy();
        
        match provider {
            "google_drive" => {
                let client = reqwest::Client::new();
                let url = format!(
                    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true"
                );
                let metadata = serde_json::json!({
                    "name": filename,
                    "parents": if folder_id.is_empty() { serde_json::Value::Null } else { serde_json::json!([folder_id]) },
                });
                let form = reqwest::multipart::Form::new()
                    .part("metadata", reqwest::multipart::Part::text(metadata.to_string()).mime_str("application/json; charset=UTF-8").map_err(|e| e.to_string())?)
                    .part("file", reqwest::multipart::Part::bytes(tokio::fs::read(local_path).await.map_err(|e| e.to_string())?).file_name(filename.to_string()));

                let response = client.post(url)
                    .bearer_auth(token)
                    .multipart(form)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                if !response.status().is_success() {
                    return Err(format!("Google Drive upload failed: {}", response.status()));
                }

                let value: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
                Ok(value["id"].as_str().unwrap_or("unknown").to_string())
            },
            "onedrive" => {
                let client = reqwest::Client::new();
                let target = if folder_id.is_empty() {
                    format!("https://graph.microsoft.com/v1.0/me/drive/root:/{}:/content", filename)
                } else {
                    format!("https://graph.microsoft.com/v1.0/me/drive/items/{}/children/{}:/content", folder_id, filename)
                };
                let bytes = tokio::fs::read(local_path).await.map_err(|e| e.to_string())?;
                let response = client.put(&target)
                    .bearer_auth(token)
                    .body(bytes)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                if !response.status().is_success() {
                    return Err(format!("OneDrive upload failed: {}", response.status()));
                }

                let value: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
                Ok(value["id"].as_str().unwrap_or("unknown").to_string())
            },
            _ => Err("Unsupported Cloud Provider".into()),
        }
    }
}
