use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tokio::time::{interval, Duration};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub download_id: String,
    pub url: String,
    pub last_checked: i64,
    pub last_status: i32,
    pub last_size: Option<u64>,
    pub last_etag: Option<String>,
    pub last_modified: Option<String>,
    pub content_type: Option<String>,
    pub consecutive_failures: u32,
    pub avg_latency_ms: f64,
    pub bandwidth_kbps: f64,
    pub history: Vec<HealthSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthSnapshot {
    pub timestamp: i64,
    pub status: i32,
    pub latency_ms: u64,
    pub size: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthConfig {
    pub enabled: bool,
    pub check_interval_secs: u64,
    pub request_timeout_secs: u64,
    pub max_concurrent_checks: u32,
    pub auto_pause_threshold: u32,
    pub notify_on_failure: bool,
    pub verify_checksum: bool,
}

impl Default for HealthConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            check_interval_secs: 300,
            request_timeout_secs: 15,
            max_concurrent_checks: 8,
            auto_pause_threshold: 5,
            notify_on_failure: true,
            verify_checksum: false,
        }
    }
}

pub struct HealthMonitor {
    db: Pool<Sqlite>,
    app: AppHandle,
    checks: Arc<RwLock<HashMap<String, HealthCheck>>>,
    config: Arc<RwLock<HealthConfig>>,
    client: reqwest::Client,
}

impl HealthMonitor {
    pub fn new(db: Pool<Sqlite>, app: AppHandle) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("ZenDownload/1.0 HealthMonitor")
            .build()
            .unwrap_or_default();
        Self {
            db,
            app,
            checks: Arc::new(RwLock::new(HashMap::new())),
            config: Arc::new(RwLock::new(HealthConfig::default())),
            client,
        }
    }

    pub fn start(self: Arc<Self>) {
        tokio::spawn(async move {
            let mut tick = interval(Duration::from_secs(60));
            loop {
                tick.tick().await;
                if !self.config.read().await.enabled {
                    continue;
                }
                self.run_cycle().await;
            }
        });
    }

    async fn run_cycle(&self) {
        let downloads = match sqlx::query_as::<_, (String, String)>(
            "SELECT id, url FROM downloads WHERE status IN ('Downloading', 'Paused', 'Queued', 'Error')"
        )
        .fetch_all(&self.db)
        .await
        {
            Ok(d) => d,
            Err(_) => return,
        };
        let cfg = self.config.read().await.clone();
        let semaphore = Arc::new(tokio::sync::Semaphore::new(cfg.max_concurrent_checks as usize));
        let mut handles = vec![];
        for (id, url) in downloads {
            let permit = semaphore.clone();
            let me = self.clone_handle();
            let url_clone = url.clone();
            let id_clone = id.clone();
            let cfg_clone = cfg.clone();
            handles.push(tokio::spawn(async move {
                let _p = permit.acquire().await;
                me.check_one(&id_clone, &url_clone, &cfg_clone).await;
            }));
        }
        for h in handles {
            let _ = h.await;
        }
    }

    fn clone_handle(&self) -> Arc<Self> {
        Arc::new(Self {
            db: self.db.clone(),
            app: self.app.clone(),
            checks: self.checks.clone(),
            config: self.config.clone(),
            client: self.client.clone(),
        })
    }

    async fn check_one(&self, id: &str, url: &str, cfg: &HealthConfig) {
        let started = std::time::Instant::now();
        let res = self.client.head(url).timeout(Duration::from_secs(cfg.request_timeout_secs)).send().await;
        let now = chrono::Utc::now().timestamp();
        let mut checks = self.checks.write().await;
        let entry = checks.entry(id.to_string()).or_insert_with(|| HealthCheck {
            download_id: id.to_string(),
            url: url.to_string(),
            last_checked: 0,
            last_status: 0,
            last_size: None,
            last_etag: None,
            last_modified: None,
            content_type: None,
            consecutive_failures: 0,
            avg_latency_ms: 0.0,
            bandwidth_kbps: 0.0,
            history: vec![],
        });
        let snap = match res {
            Ok(r) => {
                let status = r.status().as_u16() as i32;
                let size = r.headers().get("content-length").and_then(|h| h.to_str().ok()).and_then(|s| s.parse().ok());
                let etag = r.headers().get("etag").and_then(|h| h.to_str().ok()).map(String::from);
                let last_modified = r.headers().get("last-modified").and_then(|h| h.to_str().ok()).map(String::from);
                let content_type = r.headers().get("content-type").and_then(|h| h.to_str().ok()).map(String::from);
                entry.last_status = status;
                entry.last_size = size;
                entry.last_etag = etag;
                entry.last_modified = last_modified;
                if let Some(ct) = content_type.clone() {
                    entry.content_type = Some(ct);
                }
                if (200..300).contains(&status) {
                    entry.consecutive_failures = 0;
                } else {
                    entry.consecutive_failures += 1;
                }
                HealthSnapshot {
                    timestamp: now,
                    status,
                    latency_ms: started.elapsed().as_millis() as u64,
                    size,
                    error: None,
                }
            }
            Err(e) => {
                entry.consecutive_failures += 1;
                HealthSnapshot {
                    timestamp: now,
                    status: 0,
                    latency_ms: started.elapsed().as_millis() as u64,
                    size: None,
                    error: Some(e.to_string()),
                }
            }
        };
        entry.last_checked = now;
        let lat = snap.latency_ms as f64;
        entry.avg_latency_ms = entry.avg_latency_ms * 0.7 + lat * 0.3;
        if entry.history.len() >= 30 {
            entry.history.remove(0);
        }
        entry.history.push(snap.clone());

        if entry.consecutive_failures >= cfg.auto_pause_threshold {
            let _ = sqlx::query("UPDATE downloads SET status = 'Paused' WHERE id = ?")
                .bind(id)
                .execute(&self.db)
                .await;
            let _ = self.app.emit("health-monitor-paused", id);
        }
        let snapshot = entry.clone();
        let _ = self.app.emit("health-monitor-updated", snapshot);
    }

    pub async fn list_checks(&self) -> Vec<HealthCheck> {
        self.checks.read().await.values().cloned().collect()
    }

    pub async fn get_check(&self, id: &str) -> Option<HealthCheck> {
        self.checks.read().await.get(id).cloned()
    }

    pub async fn set_config(&self, cfg: HealthConfig) {
        *self.config.write().await = cfg;
    }

    pub async fn get_config(&self) -> HealthConfig {
        self.config.read().await.clone()
    }
}
