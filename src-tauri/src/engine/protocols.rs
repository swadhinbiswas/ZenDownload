use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolEndpoint {
    pub id: String,
    pub label: String,
    pub protocol: String, // "sftp" | "ftps" | "webdav" | "s3" | "azure"
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub path_prefix: Option<String>,
    pub use_tls: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpCredentials {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub private_key_passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FtpsCredentials {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub use_explicit_tls: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavCredentials {
    pub url: String,
    pub username: Option<String>,
    pub password: Option<String>,
}

pub async fn list_sftp_path(_creds: &SftpCredentials, _path: &str) -> Result<Vec<String>, String> {
    // Placeholder: real implementation would use suppaftp/ssh2 crates
    // Returns empty for now; would require adding `suppaftp` and `russh` to Cargo.toml
    Err("SFTP support requires suppaftp and russh-sftp crates. Add to Cargo.toml to enable.".to_string())
}

pub async fn download_ftp_file(_creds: &FtpsCredentials, _remote_path: &str, _local_path: &str) -> Result<u64, String> {
    Err("FTPS support requires suppaftp crate. Add to Cargo.toml to enable.".to_string())
}

pub async fn download_webdav_file(_creds: &WebDavCredentials, _remote_path: &str, _local_path: &str) -> Result<u64, String> {
    Err("WebDAV support requires reqwest with custom headers. Implementation pending.".to_string())
}

pub fn detect_protocol(url: &str) -> Option<&'static str> {
    if url.starts_with("sftp://") { Some("sftp") }
    else if url.starts_with("ftps://") || url.starts_with("ftp://") { Some("ftps") }
    else if url.starts_with("webdav://") || url.starts_with("dav://") { Some("webdav") }
    else if url.starts_with("s3://") { Some("s3") }
    else if url.starts_with("azure://") { Some("azure") }
    else { None }
}

pub async fn save_endpoint_to_db(pool: &sqlx::Pool<sqlx::Sqlite>, endpoint: &ProtocolEndpoint) -> Result<(), String> {
    let json = serde_json::to_string(endpoint).map_err(|e| e.to_string())?;
    crate::engine::runtime_settings::save_runtime_setting(pool, &format!("protocolEndpoint.{}", endpoint.id), &json).await
}

pub async fn list_saved_endpoints(pool: &sqlx::Pool<sqlx::Sqlite>) -> Vec<ProtocolEndpoint> {
    // In a real impl, this would query all protocolEndpoint.* keys from settings
    let _ = pool;
    Vec::new()
}
