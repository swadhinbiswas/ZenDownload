use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProfile {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub color: String,
    pub category: String,
    pub settings: ProfileSettings,
    pub url_patterns: Vec<String>,
    pub builtin: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProfileSettings {
    pub default_threads: u32,
    pub max_speed_bps: Option<u64>,
    pub auto_extract: bool,
    pub auto_convert: bool,
    pub default_conversion_preset: Option<String>,
    pub mirror_enabled: bool,
    pub use_debrid: bool,
    pub save_path: Option<String>,
    pub bandwidth_schedule_id: Option<String>,
    pub proxy: Option<String>,
    pub retry_attempts: u32,
    pub retry_delay_ms: u64,
    pub checksum_verify: bool,
    pub delete_partial_on_error: bool,
}

pub struct ProfileManager {
    profiles: Arc<RwLock<HashMap<String, DownloadProfile>>>,
}

impl Default for ProfileManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ProfileManager {
    pub fn new() -> Self {
        let mut profiles = HashMap::new();
        for builtin in builtin_profiles() {
            profiles.insert(builtin.id.clone(), builtin);
        }
        Self {
            profiles: Arc::new(RwLock::new(profiles)),
        }
    }

    pub async fn list(&self) -> Vec<DownloadProfile> {
        let mut v: Vec<DownloadProfile> = self.profiles.read().await.values().cloned().collect();
        v.sort_by(|a, b| a.name.cmp(&b.name));
        v
    }

    pub async fn get(&self, id: &str) -> Option<DownloadProfile> {
        self.profiles.read().await.get(id).cloned()
    }

    pub async fn upsert(&self, profile: DownloadProfile) -> Result<(), String> {
        if profile.builtin {
            return Err("Cannot modify builtin profile".into());
        }
        self.profiles.write().await.insert(profile.id.clone(), profile);
        Ok(())
    }

    pub async fn delete(&self, id: &str) -> Result<(), String> {
        let p = self.profiles.read().await.get(id).cloned();
        match p {
            Some(p) if p.builtin => Err("Cannot delete builtin profile".into()),
            Some(_) => {
                self.profiles.write().await.remove(id);
                Ok(())
            }
            None => Ok(()),
        }
    }

    pub async fn match_url(&self, url: &str) -> Option<DownloadProfile> {
        for p in self.profiles.read().await.values() {
            for pat in &p.url_patterns {
                if url_matches(pat, url) {
                    return Some(p.clone());
                }
            }
        }
        None
    }
}

fn url_matches(pattern: &str, url: &str) -> bool {
    if pattern.starts_with('*') && pattern.ends_with('*') {
        url.contains(&pattern[1..pattern.len() - 1])
    } else if pattern.starts_with('*') {
        url.ends_with(&pattern[1..])
    } else if pattern.ends_with('*') {
        url.starts_with(&pattern[..pattern.len() - 1])
    } else {
        url.contains(pattern)
    }
}

fn builtin_profiles() -> Vec<DownloadProfile> {
    let now = chrono::Utc::now().timestamp();
    vec![
        DownloadProfile {
            id: "builtin-video".into(),
            name: "HD Video".into(),
            description: "High-quality video with parallel chunks".into(),
            icon: "film".into(),
            color: "#ef4444".into(),
            category: "Video".into(),
            settings: ProfileSettings {
                default_threads: 16,
                max_speed_bps: None,
                auto_extract: true,
                auto_convert: false,
                default_conversion_preset: None,
                mirror_enabled: true,
                use_debrid: true,
                save_path: None,
                bandwidth_schedule_id: None,
                proxy: None,
                retry_attempts: 5,
                retry_delay_ms: 2000,
                checksum_verify: false,
                delete_partial_on_error: false,
            },
            url_patterns: vec![
                "*youtube.com*".into(),
                "*youtu.be*".into(),
                "*vimeo.com*".into(),
                "*twitch.tv*".into(),
                "*dailymotion.com*".into(),
            ],
            builtin: true,
            created_at: now,
        },
        DownloadProfile {
            id: "builtin-large".into(),
            name: "Large Files (ISOs, Archives)".into(),
            description: "Maximum parallelism, no speed limit, resume-friendly".into(),
            icon: "hard-drive".into(),
            color: "#3b82f6".into(),
            category: "Files".into(),
            settings: ProfileSettings {
                default_threads: 32,
                max_speed_bps: None,
                auto_extract: true,
                auto_convert: false,
                default_conversion_preset: None,
                mirror_enabled: true,
                use_debrid: false,
                save_path: None,
                bandwidth_schedule_id: None,
                proxy: None,
                retry_attempts: 10,
                retry_delay_ms: 5000,
                checksum_verify: true,
                delete_partial_on_error: false,
            },
            url_patterns: vec![
                "*.iso".into(),
                "*.zip".into(),
                "*.7z".into(),
                "*.rar".into(),
                "*archive.org*".into(),
                "*linux.org*".into(),
            ],
            builtin: true,
            created_at: now,
        },
        DownloadProfile {
            id: "builtin-music".into(),
            name: "Music & Audio".into(),
            description: "Auto-convert to MP3, preserve metadata".into(),
            icon: "music".into(),
            color: "#a855f7".into(),
            category: "Audio".into(),
            settings: ProfileSettings {
                default_threads: 8,
                max_speed_bps: None,
                auto_extract: false,
                auto_convert: true,
                default_conversion_preset: Some("mp3_320".into()),
                mirror_enabled: false,
                use_debrid: false,
                save_path: None,
                bandwidth_schedule_id: None,
                proxy: None,
                retry_attempts: 3,
                retry_delay_ms: 1000,
                checksum_verify: false,
                delete_partial_on_error: false,
            },
            url_patterns: vec![
                "*soundcloud.com*".into(),
                "*bandcamp.com*".into(),
                "*spotify.com*".into(),
                "*.mp3*".into(),
                "*.flac*".into(),
            ],
            builtin: true,
            created_at: now,
        },
        DownloadProfile {
            id: "builtin-torrent".into(),
            name: "Torrents (Seed-friendly)".into(),
            description: "Slower to maintain upload ratio, verify checksums".into(),
            icon: "share-2".into(),
            color: "#10b981".into(),
            category: "Torrents".into(),
            settings: ProfileSettings {
                default_threads: 64,
                max_speed_bps: Some(5_000_000),
                auto_extract: true,
                auto_convert: false,
                default_conversion_preset: None,
                mirror_enabled: false,
                use_debrid: false,
                save_path: None,
                bandwidth_schedule_id: None,
                proxy: None,
                retry_attempts: 3,
                retry_delay_ms: 5000,
                checksum_verify: true,
                delete_partial_on_error: true,
            },
            url_patterns: vec!["magnet:*".into(), "*.torrent".into()],
            builtin: true,
            created_at: now,
        },
        DownloadProfile {
            id: "builtin-streaming".into(),
            name: "Streaming Media (HLS/DASH)".into(),
            icon: "radio".into(),
            description: "Capture adaptive streams and merge to single file".into(),
            color: "#f59e0b".into(),
            category: "Video".into(),
            settings: ProfileSettings {
                default_threads: 8,
                max_speed_bps: None,
                auto_extract: false,
                auto_convert: false,
                default_conversion_preset: None,
                mirror_enabled: false,
                use_debrid: false,
                save_path: None,
                bandwidth_schedule_id: None,
                proxy: None,
                retry_attempts: 3,
                retry_delay_ms: 2000,
                checksum_verify: false,
                delete_partial_on_error: false,
            },
            url_patterns: vec!["*m3u8*".into(), "*manifest*".into()],
            builtin: true,
            created_at: now,
        },
        DownloadProfile {
            id: "builtin-document".into(),
            name: "Documents & Books".into(),
            description: "PDFs, ebooks, research papers".into(),
            icon: "book-open".into(),
            color: "#06b6d4".into(),
            category: "Documents".into(),
            settings: ProfileSettings {
                default_threads: 4,
                max_speed_bps: None,
                auto_extract: false,
                auto_convert: false,
                default_conversion_preset: None,
                mirror_enabled: false,
                use_debrid: false,
                save_path: None,
                bandwidth_schedule_id: None,
                proxy: None,
                retry_attempts: 3,
                retry_delay_ms: 1000,
                checksum_verify: false,
                delete_partial_on_error: false,
            },
            url_patterns: vec![
                "*.pdf".into(),
                "*.epub".into(),
                "*arxiv.org*".into(),
                "*sci-hub*".into(),
                "*libgen*".into(),
            ],
            builtin: true,
            created_at: now,
        },
    ]
}
