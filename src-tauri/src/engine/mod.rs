pub mod http;
pub mod stream;
pub mod torrent;
pub mod sftp;
pub mod cloud;
pub mod music;
pub mod post_processor;
pub mod automation;
pub mod hybrid;
pub mod web3;
pub mod stealth;
pub mod runtime_settings;
pub mod completion;
pub mod updates;
pub mod debrid;
pub mod adult_sites;
pub mod hls;
pub mod dash;
pub mod checksum;
pub mod scheduler;
pub mod watch_folder;
pub mod dedup;
pub mod filename;
pub mod retry;
pub mod bandwidth;
pub mod protocols;
pub mod m3u;
pub mod security;
pub mod diagnostics;
pub mod settings_sync;
pub mod native_messaging;
pub mod browser;
pub mod api_server;
pub mod cli;
pub mod network_monitor;
pub mod iptv;
pub mod link_checker;
pub mod converter;
pub mod site_grabber;
pub mod schedule;
pub mod profiles;
pub mod health_monitor;
pub mod clipboard_intel;
pub mod plugin_system;
pub mod mirror_network;
pub mod analytics;

use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::Mutex;
use sqlx::{Pool, Sqlite};
use tauri::{AppHandle, Emitter};
use reqwest::Client;
use chrono::Utc;
use serde::Deserialize;

#[derive(Deserialize, Default)]
struct DownloadExtraMeta {
    #[serde(rename = "proxyUrl")]
    proxy_url: Option<String>,
}

#[derive(Clone)]
pub struct DownloadEngine {
    pub db: Pool<Sqlite>,
    pub app: AppHandle,
    pub client: Client,
    pub active_downloads: Arc<StdMutex<std::collections::HashMap<String, tokio::task::JoinHandle<()>>>>,
    pub max_concurrent: Arc<Mutex<usize>>,
    pub torrent_engine: Arc<tokio::sync::RwLock<torrent::TorrentEngine>>,
    pub watch_folder_manager: Arc<watch_folder::WatchFolderManager>,
    pub bandwidth_limiter: Arc<bandwidth::BandwidthLimiter>,
    pub schedule_engine: Arc<schedule::ScheduleEngine>,
    pub profile_manager: Arc<profiles::ProfileManager>,
    pub health_monitor: Arc<health_monitor::HealthMonitor>,
    pub debrid_manager: Arc<debrid::DebridManager>,
    pub clipboard_intel: Arc<clipboard_intel::ClipboardIntel>,
    pub plugin_manager: Arc<plugin_system::PluginManager>,
    pub mirror_network: Arc<mirror_network::MirrorNetwork>,
    pub analytics: Arc<analytics::AnalyticsEngine>,
}

impl DownloadEngine {
    pub fn new(db: Pool<Sqlite>, app: AppHandle) -> Self {
        let torrent_engine = torrent::TorrentEngine::new(app.clone(), db.clone());

        // Spawn automation worker
        tokio::spawn(automation::start_automation_worker(db.clone(), app.clone()));

        // Spawn scheduler worker
        tokio::spawn(scheduler::start_scheduler_worker(db.clone()));

        // Spawn network monitor for auto-resume on reconnect
        let net_monitor = network_monitor::NetworkMonitor::new(db.clone());
        tokio::spawn(async move { net_monitor.start().await; });

        let schedule_engine = Arc::new(schedule::ScheduleEngine::new());
        schedule::spawn_schedule_loop(schedule_engine.clone());

        let profile_manager = Arc::new(profiles::ProfileManager::new());
        let health_monitor = Arc::new(health_monitor::HealthMonitor::new(db.clone(), app.clone()));
        health_monitor.clone().start();

        let debrid_manager = Arc::new(debrid::DebridManager::new());
        let clipboard_intel = Arc::new(clipboard_intel::ClipboardIntel::new());
        let plugin_manager = Arc::new(plugin_system::PluginManager::new());
        let mirror_network = Arc::new(mirror_network::MirrorNetwork::new());
        let analytics = Arc::new(analytics::AnalyticsEngine::new());

        // Spawn clipboard monitor
        clipboard_intel.clone().start(app.clone());

        // Spawn mirror network
        mirror_network.clone().start();

        // Spawn plugin system loader
        plugin_manager.clone().start(app.clone());

        // Spawn analytics loop
        analytics.clone().start(app.clone());

        Self {
            db,
            app,
            client: {
                let mut builder = Client::builder()
                    // Connection pooling for reuse
                    .pool_max_idle_per_host(64)  // Increased from 32
                    .pool_idle_timeout(std::time::Duration::from_secs(300))  // 5 min idle timeout
                    .tcp_keepalive(std::time::Duration::from_secs(60))  // 60s keepalive
                    // HTTP/2 optimizations
                    .http2_keep_alive_interval(std::time::Duration::from_secs(30))
                    .http2_keep_alive_timeout(std::time::Duration::from_secs(10))
                    .http2_adaptive_window(true)
                    // TCP optimizations
                    .tcp_nodelay(true)  // Disable Nagle's algorithm for lower latency
                    .connect_timeout(std::time::Duration::from_secs(10))
                    .timeout(std::time::Duration::from_secs(3600))  // 1 hour timeout for large files
                    // Buffer sizes
                    .http2_initial_stream_window_size(16 * 1024 * 1024)  // 16 MB stream window
                    .http2_initial_connection_window_size(32 * 1024 * 1024)  // 32 MB connection window
                    .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
                if let Ok(proxy_url) = std::env::var("HTTPS_PROXY").or(std::env::var("https_proxy")) {
                    if let Ok(proxy) = reqwest::Proxy::https(&proxy_url) {
                        builder = builder.proxy(proxy);
                    }
                }
                builder.build().expect("Failed to build HTTP client")
            },
            active_downloads: Arc::new(StdMutex::new(std::collections::HashMap::new())),
            max_concurrent: Arc::new(Mutex::new(1)),  // Default 1 sequential, user-configurable up to 3
            torrent_engine: Arc::new(tokio::sync::RwLock::new(torrent_engine)),
            watch_folder_manager: Arc::new(watch_folder::WatchFolderManager::new()),
            bandwidth_limiter: Arc::new(bandwidth::BandwidthLimiter::new(0)),
            schedule_engine,
            profile_manager,
            health_monitor,
            debrid_manager,
            clipboard_intel,
            plugin_manager,
            mirror_network,
            analytics,
        }
    }

    /// Start background queue processor that periodically promotes queued items
    pub fn start_queue_poller(&self) {
        let app = self.app.clone();
        let db = self.db.clone();
        let active_downloads = self.active_downloads.clone();
        let max_concurrent = self.max_concurrent.clone();
        let client = self.client.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                let mc = *max_concurrent.lock().await;
                promote_queued_downloads(&db, &app, &active_downloads, mc, &client).await;
            }
        });
    }

    pub async fn init_torrent_engine(&self, save_path: String) -> Result<(), String> {
        self.torrent_engine.write().await.initialize(save_path).await
    }

    pub async fn add_download(&self, mut url: String, save_path: String, threads: usize, category: Option<String>, extra_meta: Option<String>) -> Result<String, String> {
        // Resolve Web3 URLs if needed
        if crate::engine::web3::Web3Resolver::is_web3_protocol(&url) {
            url = crate::engine::web3::Web3Resolver::resolve_gateway(&url);
        }

        // Debrid Integration (Phase 3)
        if crate::engine::debrid::DebridEngine::is_premium_host(&url) {
            let settings = crate::engine::runtime_settings::load_runtime_settings(&self.db).await;
            if let Some(api_key) = settings.debrid_api_key {
                if !api_key.is_empty() {
                    let debrid = crate::engine::debrid::DebridEngine::new(api_key);
                    match debrid.unrestrict_link(&url).await {
                        Ok(direct_link) => {
                            println!("Debrid intercepted: resolved {} to {}", url, direct_link);
                            url = direct_link;
                        }
                        Err(e) => {
                            eprintln!("Debrid interception failed: {}", e);
                            // We can choose to fail or continue with the original URL.
                            // Let's continue, maybe yt-dlp can handle it.
                        }
                    }
                }
            }
        }

        // Validate URL is not DRM-protected
        if let Err(e) = crate::engine::music::spotify::validate_no_drm(&url) {
            return Err(e);
        }

        let new_id = uuid::Uuid::new_v4().to_string();
        let mut filename = std::path::Path::new(&save_path).file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        
        // If filename is empty, try to extract from URL
        if filename.is_empty() {
            if let Some(seg) = url.split('/').last() {
                let mut decoded = String::new();
                let mut chars = seg.chars().peekable();
                while let Some(c) = chars.next() {
                    if c == '%' {
                        let hex: String = chars.by_ref().take(2).collect();
                        if hex.len() == 2 {
                            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                                decoded.push(byte as char);
                                continue;
                            }
                        }
                        decoded.push('%');
                        decoded.push_str(&hex);
                    } else {
                        decoded.push(c);
                    }
                }
                if !decoded.is_empty() && decoded.len() < 200 && !decoded.contains('?') {
                    filename = decoded;
                }
            }
        }
        
        // If still empty, generate from timestamp
        if filename.is_empty() {
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            filename = format!("download_{}", ts);
        }

        // If URL is a magnet link, extract the display name (dn= parameter) and trackers (tr= parameters)
        let (magnet_name, magnet_trackers) = if url.starts_with("magnet:") {
            parse_magnet(&url)
        } else {
            (None, Vec::new())
        };
        if let Some(name) = &magnet_name {
            if !name.is_empty() {
                filename = name.clone();
            } else if filename.is_empty() || filename.starts_with("1B58") || filename.len() == 40 {
                // Fallback: use the info hash + extension
                if let Some(ih) = extract_magnet_infohash(&url) {
                    filename = format!("Torrent_{}", &ih[..8.min(ih.len())]);
                }
            }
        }

        let pool = self.db.clone();
        
        // Auto-Category Logic
        let derived_category = if category.is_none() || category.as_deref() == Some("General") {
            Some(crate::utils::metadata::guess_category(&filename))
        } else {
            category
        };
        
        let host = url.split("://").nth(1)
            .and_then(|s| s.split('/').next())
            .unwrap_or("unknown")
            .to_string();
        
        // Extract URL extension ignoring query params AND URL fragments (#...).
        // Some pasted URLs include anchor fragments that should never become
        // part of the filename or extension detection.
        let no_fragment = url.split('#').next().unwrap_or(&url);
        let clean_url = no_fragment.split('?').next().unwrap_or(no_fragment);
        let url_ext = std::path::Path::new(clean_url)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let is_direct_file = match url_ext.as_str() {
            // Archives
            "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "tgz" | "bz" |
            // Executables / Installers
            "exe" | "msi" | "apk" | "dmg" | "iso" | "appimage" | "pkg" | "deb" | "rpm" | "bin" | "sh" |
            // Documents
            "pdf" | "doc" | "docx" | "txt" | "md" | "xls" | "xlsx" | "ppt" | "pptx" | "csv" | "json" | "xml" |
            // Images
            "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "bmp" | "ico" | "tiff" |
            // Video
            "mp4" | "mkv" | "avi" | "webm" | "flv" | "mov" | "ts" | "m4v" | "wmv" |
            // Audio
            "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "opus" | "wma" |
            // Other binaries / disk images
            "img" | "ova" | "vmdk" | "torrent" | "dat" | "db" => true,
            _ => {
                // Fallback heuristic: if the last path segment looks like a filename with extension,
                // and it's NOT a known web page type, treat as direct file
                let last_segment = clean_url.split('/').last().unwrap_or("");
                let has_extension = last_segment.contains('.') && !last_segment.ends_with('.');
                let is_webpage = matches!(url_ext.as_str(), "html" | "htm" | "php" | "asp" | "aspx" | "jsp" | "cgi" | "pl" | "py" | "rb" | "js" | "css");
                has_extension && !is_webpage && !last_segment.is_empty()
            }
        };

        let is_known_stream_host = host.contains("youtube.com") || host.contains("youtu.be") || host.contains("bilibili.com") || host.contains("b23.tv") || host.contains("twitch.tv") || host.contains("vimeo.com") || host.contains("dailymotion.com") || host.contains("tiktok.com") || host.contains("twitter.com") || host.contains("x.com") || host.contains("instagram.com") || host.contains("facebook.com") || host.contains("fb.watch") || host.contains("threads.net") || crate::engine::adult_sites::is_adult_url(&url);

        let is_magnet = url.starts_with("magnet:");
        let is_torrent_file = url_ext == "torrent";
        let is_torrent = is_magnet || is_torrent_file;

        // Default to yt-dlp ONLY if it specifically is a known streaming host. 
        // Otherwise, route natively to our HTTP engine (like IDM). If the user grabs an m3u8 or an unknown CDN path, 
        // HTTP engine is fast and handles raw bytes. Yt-dlp shouldn't intercept standard web links!
        let is_stream = is_known_stream_host || url.contains("m3u8");
        
        let download_type = if is_torrent {
            "torrent".to_string()
        } else if is_stream {
            "ytdlp".to_string()
        } else {
            "http".to_string()
        };

        let record = crate::db::DownloadRecord {
            id: new_id.clone(),
            url: url.clone(),
            file_name: filename.clone(),
            save_path: save_path.clone(),
            category: derived_category.clone(),
            total_size: None,
            downloaded: 0,
            status: "Pending".to_string(),
            download_type: download_type.clone(),
            connections: threads as i64,
            speed_limit: 0,
            priority: 1,
            queue_id: None,
            extra_meta: extra_meta.clone(),
            error_msg: None,
            retry_count: 0,
            thumbnail: None,
            title: None,
            resolution: None,
            created_at: Utc::now().to_rfc3339(),
            completed_at: None,
        };
        sqlx::query(
            "INSERT INTO downloads (id, url, file_name, save_path, category, status, download_type, connections, created_at, extra_meta)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&record.id)
        .bind(&record.url)
        .bind(&record.file_name)
        .bind(&record.save_path)
        .bind(&record.category)
        .bind(&record.status)
        .bind(&record.download_type)
        .bind(record.connections)
        .bind(&record.created_at)
        .bind(&record.extra_meta)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

        // Fire url.extract hook for plugins
        self.plugin_manager.fire("url.extract", serde_json::json!({
            "url": url.clone(),
            "filename": filename.clone(),
            "category": derived_category.clone(),
            "download_type": download_type.clone(),
        })).await;

        // Background metadata fetch for stream URLs (title, thumbnail, resolution)
        let pool_clone = pool.clone();
        let url_clone = url.clone();
        let download_id_clone = new_id.clone();
        let app_clone = self.app.clone();
        let is_stream_for_meta = is_stream;
        let extra_meta_clone = extra_meta.clone();
        let save_path_clone = save_path.clone();
        
        tokio::spawn(async move {
            if !is_stream_for_meta {
                return;
            }
            eprintln!("[PROBE] Spawned background metadata fetch for download {}", download_id_clone);
            let meta = crate::engine::stream::probe_stream_metadata(
                &url_clone,
                extra_meta_clone.as_deref(),
                &app_clone,
            ).await;
            if let Some(meta) = meta {
                eprintln!("[PROBE] Metadata received: title='{}', resolution='{:?}', thumbnail_url='{:?}'", meta.title, meta.resolution, meta.thumbnail_url);
                // Download thumbnail and encode as base64 data URL for reliable display
                let local_thumbnail = if let Some(ref thumb_url) = meta.thumbnail_url {
                    if thumb_url.starts_with("http") {
                        if let Ok(resp) = reqwest::get(thumb_url).await {
                            if let Ok(bytes) = resp.bytes().await {
                                use base64::Engine;
                                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                                let content_type = if thumb_url.contains(".webp") { "image/webp" } else { "image/jpeg" };
                                Some(format!("data:{};base64,{}", content_type, b64))
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    } else {
                        Some(thumb_url.clone())
                    }
                } else {
                    None
                };

                let _ = sqlx::query("UPDATE downloads SET title = ?, resolution = ?, thumbnail = COALESCE(?, thumbnail) WHERE id = ?")
                    .bind(&meta.title)
                    .bind(&meta.resolution)
                    .bind(&local_thumbnail)
                    .bind(&download_id_clone)
                    .execute(&pool_clone)
                    .await;
                let _ = app_clone.emit("metadata-updated", serde_json::json!({
                    "id": download_id_clone,
                    "title": meta.title,
                    "resolution": meta.resolution,
                    "thumbnail": local_thumbnail,
                }));
            }
        });
        
        // Fire plugin hooks for download start
        self.plugin_manager.fire("download.start", serde_json::json!({
            "id": new_id,
            "url": url,
            "type": download_type,
        })).await;
        
        if download_type == "torrent" {
            // For torrents, save_path IS the output directory (not a file path)
            // Ensure it ends with a separator and exists
            let save_dir = if save_path.ends_with('/') || save_path.ends_with('\\') {
                save_path.clone()
            } else {
                format!("{}/", save_path)
            };
            let _ = tokio::fs::create_dir_all(&save_dir).await;

            let te = self.torrent_engine.write().await;
            if is_magnet {
                te.add_magnet(url.clone(), save_dir.clone(), new_id.clone(), magnet_trackers.clone()).await?;
            } else {
                // For .torrent URLs, download the torrent file first then add it
                let bytes = self.client.get(&url).send().await
                    .map_err(|e| format!("Failed to fetch torrent file: {}", e))?
                    .bytes().await
                    .map_err(|e| format!("Failed to read torrent file: {}", e))?
                    .to_vec();
                te.add_torrent_file(bytes, save_dir.clone(), new_id.clone()).await?;
            }
            drop(te);

            // Update status to Downloading and fix save_path to the directory
            let _ = sqlx::query("UPDATE downloads SET status = 'Downloading', save_path = ? WHERE id = ?")
                .bind(&save_dir)
                .bind(&new_id)
                .execute(&self.db)
                .await;

            let _ = self.app.emit("download-status", serde_json::json!({
                "id": new_id,
                "status": "Downloading"
            }));

            return Ok(new_id);
        }

        // Check concurrent limit
        let active_count = self.active_downloads.lock().unwrap().len();
        let max_concurrent = *self.max_concurrent.lock().await;
        let over_limit = active_count >= max_concurrent;
        let is_ytdlp = download_type == "ytdlp";

        if over_limit {
            // No free slots - mark as Queued, will be picked up by process_queue
            let _ = sqlx::query("UPDATE downloads SET status = 'Queued' WHERE id = ?")
                .bind(&new_id)
                .execute(&self.db)
                .await;
            return Ok(new_id);
        }

        // Stealth/Proxy support (Phase 4)
        let mut stealth_config = crate::engine::stealth::StealthConfig::new();
        if let Some(meta) = extra_meta.as_ref().and_then(|raw| serde_json::from_str::<DownloadExtraMeta>(raw).ok()) {
            if let Some(proxy_url) = meta.proxy_url {
                if !proxy_url.is_empty() {
                    stealth_config.add_proxy(proxy_url);
                }
            }
        }
        let mut builder = reqwest::Client::builder();
        builder = stealth_config.apply_to_client(builder);
        let proxy_aware_client = builder.build().unwrap_or_else(|_| self.client.clone());

        // Create download context
        let ctx = Arc::new(self::http::DownloadContext {
            id: new_id.clone(),
            url: url.clone(),
            save_path: save_path.clone(),
            threads,
            client: proxy_aware_client,
            app: self.app.clone(),
            db: pool,
            extra_meta: extra_meta.clone(),
        });
        
        // Spawn download with auto-cleanup on completion
        let active_downloads = self.active_downloads.clone();
        let ctx_clone = ctx.clone();
        let id_clone = new_id.clone();
        
        let handle = tokio::spawn(async move {
            if is_ytdlp {
                self::stream::start_stream_download(ctx_clone).await;
            } else {
                self::http::start_download(ctx_clone).await;
            }
            // Remove from active downloads when done
            active_downloads.lock().unwrap().remove(&id_clone);
        });
        
        self.active_downloads.lock().unwrap().insert(new_id.clone(), handle);
        
        Ok(new_id)
    }

    /// Add multiple downloads at once (batch for grabber/playlist)
    pub async fn add_downloads_batch(&self, items: Vec<(String, String, usize, Option<String>, Option<String>)>) -> Result<Vec<String>, String> {
        let mut ids = Vec::with_capacity(items.len());
        for (url, save_path, threads, category, extra_meta) in items {
            match self.add_download(url, save_path, threads, category, extra_meta).await {
                Ok(id) => ids.push(id),
                Err(e) => eprintln!("[batch] Failed to add download: {}", e),
            }
        }
        // After batch add, process queue in case slots are full
        self.process_queue().await;
        Ok(ids)
    }

    pub async fn get_all_downloads(&self) -> Result<Vec<crate::db::DownloadRecord>, String> {
        let pool = self.db.clone();
        let records = sqlx::query_as::<_, crate::db::DownloadRecord>("SELECT * FROM downloads ORDER BY created_at DESC")
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(records)
    }

    pub async fn remove_active_task(&self, id: &str) {
        if let Some(handle) = self.active_downloads.lock().unwrap().remove(id) {
            handle.abort();
        }
    }

    pub async fn pause_download(&self, id: String) -> Result<(), String> {
        let pool = self.db.clone();
        let record = sqlx::query_as::<_, crate::db::DownloadRecord>("SELECT * FROM downloads WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

        if record.download_type == "torrent" {
            self.torrent_engine.read().await.pause_torrent(&id).await?;
        } else {
            self.remove_active_task(&id).await;
        }

        sqlx::query("UPDATE downloads SET status = 'Paused' WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
        // Let frontend know
        let _ = self.app.emit("download-status", serde_json::json!({
            "id": id,
            "status": "Paused"
        }));
        Ok(())
    }

    pub async fn cancel_download(&self, id: String) -> Result<(), String> {
        let pool = self.db.clone();
        let record = sqlx::query_as::<_, crate::db::DownloadRecord>("SELECT * FROM downloads WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

        if record.download_type == "torrent" {
            let _ = self.torrent_engine.read().await.delete_torrent(&id, false).await;
        } else {
            self.remove_active_task(&id).await;
        }

        sqlx::query("UPDATE downloads SET status = 'Error' WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
        
        let _ = self.app.emit("download-status", serde_json::json!({
            "id": id,
            "status": "Error"
        }));
        Ok(())
    }

    pub async fn delete_download(&self, id: String) -> Result<(), String> {
        let pool = self.db.clone();
        let record = sqlx::query_as::<_, crate::db::DownloadRecord>("SELECT * FROM downloads WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

        if record.download_type == "torrent" {
            let _ = self.torrent_engine.read().await.delete_torrent(&id, true).await;
        } else {
            self.remove_active_task(&id).await;
        }

        sqlx::query("DELETE FROM downloads WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn resume_download(&self, id: String) -> Result<(), String> {
        let pool = self.db.clone();
        
        // Fetch existing record
        let record = sqlx::query_as::<_, crate::db::DownloadRecord>("SELECT * FROM downloads WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

        // Double check it's not already downloading
        if record.status == "Downloading" {
            return Ok(());
        }

        sqlx::query("UPDATE downloads SET status = 'Downloading' WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

        let _ = self.app.emit("download-status", serde_json::json!({
            "id": id,
            "status": "Downloading"
        }));

        if record.download_type == "torrent" {
            let te = self.torrent_engine.read().await;
            // Check if torrent is tracked in memory
            let is_tracked = te.is_tracked(&id).await;
            if is_tracked {
                te.resume_torrent(&id).await?;
            } else {
                // Torrent not in memory (app restarted) — re-add it to session
                drop(te);
                let mut te = self.torrent_engine.write().await;
                if record.url.starts_with("magnet:") {
                    let (_, trackers) = parse_magnet(&record.url);
                    te.add_magnet(record.url.clone(), record.save_path.clone(), id.clone(), trackers).await?;
                } else {
                    // .torrent URL — try to re-download the file
                    match self.client.get(&record.url).send().await {
                        Ok(resp) => {
                            match resp.bytes().await {
                                Ok(bytes) => {
                                    te.add_torrent_file(bytes.to_vec(), record.save_path.clone(), id.clone()).await?;
                                }
                                Err(e) => {
                                    eprintln!("[torrent] Failed to read .torrent bytes for resume: {}", e);
                                    // Update status to error
                                    let _ = sqlx::query("UPDATE downloads SET status = 'Error', error_msg = ? WHERE id = ?")
                                        .bind(format!("Failed to re-download .torrent file: {}", e))
                                        .bind(&id)
                                        .execute(&pool).await;
                                    return Err(format!("Failed to re-download .torrent file: {}", e));
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("[torrent] Failed to fetch .torrent URL for resume: {}", e);
                            let _ = sqlx::query("UPDATE downloads SET status = 'Error', error_msg = ? WHERE id = ?")
                                .bind(format!("Torrent link expired: {}", e))
                                .bind(&id)
                                .execute(&pool).await;
                            return Err(format!("Torrent link expired: {}", e));
                        }
                    }
                }
                drop(te);
            }
            return Ok(());
        }

        let ctx = Arc::new(self::http::DownloadContext {
            id: id.clone(),
            url: record.url,
            save_path: record.save_path,
            threads: record.connections as usize,
            client: self.client.clone(),
            app: self.app.clone(),
            db: pool,
            extra_meta: record.extra_meta,
        });

        let is_ytdlp = record.download_type == "ytdlp";
        let active_downloads = self.active_downloads.clone();
        let id_for_cleanup = id.clone();

        let handle = tokio::spawn(async move {
            if is_ytdlp {
                self::stream::start_stream_download(ctx).await;
            } else {
                self::http::start_download(ctx).await;
            }
            active_downloads.lock().unwrap().remove(&id_for_cleanup);
        });

        self.active_downloads.lock().unwrap().insert(id, handle);

        Ok(())
    }

    pub async fn pause_all_downloads(&self) -> Result<u32, String> {
        let pool = self.db.clone();
        let ids: Vec<String> = {
            let active = self.active_downloads.lock().unwrap();
            active.keys().cloned().collect()
        };
        let mut count = 0u32;

        for id in ids {
            let record_opt = sqlx::query_as::<_, crate::db::DownloadRecord>(
                "SELECT * FROM downloads WHERE id = ?"
            )
            .bind(&id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

            if let Some(record) = record_opt {
                if record.download_type == "torrent" {
                    let _ = self.torrent_engine.read().await.pause_torrent(&id).await;
                } else {
                    self.remove_active_task(&id).await;
                }
                let _ = sqlx::query("UPDATE downloads SET status = 'Paused' WHERE id = ?")
                    .bind(&id)
                    .execute(&pool)
                    .await;
                let _ = self.app.emit("download-status", serde_json::json!({
                    "id": id,
                    "status": "Paused"
                }));
                count += 1;
            }
        }
        Ok(count)
    }

    pub async fn resume_all_downloads(&self) -> Result<u32, String> {
        let pool = self.db.clone();
        let rows = sqlx::query_as::<_, crate::db::DownloadRecord>(
            "SELECT * FROM downloads WHERE status = 'Paused' AND download_type != 'torrent'"
        )
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut count = 0u32;
        for record in rows {
            let id = record.id.clone();
            if self.active_downloads.lock().unwrap().contains_key(&id) {
                continue;
            }
            let _ = sqlx::query("UPDATE downloads SET status = 'Downloading' WHERE id = ?")
                .bind(&id)
                .execute(&pool)
                .await;
            let _ = self.app.emit("download-status", serde_json::json!({
                "id": id,
                "status": "Downloading"
            }));

            let ctx = Arc::new(self::http::DownloadContext {
                id: id.clone(),
                url: record.url,
                save_path: record.save_path,
                threads: record.connections as usize,
                client: self.client.clone(),
                app: self.app.clone(),
                db: pool.clone(),
                extra_meta: record.extra_meta,
            });

            let is_ytdlp = record.download_type == "ytdlp";
            let active_downloads = self.active_downloads.clone();
            let id_for_cleanup = id.clone();
            let handle = tokio::spawn(async move {
                if is_ytdlp {
                    self::stream::start_stream_download(ctx).await;
                } else {
                    self::http::start_download(ctx).await;
                }
                active_downloads.lock().unwrap().remove(&id_for_cleanup);
            });
            self.active_downloads.lock().unwrap().insert(id, handle);
            count += 1;
        }
        Ok(count)
    }

    /// Promote queued downloads when slots are free
    pub async fn process_queue(&self) {
        let pool = self.db.clone();
        let active_count = self.active_downloads.lock().unwrap().len();
        let max_concurrent = *self.max_concurrent.lock().await;
        if active_count >= max_concurrent {
            return;
        }
        let free_slots = max_concurrent - active_count;

        let queued = sqlx::query_as::<_, crate::db::DownloadRecord>(
            "SELECT * FROM downloads WHERE status = 'Queued' ORDER BY priority DESC, created_at ASC LIMIT ?"
        )
        .bind(free_slots as i64)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        for record in queued {
            let id = record.id.clone();
            if self.active_downloads.lock().unwrap().contains_key(&id) {
                continue;
            }

            let _ = sqlx::query("UPDATE downloads SET status = 'Downloading' WHERE id = ?")
                .bind(&id)
                .execute(&pool)
                .await;

            let _ = self.app.emit("download-status", serde_json::json!({
                "id": id,
                "status": "Downloading"
            }));

            let is_ytdlp = record.download_type == "ytdlp";
            let ctx = Arc::new(self::http::DownloadContext {
                id: id.clone(),
                url: record.url,
                save_path: record.save_path,
                threads: record.connections as usize,
                client: self.client.clone(),
                app: self.app.clone(),
                db: pool.clone(),
                extra_meta: record.extra_meta,
            });

            let active_downloads = self.active_downloads.clone();
            let id_for_cleanup = id.clone();
            let handle = tokio::spawn(async move {
                if is_ytdlp {
                    self::stream::start_stream_download(ctx).await;
                } else {
                    self::http::start_download(ctx).await;
                }
                active_downloads.lock().unwrap().remove(&id_for_cleanup);
            });
            self.active_downloads.lock().unwrap().insert(id, handle);
        }
    }
}

/// Standalone queue promoter that can be called from background tasks
async fn promote_queued_downloads(
    db: &Pool<Sqlite>,
    app: &AppHandle,
    active_downloads: &Arc<StdMutex<std::collections::HashMap<String, tokio::task::JoinHandle<()>>>>,
    max_concurrent: usize,
    client: &Client,
) {
    let active_count = active_downloads.lock().unwrap().len();
    if active_count >= max_concurrent {
        return;
    }
    let free_slots = max_concurrent - active_count;

    let queued = sqlx::query_as::<_, crate::db::DownloadRecord>(
        "SELECT * FROM downloads WHERE status = 'Queued' ORDER BY priority DESC, created_at ASC LIMIT ?"
    )
    .bind(free_slots as i64)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    for record in queued {
        let id = record.id.clone();
        if active_downloads.lock().unwrap().contains_key(&id) {
            continue;
        }

        let _ = sqlx::query("UPDATE downloads SET status = 'Downloading' WHERE id = ?")
            .bind(&id)
            .execute(db)
            .await;

        let _ = app.emit("download-status", serde_json::json!({
            "id": id,
            "status": "Downloading"
        }));

        let is_ytdlp = record.download_type == "ytdlp";
        let ctx = Arc::new(http::DownloadContext {
            id: id.clone(),
            url: record.url,
            save_path: record.save_path,
            threads: record.connections as usize,
            client: client.clone(),
            app: app.clone(),
            db: db.clone(),
            extra_meta: record.extra_meta,
        });

        let active_downloads_clone = active_downloads.clone();
        let id_for_cleanup = id.clone();
        let handle = tokio::spawn(async move {
            if is_ytdlp {
                stream::start_stream_download(ctx).await;
            } else {
                http::start_download(ctx).await;
            }
            active_downloads_clone.lock().unwrap().remove(&id_for_cleanup);
        });
        active_downloads.lock().unwrap().insert(id, handle);
    }
}

/// Parse a magnet URI and return (display_name, list_of_trackers)
fn parse_magnet(magnet: &str) -> (Option<String>, Vec<String>) {
    let mut name: Option<String> = None;
    let mut trackers: Vec<String> = Vec::new();
    // Strip "magnet:?" prefix
    let body = magnet.strip_prefix("magnet:?").unwrap_or(magnet);
    // Split on & (with unquoting support)
    for raw_param in body.split('&') {
        if raw_param.is_empty() {
            continue;
        }
        let mut split = raw_param.splitn(2, '=');
        let key = split.next().unwrap_or("");
        let value = split.next().unwrap_or("");
        let decoded = url_decode(value);
        match key {
            "dn" => {
                if !decoded.is_empty() {
                    name = Some(decoded);
                }
            }
            "tr" => {
                if !decoded.is_empty() {
                    trackers.push(decoded);
                }
            }
            _ => {}
        }
    }
    (name, trackers)
}

fn extract_magnet_infohash(magnet: &str) -> Option<String> {
    let body = magnet.strip_prefix("magnet:?").unwrap_or(magnet);
    for raw_param in body.split('&') {
        if let Some(rest) = raw_param.strip_prefix("xt=urn:btih:") {
            return Some(rest.split('&').next().unwrap_or(rest).to_string());
        }
    }
    None
}

fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_digit(bytes[i + 1]), hex_digit(bytes[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_digit(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}
