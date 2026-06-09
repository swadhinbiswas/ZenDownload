use std::io::{self, BufRead, Write};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeMessage {
    pub message_type: String,
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

pub fn read_message<R: BufRead>(reader: &mut R) -> Result<Option<NativeMessage>, String> {
    let mut header = [0u8; 4];
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
    serde_json::from_slice(&body)
        .map(Some)
        .map_err(|e| format!("Failed to parse native message: {}", e))
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
                Err(e) => eprintln!("[NativeMessaging] Read error: {}", e),
            }
        }
    });

    use tauri::Emitter;
    while let Ok(msg) = rx.recv() {
        match msg.message_type.as_str() {
            "download" => {
                if let Some(url) = &msg.url {
                    let _ = app.emit("browser-download-request", &msg);
                }
            }
            "sniffed_url" => {
                if let Some(url) = &msg.url {
                    let _ = app.emit("browser-url-sniffed", &msg);
                }
            }
            "settings" => {
                let _ = app.emit("browser-settings-sync", &msg);
            }
            _ => {}
        }
    }
}

pub fn get_native_messaging_manifest_path(browser: &str) -> String {
    let filename = "com.zendownload.host.json";
    match browser {
        "chrome" | "edge" => {
            if cfg!(target_os = "macos") {
                let home = std::env::var("HOME").unwrap_or_else(|_| "~".into());
                format!("{}/Library/Application Support/Google/Chrome/NativeMessagingHosts/{}", home, filename)
            } else if cfg!(target_os = "windows") {
                format!("{}ZenDownload\\manifests\\{}",
                    std::env::var("PROGRAMFILES").unwrap_or_else(|_| "C:\\Program Files\\".into()), filename)
            } else {
                format!("/etc/opt/chrome/native-messaging-hosts/{}", filename)
            }
        }
        "chromium" => {
            if cfg!(target_os = "linux") {
                format!("/etc/chromium/native-messaging-hosts/{}", filename)
            } else {
                get_native_messaging_manifest_path("chrome")
            }
        }
        "firefox" => {
            if cfg!(target_os = "macos") {
                format!("{}/Library/Application Support/Mozilla/NativeMessagingHosts/{}",
                    std::env::var("HOME").unwrap_or_else(|_| "~".into()), filename)
            } else if cfg!(target_os = "windows") {
                format!("{}ZenDownload\\manifests\\{}",
                    std::env::var("PROGRAMFILES").unwrap_or_else(|_| "C:\\Program Files\\".into()), filename)
            } else {
                format!("{}/.mozilla/native-messaging-hosts/{}",
                    std::env::var("HOME").unwrap_or_else(|_| "~".into()), filename)
            }
        }
        _ => filename.to_string(),
    }
}

pub fn get_effective_binary_path() -> String {
    if let Ok(exe) = std::env::current_exe() {
        exe.to_string_lossy().to_string()
    } else {
        "zendownload".to_string()
    }
}

pub fn build_manifest_json(browser: &str) -> String {
    let path = get_effective_binary_path();
    let mut manifest = serde_json::Map::new();
    manifest.insert("name".into(), serde_json::Value::String("com.zendownload.host".into()));
    manifest.insert("description".into(), serde_json::Value::String("ZenDownload Native Messaging Host".into()));
    manifest.insert("path".into(), serde_json::Value::String(path));
    manifest.insert("type".into(), serde_json::Value::String("stdio".into()));

    match browser {
        "chrome" | "chromium" | "edge" => {
            manifest.insert("allowed_origins".into(), serde_json::Value::Array(
                vec![serde_json::Value::String("chrome-extension://*/".into())]
            ));
        }
        _ => {
            manifest.insert("allowed_extensions".into(), serde_json::Value::Array(
                vec![serde_json::Value::String("com.zendownload.extension@browser".into())]
            ));
        }
    }
    serde_json::to_string_pretty(&manifest).unwrap_or_default()
}
