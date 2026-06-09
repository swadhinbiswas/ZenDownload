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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserSetupResult {
    pub browser: String,
    pub name: String,
    pub native_messaging: bool,
    pub extension_loaded: bool,
    pub message: String,
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
                format!(
                    "{}ZenDownload\\manifests\\{}",
                    std::env::var("PROGRAMFILES").unwrap_or_else(|_| "C:\\Program Files\\".into()),
                    filename
                )
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
                format!(
                    "{}/Library/Application Support/Mozilla/NativeMessagingHosts/{}",
                    std::env::var("HOME").unwrap_or_else(|_| "~".into()),
                    filename
                )
            } else if cfg!(target_os = "windows") {
                format!(
                    "{}ZenDownload\\manifests\\{}",
                    std::env::var("PROGRAMFILES").unwrap_or_else(|_| "C:\\Program Files\\".into()),
                    filename
                )
            } else {
                format!(
                    "{}/.mozilla/native-messaging-hosts/{}",
                    std::env::var("HOME").unwrap_or_else(|_| "~".into()),
                    filename
                )
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

pub fn find_extension_dir() -> Option<std::path::PathBuf> {
    let candidates = vec![
        std::env::current_exe().ok()?.parent()?.join("extension"),
        std::env::current_exe().ok()?.parent()?.parent()?.join("extension"),
        std::path::PathBuf::from("extension"),
    ];
    for path in candidates {
        if path.join("manifest.json").exists() {
            return Some(path);
        }
    }
    None
}

pub fn detect_browsers() -> Vec<(&'static str, &'static str, Vec<String>)> {
    let mut browsers: Vec<(&'static str, &'static str, Vec<String>)> = Vec::new();
    if cfg!(target_os = "linux") {
        let checks = vec![
            ("chrome", "Google Chrome", vec!["google-chrome", "google-chrome-stable"]),
            ("chromium", "Chromium", vec!["chromium", "chromium-browser"]),
            ("firefox", "Firefox", vec!["firefox", "firefox-esr"]),
            ("edge", "Microsoft Edge", vec!["microsoft-edge", "microsoft-edge-stable"]),
        ];
        for (name, id, exes) in checks {
            for exe in &exes {
                if which::which(exe).is_ok() {
                    browsers.push((id, name, exes.into_iter().map(String::from).collect()));
                    break;
                }
            }
        }
    } else if cfg!(target_os = "macos") {
        let checks = vec![
            ("chrome", "Google Chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            ("firefox", "Firefox", "/Applications/Firefox.app/Contents/MacOS/firefox"),
            ("edge", "Microsoft Edge", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        ];
        for (id, name, path) in checks {
            if std::path::Path::new(path).exists() {
                browsers.push((id, name, vec![path.to_string()]));
            }
        }
    } else if cfg!(target_os = "windows") {
        let pf86 = std::env::var("PROGRAMFILES(X86)").unwrap_or_else(|_| "C:\\Program Files (x86)".into());
        let la = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Local".into());
        let checks = vec![
            ("chrome", "Google Chrome", vec![
                format!("{}\\Google\\Chrome\\Application\\chrome.exe", pf86),
                format!("{}\\Google\\Chrome\\Application\\chrome.exe", la),
            ]),
            ("edge", "Microsoft Edge", vec![
                format!("{}\\Microsoft\\Edge\\Application\\msedge.exe", pf86),
            ]),
            ("firefox", "Firefox", vec![
                format!("{}\\Mozilla Firefox\\firefox.exe", pf86),
            ]),
        ];
        for (id, name, paths) in checks {
            for p in &paths {
                if std::path::Path::new(p).exists() {
                    browsers.push((id, name, paths));
                    break;
                }
            }
        }
    }
    browsers
}

pub fn install_native_messaging_host(browser: &str) -> Result<String, String> {
    let manifest_path = get_native_messaging_manifest_path(browser);
    let path = std::path::Path::new(&manifest_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
    }
    let json = build_manifest_json(browser);
    std::fs::write(path, &json).map_err(|e| format!("Failed to write manifest: {}", e))?;
    Ok(manifest_path)
}

pub fn launch_browser_with_extension(browser_exe: &str, extension_path: &str) -> Result<(), String> {
    let ext_path = std::path::Path::new(extension_path);
    let absolute = if ext_path.is_absolute() {
        ext_path.to_path_buf()
    } else {
        std::env::current_exe()
            .map_err(|e| e.to_string())?
            .parent()
            .map(|p| p.join(ext_path))
            .unwrap_or(ext_path.to_path_buf())
    };
    if !absolute.join("manifest.json").exists() {
        return Err(format!("Extension not found at {}", absolute.display()));
    }
    std::process::Command::new(browser_exe)
        .arg(format!("--load-extension={}", absolute.to_string_lossy()))
        .arg("--no-first-run")
        .arg("--new-window")
        .arg("about:blank")
        .spawn()
        .map_err(|e| format!("Failed to launch {}: {}", browser_exe, e))?;
    Ok(())
}

pub fn setup_browser(browser_id: &str, browser_name: &str, exes: &[String]) -> BrowserSetupResult {
    let nm_result = install_native_messaging_host(browser_id);
    let native_messaging = nm_result.is_ok();
    let mut extension_loaded = false;

    if let Some(ref ext_path) = find_extension_dir() {
        for exe in exes {
            if let Ok(path) = which::which(exe) {
                if launch_browser_with_extension(path.to_str().unwrap_or(""), ext_path.to_str().unwrap_or("")).is_ok() {
                    extension_loaded = true;
                    break;
                }
            }
        }
    }

    let msg = if native_messaging && extension_loaded {
        format!("{} integration complete. Extension loaded.", browser_name)
    } else if native_messaging {
        format!("{} native messaging registered. Open chrome://extensions, enable Developer mode, and 'Load unpacked' from the extension folder.", browser_name)
    } else {
        format!("Failed: {}", nm_result.unwrap_or_else(|e| e))
    };

    BrowserSetupResult {
        browser: browser_id.to_string(),
        name: browser_name.to_string(),
        native_messaging,
        extension_loaded,
        message: msg,
    }
}
