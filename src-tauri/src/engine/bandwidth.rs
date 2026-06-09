use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::Mutex;
use chrono::{Utc, Datelike, Timelike, Weekday};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BandwidthRule {
    pub id: String,
    pub name: String,
    pub day_of_week: Option<u8>, // 0=Sun, 6=Sat
    pub start_hour: u8,
    pub end_hour: u8,
    pub limit_kbps: u64,
    pub enabled: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct BandwidthProfile {
    pub enabled: bool,
    pub rules: Vec<BandwidthRule>,
    pub default_limit_kbps: u64,
}

pub struct BandwidthLimiter {
    bytes_per_second: Arc<AtomicU64>,
    last_check: Arc<Mutex<std::time::Instant>>,
}

impl BandwidthLimiter {
    pub fn new(max_kbps: u64) -> Self {
        Self {
            bytes_per_second: Arc::new(AtomicU64::new(max_kbps * 1024)),
            last_check: Arc::new(Mutex::new(std::time::Instant::now())),
        }
    }

    pub fn update_limit(&self, max_kbps: u64) {
        self.bytes_per_second.store(max_kbps * 1024, Ordering::Relaxed);
    }

    pub async fn acquire(&self, bytes: usize) {
        let limit = self.bytes_per_second.load(Ordering::Relaxed);
        if limit == 0 {
            return; // Unlimited
        }

        let mut last = self.last_check.lock().await;
        let now = std::time::Instant::now();
        let elapsed = now.duration_since(*last).as_secs_f64();

        if elapsed > 0.0 {
            let allowed_bytes = (limit as f64 * elapsed) as u64;
            let bytes_u64 = bytes as u64;

            if allowed_bytes < bytes_u64 {
                // Need to wait
                let wait_secs = (bytes_u64 - allowed_bytes) as f64 / limit as f64;
                tokio::time::sleep(std::time::Duration::from_secs_f64(wait_secs)).await;
                *last = std::time::Instant::now();
            } else {
                *last = now;
            }
        } else {
            *last = now;
        }
    }
}

pub fn current_active_limit(profile: &BandwidthProfile) -> u64 {
    if !profile.enabled || profile.rules.is_empty() {
        return profile.default_limit_kbps;
    }

    let now = Utc::now();
    let weekday_num = match now.weekday() {
        Weekday::Sun => 0u8, Weekday::Mon => 1, Weekday::Tue => 2,
        Weekday::Wed => 3, Weekday::Thu => 4, Weekday::Fri => 5,
        Weekday::Sat => 6,
    };
    let hour = now.hour() as u8;

    let active: Vec<u64> = profile.rules.iter()
        .filter(|r| r.enabled)
        .filter(|r| r.day_of_week.map(|d| d == weekday_num).unwrap_or(true))
        .filter(|r| hour >= r.start_hour && hour < r.end_hour)
        .map(|r| r.limit_kbps)
        .collect();

    active.into_iter().min().unwrap_or(profile.default_limit_kbps)
}

pub async fn save_profile_to_settings(pool: &sqlx::Pool<sqlx::Sqlite>, profile: &BandwidthProfile) -> Result<(), String> {
    let json = serde_json::to_string(profile).map_err(|e| e.to_string())?;
    crate::engine::runtime_settings::save_runtime_setting(pool, "bandwidthProfile", &json).await
}

pub async fn load_profile_from_settings(pool: &sqlx::Pool<sqlx::Sqlite>) -> BandwidthProfile {
    let settings = crate::engine::runtime_settings::load_runtime_settings(pool).await;
    // Default profile
    let mut profile = BandwidthProfile::default();
    profile.enabled = false;
    profile.default_limit_kbps = 0; // 0 = unlimited

    // Could be loaded from settings if we add it; for now return default
    let _ = settings;
    profile
}
