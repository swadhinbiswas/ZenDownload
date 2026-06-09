use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{Mutex, RwLock};
use tokio::time::{interval, Duration};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedUrl {
    pub url: String,
    pub detected_at: i64,
    pub source: String,
    pub confidence: f64,
    pub pattern: String,
    pub auto_added: bool,
    pub ignored: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardConfig {
    pub enabled: bool,
    pub auto_add: bool,
    pub poll_interval_secs: u64,
    pub dedupe_window_secs: i64,
    pub patterns: Vec<UrlPattern>,
    pub ignore_patterns: Vec<String>,
    pub auto_categories: Vec<AutoCategory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UrlPattern {
    pub name: String,
    pub regex: String,
    pub category: String,
    pub priority: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoCategory {
    pub match_string: String,
    pub category: String,
}

impl Default for ClipboardConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_add: false,
            poll_interval_secs: 2,
            dedupe_window_secs: 30,
            patterns: vec![
                UrlPattern {
                    name: "Direct HTTP/HTTPS".into(),
                    regex: r#"https?://[^\s<>"']+\.[a-zA-Z0-9]{2,}[^\s<>"']*"#.into(),
                    category: "Direct".into(),
                    priority: 1,
                },
                UrlPattern {
                    name: "Magnet Link".into(),
                    regex: r"magnet:\?xt=urn:btih:[a-zA-Z0-9]+".into(),
                    category: "Torrents".into(),
                    priority: 10,
                },
                UrlPattern {
                    name: "YouTube".into(),
                    regex: r"https?://(www\.)?(youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)[a-zA-Z0-9_-]+".into(),
                    category: "Video".into(),
                    priority: 20,
                },
                UrlPattern {
                    name: "Torrent File".into(),
                    regex: r#"https?://[^\s<>"']+\.torrent\b"#.into(),
                    category: "Torrents".into(),
                    priority: 15,
                },
                UrlPattern {
                    name: "M3U/M3U8".into(),
                    regex: r#"https?://[^\s<>"']+(\.m3u8?|playlist\.m3u8)\b"#.into(),
                    category: "Streaming".into(),
                    priority: 12,
                },
            ],
            ignore_patterns: vec![
                "127.0.0.1".into(),
                "localhost".into(),
                "0.0.0.0".into(),
                "192.168.".into(),
            ],
            auto_categories: vec![
                AutoCategory { match_string: "youtube.com".into(), category: "Video".into() },
                AutoCategory { match_string: "youtu.be".into(), category: "Video".into() },
                AutoCategory { match_string: "vimeo.com".into(), category: "Video".into() },
                AutoCategory { match_string: "soundcloud.com".into(), category: "Music".into() },
                AutoCategory { match_string: "bandcamp.com".into(), category: "Music".into() },
                AutoCategory { match_string: "magnet:".into(), category: "Torrents".into() },
                AutoCategory { match_string: ".torrent".into(), category: "Torrents".into() },
            ],
        }
    }
}

pub struct ClipboardIntel {
    config: Arc<RwLock<ClipboardConfig>>,
    detected: Arc<Mutex<Vec<DetectedUrl>>>,
    last_clipboard: Arc<Mutex<String>>,
    app: Arc<Mutex<Option<AppHandle>>>,
}

impl Default for ClipboardIntel {
    fn default() -> Self {
        Self::new()
    }
}

impl ClipboardIntel {
    pub fn new() -> Self {
        Self {
            config: Arc::new(RwLock::new(ClipboardConfig::default())),
            detected: Arc::new(Mutex::new(Vec::new())),
            last_clipboard: Arc::new(Mutex::new(String::new())),
            app: Arc::new(Mutex::new(None)),
        }
    }

    pub fn start(self: Arc<Self>, app: AppHandle) {
        let me = self.clone();
        tokio::spawn(async move {
            *me.app.lock().await = Some(app);
            let mut tick = interval(Duration::from_secs(2));
            loop {
                tick.tick().await;
                if !me.config.read().await.enabled {
                    continue;
                }
                me.poll_once().await;
            }
        });
    }

    async fn poll_once(&self) {
        let cfg = self.config.read().await.clone();
        let text = match self.read_clipboard().await {
            Some(t) => t,
            None => return,
        };
        let trimmed = text.trim().to_string();
        if trimmed.is_empty() || trimmed.len() > 8192 {
            return;
        }
        let mut last = self.last_clipboard.lock().await;
        if *last == trimmed {
            return;
        }
        *last = trimmed.clone();
        drop(last);

        let urls = self.extract_urls(&trimmed, &cfg);
        if urls.is_empty() {
            return;
        }
        let mut detected = self.detected.lock().await;
        let now = chrono::Utc::now().timestamp();
        let mut new_entries = Vec::new();
        for (url, pattern_name, category, confidence) in urls {
            if cfg.ignore_patterns.iter().any(|p| url.contains(p)) {
                continue;
            }
            if detected.iter().any(|d| d.url == url && (now - d.detected_at) < cfg.dedupe_window_secs) {
                continue;
            }
            let entry = DetectedUrl {
                url: url.clone(),
                detected_at: now,
                source: "clipboard".into(),
                confidence,
                pattern: pattern_name,
                auto_added: false,
                ignored: false,
            };
            new_entries.push(entry);
        }
        for entry in new_entries.iter() {
            if let Some(app) = self.app.lock().await.as_ref() {
                let _ = app.emit("clipboard-url-detected", entry);

                // Fire clipboard.detect hook for plugins
                if let Some(engine) = app.try_state::<crate::engine::DownloadEngine>() {
                    engine.plugin_manager.fire("clipboard.detect", serde_json::json!({
                        "url": entry.url.clone(),
                        "source": entry.source.clone(),
                        "confidence": entry.confidence,
                    })).await;
                }
            }
        }
        if cfg.auto_add {
            for entry in &mut new_entries {
                entry.auto_added = true;
            }
        }
        detected.extend(new_entries);
        if detected.len() > 200 {
            let drain = detected.len() - 200;
            detected.drain(0..drain);
        }
    }

    async fn read_clipboard(&self) -> Option<String> {
        // Try xclip / xsel / wl-paste on Linux, pbpaste on macOS, powershell on Windows
        #[cfg(target_os = "linux")]
        {
            for cmd in &["wl-paste", "xclip", "xsel"] {
                let mut c = std::process::Command::new(cmd);
                if *cmd == "xclip" {
                    c.arg("-selection").arg("clipboard").arg("-o");
                } else if *cmd == "xsel" {
                    c.arg("--clipboard").arg("--output");
                }
                c.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null());
                if let Ok(out) = c.output() {
                    if out.status.success() {
                        if let Ok(s) = String::from_utf8(out.stdout) {
                            if !s.is_empty() { return Some(s); }
                        }
                    }
                }
            }
        }
        #[cfg(target_os = "macos")]
        {
            if let Ok(out) = std::process::Command::new("pbpaste")
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::piped())
                .output()
            {
                if let Ok(s) = String::from_utf8(out.stdout) {
                    if !s.is_empty() { return Some(s); }
                }
            }
        }
        #[cfg(target_os = "windows")]
        {
            if let Ok(out) = std::process::Command::new("powershell")
                .args(&["-NoProfile", "-Command", "Get-Clipboard -Raw"])
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::piped())
                .output()
            {
                if let Ok(s) = String::from_utf8(out.stdout) {
                    let s = s.trim().to_string();
                    if !s.is_empty() { return Some(s); }
                }
            }
        }
        None
    }

    fn extract_urls(&self, text: &str, cfg: &ClipboardConfig) -> Vec<(String, String, String, f64)> {
        let mut out = Vec::new();
        let mut sorted_patterns = cfg.patterns.clone();
        sorted_patterns.sort_by_key(|p| std::cmp::Reverse(p.priority));
        for pat in &sorted_patterns {
            if let Ok(re) = regex::Regex::new(&pat.regex) {
                for cap in re.find_iter(text) {
                    let url = cap.as_str().to_string();
                    if url.is_empty() { continue; }
                    let category = cfg.auto_categories.iter()
                        .find(|ac| url.contains(&ac.match_string))
                        .map(|ac| ac.category.clone())
                        .unwrap_or_else(|| pat.category.clone());
                    let confidence = (pat.priority as f64 / 100.0).min(1.0).max(0.1);
                    out.push((url, pat.name.clone(), category, confidence));
                }
            }
        }
        out.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal));
        out
    }

    pub async fn list_detected(&self) -> Vec<DetectedUrl> {
        self.detected.lock().await.clone()
    }

    pub async fn ignore(&self, url: &str) {
        if let Some(d) = self.detected.lock().await.iter_mut().find(|d| d.url == url) {
            d.ignored = true;
        }
    }

    pub async fn clear(&self) {
        self.detected.lock().await.clear();
    }

    pub async fn get_config(&self) -> ClipboardConfig {
        self.config.read().await.clone()
    }

    pub async fn set_config(&self, cfg: ClipboardConfig) {
        *self.config.write().await = cfg;
    }

    pub async fn get_last_clipboard(&self) -> String {
        self.last_clipboard.lock().await.clone()
    }
}
