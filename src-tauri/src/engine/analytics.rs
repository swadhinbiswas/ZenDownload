use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{RwLock, Mutex};
use tokio::time::{interval, Duration};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DownloadStat {
    pub timestamp: i64,
    pub download_id: String,
    pub event: String,
    pub bytes: u64,
    pub speed_bps: u64,
    pub category: Option<String>,
    pub host: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AnalyticsSummary {
    pub total_downloads: u64,
    pub total_bytes: u64,
    pub total_time_secs: u64,
    pub avg_speed_bps: u64,
    pub success_rate: f64,
    pub downloads_by_day: Vec<DayBucket>,
    pub downloads_by_category: Vec<NamedCount>,
    pub top_hosts: Vec<NamedCount>,
    pub peak_speed_bps: u64,
    pub current_speed_bps: u64,
    pub largest_download: Option<NamedBytes>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DayBucket {
    pub day: String,
    pub count: u64,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NamedCount {
    pub name: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NamedBytes {
    pub name: String,
    pub bytes: u64,
}

pub struct AnalyticsEngine {
    stats: Arc<Mutex<VecDeque<DownloadStat>>>,
    summary: Arc<RwLock<AnalyticsSummary>>,
    current_speeds: Arc<Mutex<HashMap<String, u64>>>,
    app: Arc<RwLock<Option<AppHandle>>>,
    max_history: usize,
}

impl Default for AnalyticsEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl AnalyticsEngine {
    pub fn new() -> Self {
        Self {
            stats: Arc::new(Mutex::new(VecDeque::with_capacity(10000))),
            summary: Arc::new(RwLock::new(AnalyticsSummary::default())),
            current_speeds: Arc::new(Mutex::new(HashMap::new())),
            app: Arc::new(RwLock::new(None)),
            max_history: 10000,
        }
    }

    pub fn start(self: Arc<Self>, app: AppHandle) {
        let me = self.clone();
        tokio::spawn(async move {
            *me.app.write().await = Some(app);
            let mut tick = interval(Duration::from_secs(30));
            loop {
                tick.tick().await;
                me.recompute_summary().await;
            }
        });
    }

    pub async fn record(&self, stat: DownloadStat) {
        let mut stats = self.stats.lock().await;
        if stats.len() >= self.max_history {
            stats.pop_front();
        }
        if stat.event == "speed_update" {
            self.current_speeds.lock().await.insert(stat.download_id.clone(), stat.speed_bps);
        } else if stat.event == "complete" {
            self.current_speeds.lock().await.remove(&stat.download_id);
        }
        stats.push_back(stat);
    }

    pub async fn record_speed(&self, download_id: String, speed_bps: u64, bytes: u64) {
        self.record(DownloadStat {
            timestamp: chrono::Utc::now().timestamp(),
            download_id,
            event: "speed_update".into(),
            bytes,
            speed_bps,
            category: None,
            host: None,
        }).await;
    }

    pub async fn record_complete(&self, download_id: String, bytes: u64, category: Option<String>, host: Option<String>) {
        self.record(DownloadStat {
            timestamp: chrono::Utc::now().timestamp(),
            download_id,
            event: "complete".into(),
            bytes,
            speed_bps: 0,
            category,
            host,
        }).await;
    }

    pub async fn record_error(&self, download_id: String) {
        self.record(DownloadStat {
            timestamp: chrono::Utc::now().timestamp(),
            download_id,
            event: "error".into(),
            bytes: 0,
            speed_bps: 0,
            category: None,
            host: None,
        }).await;
    }

    pub async fn get_summary(&self) -> AnalyticsSummary {
        self.summary.read().await.clone()
    }

    pub async fn get_recent_stats(&self, limit: usize) -> Vec<DownloadStat> {
        let stats = self.stats.lock().await;
        stats.iter().rev().take(limit).cloned().collect()
    }

    async fn recompute_summary(&self) {
        let stats = self.stats.lock().await.clone();
        let total_downloads = stats.iter().filter(|s| s.event == "complete").count() as u64;
        let total_bytes: u64 = stats.iter().filter(|s| s.event == "complete").map(|s| s.bytes).sum();
        let total_errors = stats.iter().filter(|s| s.event == "error").count() as u64;
        let success_rate = if total_downloads + total_errors > 0 {
            total_downloads as f64 / (total_downloads + total_errors) as f64
        } else { 0.0 };
        let avg_speed_bps = if !stats.is_empty() {
            stats.iter().map(|s| s.speed_bps).sum::<u64>() / stats.len() as u64
        } else { 0 };
        let peak_speed_bps = stats.iter().map(|s| s.speed_bps).max().unwrap_or(0);
        let current_speed_bps = self.current_speeds.lock().await.values().sum();

        let mut by_day: HashMap<String, DayBucket> = HashMap::new();
        for s in stats.iter().filter(|s| s.event == "complete") {
            let day = chrono::DateTime::from_timestamp(s.timestamp, 0)
                .map(|dt| dt.format("%Y-%m-%d").to_string())
                .unwrap_or_default();
            let entry = by_day.entry(day).or_insert(DayBucket::default());
            entry.day = entry.day.clone();
            entry.count += 1;
            entry.bytes += s.bytes;
        }
        let mut downloads_by_day: Vec<DayBucket> = by_day.into_values().collect();
        downloads_by_day.sort_by(|a, b| a.day.cmp(&b.day));

        let mut by_cat: HashMap<String, u64> = HashMap::new();
        for s in stats.iter().filter(|s| s.event == "complete") {
            if let Some(c) = &s.category {
                *by_cat.entry(c.clone()).or_insert(0) += 1;
            }
        }
        let mut downloads_by_category: Vec<NamedCount> = by_cat.into_iter()
            .map(|(name, count)| NamedCount { name, count })
            .collect();
        downloads_by_category.sort_by(|a, b| b.count.cmp(&a.count));

        let mut by_host: HashMap<String, u64> = HashMap::new();
        for s in stats.iter().filter(|s| s.event == "complete") {
            if let Some(h) = &s.host {
                *by_host.entry(h.clone()).or_insert(0) += 1;
            }
        }
        let mut top_hosts: Vec<NamedCount> = by_host.into_iter()
            .map(|(name, count)| NamedCount { name, count })
            .collect();
        top_hosts.sort_by(|a, b| b.count.cmp(&a.count));
        top_hosts.truncate(10);

        let largest = stats.iter().filter(|s| s.event == "complete")
            .max_by_key(|s| s.bytes)
            .map(|s| NamedBytes { name: s.download_id.clone(), bytes: s.bytes });

        let mut summary = self.summary.write().await;
        summary.total_downloads = total_downloads;
        summary.total_bytes = total_bytes;
        summary.success_rate = success_rate;
        summary.avg_speed_bps = avg_speed_bps;
        summary.peak_speed_bps = peak_speed_bps;
        summary.current_speed_bps = current_speed_bps;
        summary.downloads_by_day = downloads_by_day;
        summary.downloads_by_category = downloads_by_category;
        summary.top_hosts = top_hosts;
        summary.largest_download = largest;
        if let Some(app) = self.app.read().await.as_ref() {
            let _ = app.emit("analytics-updated", &*summary);
        }
    }
}
