use std::io::{self, BufRead, Write};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeMessage {
    pub message_type: String, // "download", "sniffed_url", "settings"
    pub url: Option<String>,
    pub filename: Option<String>,
    pub referrer: Option<String>,
    pub user_agent: Option<String>,
    pub cookies: Option<String>,
    pub headers: Option<std::collections::HashMap<String, String>>,
    pub mime_type: Option<String>,
    pub tab_id: Option<String>,
    pub timestamp: i64,
}

const FRAME_HEADER_SIZE: usize = 4;

pub fn read_message<R: BufRead>(reader: &mut R) -> Result<Option<NativeMessage>, String> {
    let mut header = [0u8; FRAME_HEADER_SIZE];
    match reader.read_exact(&mut header) {
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e.to_string()),
    }
    let len = u32::from_le_bytes(header) as usize;
    if len == 0 || len > 10 * 1024 * 1024 {
        return Err(format!("Invalid message length: {}", len));
    }
    let mut body = vec![0u8; len];
    reader.read_exact(&mut body).map_err(|e| e.to_string())?;
    let msg: NativeMessage = serde_json::from_slice(&body)
        .map_err(|e| format!("Failed to parse native message: {}", e))?;
    Ok(Some(msg))
}

pub fn write_message<W: Write>(writer: &mut W, message: &impl Serialize) -> Result<(), String> {
    let body = serde_json::to_vec(message).map_err(|e| e.to_string())?;
    let len = body.len() as u32;
    writer.write_all(&len.to_le_bytes()).map_err(|e| e.to_string())?;
    writer.write_all(&body).map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn start_native_messaging_listener(app: AppHandle) {
    use std::sync::mpsc;
    let (tx, rx) = mpsc::channel::<NativeMessage>();

    std::thread::spawn(move || {
        let stdin = io::stdin();
        let mut handle = stdin.lock();
        loop {
            match read_message(&mut handle) {
                Ok(Some(msg)) => {
                    if tx.send(msg).is_err() { break; }
                }
                Ok(None) => break,
                Err(e) => eprintln!("Native messaging read error: {}", e),
            }
        }
    });

    while let Ok(msg) = rx.recv() {
        handle_message(&app, msg).await;
    }
}

async fn handle_message(app: &AppHandle, msg: NativeMessage) {
    use tauri::Emitter;
    match msg.message_type.as_str() {
        "download" => {
            if let Some(url) = &msg.url {
                let _ = app.emit("browser-download-request", &msg);
                eprintln!("Browser requested download: {}", url);
            }
        }
        "sniffed_url" => {
            if let Some(url) = &msg.url {
                let _ = app.emit("browser-url-sniffed", &msg);
                eprintln!("Browser sniffed URL: {}", url);
            }
        }
        "settings" => {
            let _ = app.emit("browser-settings-sync", &msg);
        }
        _ => {}
    }
}

pub fn get_native_messaging_manifest_path(browser: &str) -> String {
    // Returns the path where the native messaging manifest should be installed
    match browser {
        "chrome" => {
            if cfg!(target_os = "macos") {
                "/Library/Google/Chrome/NativeMessagingHosts/com.zendownload.host.json".to_string()
            } else if cfg!(target_os = "windows") {
                "C:\\Program Files\\ZenDownload\\manifests\\com.zendownload.host.json".to_string()
            } else {
                "/etc/opt/chrome/native-messaging-hosts/com.zendownload.host.json".to_string()
            }
        }
        "firefox" => {
            if cfg!(target_os = "macos") {
                "~/Library/Application Support/Mozilla/NativeMessagingHosts/com.zendownload.host.json".to_string()
            } else if cfg!(target_os = "windows") {
                "C:\\Program Files\\ZenDownload\\manifests\\com.zendownload.host.json".to_string()
            } else {
                "~/mozilla/native-messaging-hosts/com.zendownload.host.json".to_string()
            }
        }
        _ => "com.zendownload.host.json".to_string(),
    }
}

pub fn build_manifest_json(browser: &str) -> String {
    let path = get_native_messaging_manifest_path(browser);
    let manifest = serde_json::json!({
        "name": "com.zendownload.host",
        "description": "ZenDownload Native Messaging Host",
        "path": path,
        "type": "stdio",
        "allowed_extensions": ["com.zendownload.extension@browser"]
    });
    serde_json::to_string_pretty(&manifest).unwrap_or_default()
}
