use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{RwLock, Semaphore};
use tokio::time::interval;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mirror {
    pub id: String,
    pub url: String,
    pub region: String,
    pub priority: u32,
    pub enabled: bool,
    pub last_latency_ms: u64,
    pub last_status: i32,
    pub last_checked: i64,
    pub success_count: u64,
    pub failure_count: u64,
    pub avg_speed_bps: u64,
    pub health_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirrorConfig {
    pub enabled: bool,
    pub check_interval_secs: u64,
    pub request_timeout_secs: u64,
    pub failover_threshold: u32,
    pub parallel_mirrors: u32,
    pub smart_routing: bool,
}

impl Default for MirrorConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            check_interval_secs: 600,
            request_timeout_secs: 10,
            failover_threshold: 3,
            parallel_mirrors: 3,
            smart_routing: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirrorDownload {
    pub download_id: String,
    pub mirrors: Vec<MirrorChunk>,
    pub total_size: u64,
    pub downloaded: u64,
    pub status: String,
    pub started_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirrorChunk {
    pub mirror_id: String,
    pub range_start: u64,
    pub range_end: u64,
    pub downloaded: u64,
    pub status: String,
    pub speed_bps: u64,
    pub retries: u32,
}

pub struct MirrorNetwork {
    mirrors: Arc<RwLock<HashMap<String, Mirror>>>,
    config: Arc<RwLock<MirrorConfig>>,
    client: reqwest::Client,
}

impl Default for MirrorNetwork {
    fn default() -> Self {
        Self::new()
    }
}

impl MirrorNetwork {
    pub fn new() -> Self {
        Self {
            mirrors: Arc::new(RwLock::new(HashMap::new())),
            config: Arc::new(RwLock::new(MirrorConfig::default())),
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(15))
                .user_agent("ZenDownload/1.0 MirrorNetwork")
                .build()
                .unwrap_or_default(),
        }
    }

    pub fn start(self: Arc<Self>) {
        tokio::spawn(async move {
            let mut tick = interval(Duration::from_secs(120));
            loop {
                tick.tick().await;
                if !self.config.read().await.enabled { continue; }
                self.health_check_all().await;
            }
        });
    }

    pub async fn list(&self) -> Vec<Mirror> {
        let mut v: Vec<Mirror> = self.mirrors.read().await.values().cloned().collect();
        v.sort_by(|a, b| b.health_score.partial_cmp(&a.health_score).unwrap_or(std::cmp::Ordering::Equal));
        v
    }

    pub async fn add(&self, mut mirror: Mirror) -> Result<String, String> {
        if mirror.url.is_empty() { return Err("URL required".into()); }
        if mirror.id.is_empty() { mirror.id = uuid::Uuid::new_v4().to_string(); }
        let id = mirror.id.clone();
        self.mirrors.write().await.insert(id.clone(), mirror);
        Ok(id)
    }

    pub async fn remove(&self, id: &str) -> Result<(), String> {
        self.mirrors.write().await.remove(id);
        Ok(())
    }

    pub async fn get_config(&self) -> MirrorConfig {
        self.config.read().await.clone()
    }

    pub async fn set_config(&self, cfg: MirrorConfig) {
        *self.config.write().await = cfg;
    }

    pub async fn select_mirrors(&self, count: u32) -> Vec<Mirror> {
        let cfg = self.config.read().await.clone();
        let mirrors = self.list().await;
        if !cfg.smart_routing {
            return mirrors.into_iter().filter(|m| m.enabled).take(count as usize).collect();
        }
        mirrors.into_iter()
            .filter(|m| m.enabled)
            .filter(|m| m.last_status >= 200 && m.last_status < 400)
            .take(count as usize)
            .collect()
    }

    async fn health_check_all(&self) {
        let mirrors: Vec<Mirror> = self.mirrors.read().await.values().cloned().collect();
        let sem = Arc::new(Semaphore::new(8));
        let mut handles = vec![];
        for mirror in mirrors {
            let permit = sem.clone();
            let me = self.clone_handle();
            handles.push(tokio::spawn(async move {
                let _p = permit.acquire().await;
                me.check_mirror(mirror).await;
            }));
        }
        for h in handles { let _ = h.await; }
    }

    fn clone_handle(&self) -> Arc<Self> {
        Arc::new(Self {
            mirrors: self.mirrors.clone(),
            config: self.config.clone(),
            client: self.client.clone(),
        })
    }

    async fn check_mirror(&self, mirror: Mirror) {
        let started = std::time::Instant::now();
        let res = self.client.head(&mirror.url).timeout(Duration::from_secs(10)).send().await;
        let mut mirrors = self.mirrors.write().await;
        if let Some(m) = mirrors.get_mut(&mirror.id) {
            m.last_checked = chrono::Utc::now().timestamp();
            match res {
                Ok(r) => {
                    m.last_status = r.status().as_u16() as i32;
                    m.last_latency_ms = started.elapsed().as_millis() as u64;
                    if (200..300).contains(&m.last_status) {
                        m.success_count += 1;
                    } else {
                        m.failure_count += 1;
                    }
                }
                Err(_) => {
                    m.last_status = 0;
                    m.failure_count += 1;
                }
            }
            let total = m.success_count + m.failure_count;
            if total > 0 {
                m.health_score = (m.success_count as f64 / total as f64) * 100.0
                    * (1.0 - (m.last_latency_ms as f64 / 5000.0).min(0.5));
            }
        }
    }
}
