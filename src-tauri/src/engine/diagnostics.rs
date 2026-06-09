use std::time::Instant;
use serde::{Deserialize, Serialize};

const TEST_SERVERS: &[(&str, &str, &str)] = &[
    ("Cloudflare", "https://speed.cloudflare.com/__down?bytes=104857600", "https://speed.cloudflare.com/__up"),
    ("Google", "https://storage.googleapis.com/speed-test-data/100mb.bin", ""),
    ("Linode", "https://speedtest.dallas.linode.com/100MB-dallas.bin", ""),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedTestResult {
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub ping_ms: f64,
    pub server: String,
    pub timestamp: i64,
    pub duration_secs: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedTestHistory {
    pub results: Vec<SpeedTestResult>,
}

impl SpeedTestHistory {
    pub fn new() -> Self { Self { results: Vec::new() } }
    pub fn push(&mut self, r: SpeedTestResult) {
        self.results.push(r);
        if self.results.len() > 20 { self.results.remove(0); }
    }
}

static HISTORY: std::sync::LazyLock<std::sync::Mutex<SpeedTestHistory>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(SpeedTestHistory::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsReport {
    pub version: String,
    pub os: String,
    pub arch: String,
    pub total_memory_bytes: u64,
    pub used_memory_bytes: u64,
    pub cpu_count: usize,
    pub disk_free_bytes: u64,
    pub disk_total_bytes: u64,
    pub active_downloads: u32,
    pub paused_downloads: u32,
    pub completed_downloads: u32,
    pub failed_downloads: u32,
    pub network_interfaces: Vec<NetworkInterface>,
    pub proxy_configured: bool,
    pub vpn_active: bool,
    pub generated_at: i64,
    pub download_limits: DownloadLimits,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadLimits {
    pub max_concurrent: usize,
    pub default_connections: i64,
    pub speed_limit_kbps: i64,
    pub bandwidth_profile: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInterface {
    pub name: String,
    pub mac: String,
    pub ip_addresses: Vec<String>,
    pub is_up: bool,
    pub is_loopback: bool,
}

fn build_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .pool_max_idle_per_host(8)
        .tcp_keepalive(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}

pub async fn run_full_speed_test(app: &tauri::AppHandle) -> Result<SpeedTestResult, String> {
    use tauri::Emitter;
    let _ = app.emit("speed-test-start", serde_json::json!({"status": "ping"}));
    let ping = ping_host_quiet("speed.cloudflare.com").await.unwrap_or(999.0);

    let _ = app.emit("speed-test-start", serde_json::json!({"status": "download"}));
    let download = run_server_download(app, "Cloudflare", TEST_SERVERS[0].1, 100).await.unwrap_or(0.0);

    let _ = app.emit("speed-test-start", serde_json::json!({"status": "upload"}));
    let upload = run_server_upload(app, "Cloudflare", TEST_SERVERS[0].2, 10).await.unwrap_or(0.0);

    let result = SpeedTestResult {
        download_mbps: download,
        upload_mbps: upload,
        ping_ms: ping,
        server: "Cloudflare".into(),
        timestamp: chrono::Utc::now().timestamp(),
        duration_secs: 0.0,
    };

    if let Ok(mut h) = HISTORY.lock() { h.push(result.clone()); }
    let _ = app.emit("speed-test-complete", serde_json::to_value(&result).unwrap());
    Ok(result)
}

pub async fn run_multi_server_test(app: &tauri::AppHandle) -> Result<Vec<SpeedTestResult>, String> {
    use tauri::Emitter;
    let mut results = Vec::new();
    for (name, dl_url, _) in TEST_SERVERS {
        let _ = app.emit("speed-test-start", serde_json::json!({"server": name, "status": "download"}));
        let mbps = run_server_download(app, name, dl_url, 50).await.unwrap_or(0.0);
        let ping = ping_host_quiet(&format!("{}.com", name.to_lowercase())).await.unwrap_or(999.0);
        results.push(SpeedTestResult {
            download_mbps: mbps,
            upload_mbps: 0.0,
            ping_ms: ping,
            server: name.to_string(),
            timestamp: chrono::Utc::now().timestamp(),
            duration_secs: 0.0,
        });
    }
    Ok(results)
}

async fn run_server_download(app: &tauri::AppHandle, name: &str, url: &str, size_mb: u32) -> Result<f64, String> {
    use tauri::Emitter;
    use futures_util::StreamExt;
    let client = build_client(120)?;
    let start = Instant::now();
    let response = client.get(url).send().await.map_err(|e| format!("{}: {}", name, e))?;
    let mut stream = response.bytes_stream();
    let mut total_bytes = 0u64;
    let mut last_emit = Instant::now();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        total_bytes += chunk.len() as u64;
        if last_emit.elapsed().as_millis() > 200 {
            let elapsed = start.elapsed().as_secs_f64();
            let mbps = (total_bytes as f64 * 8.0) / (elapsed * 1_000_000.0);
            let _ = app.emit("speed-test-progress", serde_json::json!({
                "server": name, "bytes": total_bytes, "elapsed": elapsed, "mbps": mbps,
                "progress": ((total_bytes as f64) / (size_mb as u64 * 1024 * 1024) as f64 * 100.0).min(100.0),
            }));
            last_emit = Instant::now();
        }
    }
    let elapsed = start.elapsed().as_secs_f64();
    Ok((total_bytes as f64 * 8.0) / (elapsed * 1_000_000.0))
}

async fn run_server_upload(app: &tauri::AppHandle, name: &str, url: &str, size_mb: u32) -> Result<f64, String> {
    if url.is_empty() { return Ok(0.0); }
    use tauri::Emitter;
    let client = build_client(120)?;
    let data: Vec<u8> = (0..size_mb as usize * 1024 * 1024).map(|i| (i % 256) as u8).collect();
    let start = Instant::now();
    let response = client.post(url).body(data.clone()).send().await
        .map_err(|e| format!("Upload {}: {}", name, e))?;
    let _ = response.bytes().await;
    let elapsed = start.elapsed().as_secs_f64();
    let mbps = (data.len() as f64 * 8.0) / (elapsed * 1_000_000.0);
    let _ = app.emit("speed-test-progress", serde_json::json!({
        "server": name, "type": "upload", "mbps": mbps, "elapsed": elapsed, "progress": 100.0,
    }));
    Ok(mbps)
}

pub async fn run_download_speed_test(app: &tauri::AppHandle) -> Result<SpeedTestResult, String> {
    run_full_speed_test(app).await
}

pub async fn run_upload_speed_test(app: &tauri::AppHandle) -> Result<SpeedTestResult, String> {
    use tauri::Emitter;
    let mbps = run_server_upload(app, "Cloudflare", TEST_SERVERS[0].2, 10).await.unwrap_or(0.0);
    let result = SpeedTestResult {
        download_mbps: 0.0, upload_mbps: mbps, ping_ms: 0.0,
        server: "Cloudflare".into(), timestamp: chrono::Utc::now().timestamp(), duration_secs: 0.0,
    };
    if let Ok(mut h) = HISTORY.lock() { h.push(result.clone()); }
    let _ = app.emit("speed-test-complete", serde_json::to_value(&result).unwrap());
    Ok(result)
}

pub async fn ping_host(host: &str) -> Result<f64, String> {
    ping_host_quiet(host).await
}

async fn ping_host_quiet(host: &str) -> Result<f64, String> {
    let start = Instant::now();
    let client = build_client(5)?;
    let url = format!("https://{}", host);
    client.head(&url).send().await.map_err(|e| format!("Ping failed: {}", e))?;
    Ok(start.elapsed().as_secs_f64() * 1000.0)
}

pub fn get_speed_test_history() -> Vec<SpeedTestResult> {
    HISTORY.lock().map(|h| h.results.clone()).unwrap_or_default()
}

pub async fn get_download_limits(engine: &crate::engine::DownloadEngine) -> DownloadLimits {
    let max_concurrent = *engine.max_concurrent.lock().await;
    DownloadLimits {
        max_concurrent,
        default_connections: 8,
        speed_limit_kbps: 0,
        bandwidth_profile: false,
    }
}

pub async fn generate_diagnostics_report(engine: &crate::engine::DownloadEngine) -> Result<DiagnosticsReport, String> {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();

    let total_mem = sys.total_memory();
    let used_mem = sys.used_memory();

    let (disk_free, disk_total) = sysinfo::Disks::new_with_refreshed_list().iter()
        .find(|d| d.mount_point() == std::path::Path::new("/") || d.mount_point() == std::path::Path::new("C:\\"))
        .map(|d| (d.available_space(), d.total_space()))
        .unwrap_or((0, 0));

    let pool = &engine.db;
    let active: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM downloads WHERE status = 'Downloading'")
        .fetch_one(pool).await.unwrap_or(0);
    let paused: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM downloads WHERE status = 'Paused'")
        .fetch_one(pool).await.unwrap_or(0);
    let completed: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM downloads WHERE status = 'Completed'")
        .fetch_one(pool).await.unwrap_or(0);
    let failed: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM downloads WHERE status = 'Error'")
        .fetch_one(pool).await.unwrap_or(0);

    let networks = sysinfo::Networks::new_with_refreshed_list();
    let network_interfaces: Vec<NetworkInterface> = networks.iter().map(|(name, data)| {
        NetworkInterface {
            name: name.clone(),
            mac: data.mac_address().to_string(),
            ip_addresses: data.ip_networks().iter().map(|n| n.to_string()).collect(),
            is_up: true,
            is_loopback: name == "lo" || name == "lo0",
        }
    }).collect();

    let limits = get_download_limits(engine).await;

    Ok(DiagnosticsReport {
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        total_memory_bytes: total_mem,
        used_memory_bytes: used_mem,
        cpu_count: sys.cpus().len(),
        disk_free_bytes: disk_free,
        disk_total_bytes: disk_total,
        active_downloads: active as u32,
        paused_downloads: paused as u32,
        completed_downloads: completed as u32,
        failed_downloads: failed as u32,
        network_interfaces,
        proxy_configured: false,
        vpn_active: false,
        generated_at: chrono::Utc::now().timestamp(),
        download_limits: limits,
    })
}
