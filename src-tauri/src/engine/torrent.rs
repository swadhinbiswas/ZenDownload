use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use librqbit::{
    Session, SessionOptions, SessionPersistenceConfig,
    AddTorrent, AddTorrentOptions, AddTorrentResponse,
    ManagedTorrent,
    PeerConnectionOptions, generate_azereus_style,
};

#[derive(Clone, Serialize, Deserialize)]
pub struct TorrentPeerStats {
    pub active_peers: usize,
    pub total_peers: usize,
    pub down_speed: u64,
    pub up_speed: u64,
    pub progress: f64,
    pub downloaded: u64,
    pub uploaded: u64,
    pub total_size: u64,
}

#[derive(Clone)]
struct TorrentEntry {
    handle: Arc<ManagedTorrent>,
    download_id: String,
    torrent_id: usize,
    completed: Arc<AtomicBool>,
    output_folder: PathBuf,
}

/// Well-known public BitTorrent trackers used as fallback for all torrents.
fn public_trackers() -> HashSet<url::Url> {
    let urls = [
        // UDP trackers
        "udp://tracker.openbittorrent.com:6969/announce",
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://tracker.torrent.eu.org:451/announce",
        "udp://open.stealth.si:80/announce",
        "udp://tracker-udp.gbitt.info:80/announce",
        "udp://opentracker.i2p.rocks:6969/announce",
        "udp://open.tracker.cl:1337/announce",
        "udp://tracker.auctor.tv:6969/announce",
        "udp://tracker.leech.ie:1337/announce",
        "udp://exodus.desync.com:6969/announce",
        "udp://tracker1.bt.moack.co.kr:80/announce",
        "udp://tracker.moeking.me:6969/announce",
        "udp://p4p.arenabg.com:1337/announce",
        "udp://explodie.org:6969/announce",
        // HTTPS trackers (more reliable, work behind firewalls)
        "https://tracker.bt-hash.com:443/announce",
        "https://tracker.tamersunion.org:443/announce",
        "https://tracker.lilsqueed.org:443/announce",
        "https://tr.burnabyhighstar.com:443/announce",
    ];
    urls.iter()
        .filter_map(|u| url::Url::parse(u).ok())
        .collect()
}

fn dht_persistence_path() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(|| std::env::temp_dir())
        .join("zendownload")
        .join("dht.json")
}

fn session_persistence_path() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(|| std::env::temp_dir())
        .join("zendownload")
        .join("session_persistence")
}

fn peer_opts() -> PeerConnectionOptions {
    PeerConnectionOptions {
        connect_timeout: Some(Duration::from_secs(15)),
        read_write_timeout: Some(Duration::from_secs(120)),
        keep_alive_interval: Some(Duration::from_secs(30)),
    }
}

pub struct TorrentEngine {
    session: Arc<RwLock<Option<Arc<Session>>>>,
    torrents: Arc<RwLock<HashMap<String, TorrentEntry>>>,
    app: AppHandle,
    db: sqlx::Pool<sqlx::Sqlite>,
}

impl TorrentEngine {
    pub fn new(app: AppHandle, db: sqlx::Pool<sqlx::Sqlite>) -> Self {
        Self {
            session: Arc::new(RwLock::new(None)),
            torrents: Arc::new(RwLock::new(HashMap::new())),
            app,
            db,
        }
    }

    /// After session restore, repopulate `self.torrents` from DB records that are
    /// active (Downloading/Queued) but not yet in the map.
    async fn repopulate_tracked_torrents(&self) {
        let session_guard = self.session.read().await;
        let session = match session_guard.as_ref() {
            Some(s) => s.clone(),
            None => return,
        };
        drop(session_guard);

        let records = sqlx::query_as::<_, crate::db::DownloadRecord>(
            "SELECT * FROM downloads WHERE download_type = 'torrent' AND status IN ('Downloading', 'Queued', 'Paused')"
        )
        .fetch_all(&self.db)
        .await
        .unwrap_or_default();

        let mut torrents_guard = self.torrents.write().await;
        for record in records {
            if torrents_guard.contains_key(&record.id) {
                continue;
            }

            // Try to find the torrent in the session by scanning all managed torrents
            // librqbit session doesn't expose a "list all" method, so we try adding
            // the torrent URL/bytes again — if AlreadyManaged is returned, we get the handle
            let opts = AddTorrentOptions {
                overwrite: true,
                output_folder: Some(record.save_path.clone()),
                only_files: None,
                initial_peers: None,
                list_only: false,
                peer_opts: Some(peer_opts()),
                ..Default::default()
            };

            let add_result = if record.url.starts_with("magnet:") {
                session.add_torrent(AddTorrent::from_url(&record.url), Some(opts)).await
            } else {
                // For .torrent URLs, we can't re-download (link may have expired).
                // Skip silently — the user will need to re-add.
                continue;
            };

            match add_result {
                Ok(AddTorrentResponse::Added(id, h)) | Ok(AddTorrentResponse::AlreadyManaged(id, h)) => {
                    let entry = TorrentEntry {
                        handle: h.clone(),
                        download_id: record.id.clone(),
                        torrent_id: id,
                        completed: Arc::new(AtomicBool::new(record.status == "Completed")),
                        output_folder: PathBuf::from(&record.save_path),
                    };
                    torrents_guard.insert(record.id, entry);
                    println!("[torrent] Restored tracked torrent: {}", record.url);
                }
                Ok(_) => {
                    println!("[torrent] Skipped unexpected response for {}", record.url);
                }
                Err(e) => {
                    eprintln!("[torrent] Failed to restore torrent {}: {:?}", record.url, e);
                }
            }
        }
    }

    pub async fn initialize(&self, save_path: String) -> Result<(), String> {
        let path = PathBuf::from(&save_path);
        std::fs::create_dir_all(&path).map_err(|e| format!("Failed to create save dir: {}", e))?;

        // Ensure DHT persistence directory exists
        if let Some(parent) = dht_persistence_path().parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let session_opts = SessionOptions {
            disable_dht: false,
            // Enable DHT persistence so the routing table survives restarts.
            // A warm routing table = much faster peer discovery.
            disable_dht_persistence: false,
            dht_config: Some(librqbit::dht::PersistentDhtConfig {
                dump_interval: Some(Duration::from_secs(60)),
                config_filename: Some(dht_persistence_path()),
            }),
            fastresume: true,
            // Enable session persistence so torrent states are remembered
            persistence: Some(SessionPersistenceConfig::Json {
                folder: Some(session_persistence_path()),
            }),
            // Spoof as qBittorrent 4.5.2 for tracker whitelists and ratio systems.
            // Trackers see the peer_id in announce requests — -qB4520- means qBittorrent.
            peer_id: Some(generate_azereus_style(*b"qB", (4, 5, 2, 0))),
            peer_opts: Some(peer_opts()),
            // Wide listen port range for many concurrent connections
            listen_port_range: Some(6881u16..6999),
            enable_upnp_port_forwarding: true,
            // 64 MB write buffer (in bytes) — prevents disk I/O from bottlenecking fast swarms
            defer_writes_up_to: Some(64 * 1024 * 1024),
            default_storage_factory: None,
            socks_proxy_url: None,
            cancellation_token: None,
            concurrent_init_limit: Some(16),
            root_span: None,
            ratelimits: Default::default(),
            blocklist_url: None,
            // Always add public trackers as fallback
            trackers: public_trackers(),
        };

        let session = Session::new_with_opts(path.clone(), session_opts)
            .await
            .map_err(|e| format!("Failed to create torrent session: {:?}", e))?;

        *self.session.write().await = Some(session.clone());

        // After session restore, repopulate tracked torrents from DB
        self.repopulate_tracked_torrents().await;

        // Spawn stats polling loop
        let torrents = self.torrents.clone();
        let db = self.db.clone();
        let app = self.app.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(800));
            loop {
                interval.tick().await;
                let guard = torrents.read().await;
                let entries: Vec<TorrentEntry> = guard.values().cloned().collect();
                drop(guard);

                for entry in entries {
                    // Resolve and emit the real torrent name once metadata is known.
                    // This fixes the truncated "1B5869A3F5..." display for fresh magnets.
                    if let Some(name) = entry.handle.name() {
                        if !name.is_empty() {
                            let _ = app.emit("download-filename", serde_json::json!({
                                "id": entry.download_id,
                                "filename": name,
                            }));
                        }
                    }

                    let stats = entry.handle.stats();
                    // Prefer sum of per-file progress (counts bytes actually on disk per file)
                    // over `progress_bytes` which can lag during verification.
                    let file_sum: u64 = stats.file_progress.iter().sum();
                    let downloaded = if file_sum > 0 { file_sum } else { stats.progress_bytes };
                    let uploaded = stats.uploaded_bytes;
                    let total_size = stats.total_bytes;
                    let finished = stats.finished;

                    let (down_speed, up_speed, active_peers, total_peers) = stats.live.map(|live| {
                        let ds = (live.download_speed.mbps * 1024.0 * 1024.0 / 8.0) as u64;
                        let us = (live.upload_speed.mbps * 1024.0 * 1024.0 / 8.0) as u64;
                        let ap = live.snapshot.peer_stats.live;
                        let tp = live.snapshot.peer_stats.seen;
                        (ds, us, ap, tp)
                    }).unwrap_or((0, 0, 0, 0));

                    let progress = if total_size > 0 {
                        (downloaded as f64 / total_size as f64) * 100.0
                    } else {
                        0.0
                    };

                    let _ = app.emit("download-progress", serde_json::json!({
                        "id": entry.download_id,
                        "downloaded": downloaded,
                        "speed": down_speed,
                    }));

                    if total_size > 0 {
                        let _ = app.emit("download-size", serde_json::json!({
                            "id": entry.download_id,
                            "size": total_size,
                        }));
                    }

                    if (finished || (progress >= 100.0 && downloaded >= total_size && total_size > 0))
                        && !entry.completed.load(Ordering::SeqCst)
                    {
                        entry.completed.store(true, Ordering::SeqCst);

                        let _ = app.emit("download-status", serde_json::json!({
                            "id": entry.download_id,
                            "status": "Completed",
                        }));

                        // Get the output folder and first file path for completion flow
                        let file_paths: Vec<String> = entry.handle.with_metadata(|m| {
                            m.file_infos.iter().map(|f| {
                                entry.output_folder.join(&f.relative_filename).to_string_lossy().to_string()
                            }).collect()
                        }).unwrap_or_default();

                        let first_file = file_paths.first().cloned().unwrap_or_else(|| {
                            entry.output_folder.to_string_lossy().to_string()
                        });

                        // Run full completion flow: sorting, AV scan, cloud mirroring, history
                        let db_for_completion = db.clone();
                        let entry_for_completion = entry.clone();
                        let app_for_completion = app.clone();
                        tokio::spawn(async move {
                            let extra_meta = sqlx::query_scalar::<_, Option<String>>("SELECT extra_meta FROM downloads WHERE id = ?")
                                .bind(&entry_for_completion.download_id)
                                .fetch_one(&db_for_completion)
                                .await
                                .unwrap_or(None);

                            let _ = crate::engine::completion::finalize_completed_download(
                                &db_for_completion,
                                &entry_for_completion.download_id,
                                &first_file,
                                extra_meta.as_deref(),
                            ).await;

                            // Fire file.postprocess hook for plugins
                            if let Some(engine) = app_for_completion.try_state::<crate::engine::DownloadEngine>() {
                                engine.plugin_manager.fire("file.postprocess", serde_json::json!({
                                    "id": entry_for_completion.download_id.clone(),
                                    "path": first_file.clone(),
                                })).await;
                            }
                        });
                    }

                    let peer_stats = TorrentPeerStats {
                        active_peers,
                        total_peers,
                        down_speed,
                        up_speed,
                        progress,
                        downloaded,
                        uploaded,
                        total_size,
                    };
                    let _ = app.emit("torrent-stats", serde_json::json!({
                        "id": entry.download_id,
                        "stats": peer_stats,
                    }));
                }
            }
        });

        Ok(())
    }

    pub async fn add_magnet(&self, magnet_uri: String, save_path: String, download_id: String, trackers: Vec<String>) -> Result<String, String> {
        let session_guard = self.session.read().await;
        let session = session_guard.as_ref().ok_or("Torrent session not initialized")?;

        let output_folder = PathBuf::from(&save_path);

        // Pass trackers from the magnet link so peers can find each other even
        // if the default trackers are down (common with public magnets).
        let mut opts = AddTorrentOptions {
            overwrite: true,
            output_folder: Some(save_path),
            only_files: None,
            initial_peers: None,
            list_only: false,
            peer_opts: Some(peer_opts()),
            ..Default::default()
        };
        if !trackers.is_empty() {
            opts.trackers = Some(trackers);
        }

        let add = AddTorrent::from_url(magnet_uri);
        let response = session.add_torrent(add, Some(opts))
            .await
            .map_err(|e| format!("Failed to add magnet: {:?}", e))?;

        let (torrent_id, handle) = match response {
            AddTorrentResponse::Added(id, h) | AddTorrentResponse::AlreadyManaged(id, h) => (id, h),
            _ => return Err("Unexpected add torrent response".to_string()),
        };

        let entry = TorrentEntry {
            handle: handle.clone(),
            download_id: download_id.clone(),
            torrent_id,
            completed: Arc::new(AtomicBool::new(false)),
            output_folder,
        };

        self.torrents.write().await.insert(download_id.clone(), entry);
        Ok(download_id)
    }

    pub async fn add_torrent_file(&self, torrent_bytes: Vec<u8>, save_path: String, download_id: String) -> Result<String, String> {
        let session_guard = self.session.read().await;
        let session = session_guard.as_ref().ok_or("Torrent session not initialized")?;

        let output_folder = PathBuf::from(&save_path);

        let opts = AddTorrentOptions {
            overwrite: true,
            output_folder: Some(save_path),
            only_files: None,
            initial_peers: None,
            list_only: false,
            peer_opts: Some(peer_opts()),
            ..Default::default()
        };

        let add = AddTorrent::from_bytes(torrent_bytes);
        let response = session.add_torrent(add, Some(opts))
            .await
            .map_err(|e| format!("Failed to add torrent file: {:?}", e))?;

        let (torrent_id, handle) = match response {
            AddTorrentResponse::Added(id, h) | AddTorrentResponse::AlreadyManaged(id, h) => (id, h),
            _ => return Err("Unexpected add torrent response".to_string()),
        };

        let entry = TorrentEntry {
            handle: handle.clone(),
            download_id: download_id.clone(),
            torrent_id,
            completed: Arc::new(AtomicBool::new(false)),
            output_folder,
        };

        self.torrents.write().await.insert(download_id.clone(), entry);
        Ok(download_id)
    }

    pub async fn pause_torrent(&self, download_id: &str) -> Result<(), String> {
        let guard = self.torrents.read().await;
        if let Some(entry) = guard.get(download_id) {
            let session_guard = self.session.read().await;
            if let Some(session) = session_guard.as_ref() {
                session.pause(&entry.handle)
                    .await
                    .map_err(|e| format!("Failed to pause torrent: {:?}", e))?;
            }
        }
        Ok(())
    }

    pub async fn resume_torrent(&self, download_id: &str) -> Result<(), String> {
        let guard = self.torrents.read().await;
        if let Some(entry) = guard.get(download_id) {
            let session_guard = self.session.read().await;
            if let Some(session) = session_guard.as_ref() {
                session.unpause(&entry.handle)
                    .await
                    .map_err(|e| format!("Failed to resume torrent: {:?}", e))?;
            }
        }
        Ok(())
    }

    pub async fn is_tracked(&self, download_id: &str) -> bool {
        self.torrents.read().await.contains_key(download_id)
    }

    pub async fn delete_torrent(&self, download_id: &str, delete_files: bool) -> Result<(), String> {
        let mut guard = self.torrents.write().await;
        if let Some(entry) = guard.remove(download_id) {
            let session_guard = self.session.read().await;
            if let Some(session) = session_guard.as_ref() {
                use librqbit::api::TorrentIdOrHash;
                session.delete(TorrentIdOrHash::Id(entry.torrent_id), delete_files)
                    .await
                    .map_err(|e| format!("Failed to delete torrent: {:?}", e))?;
            }
        }
        Ok(())
    }

    pub async fn get_output_folder(&self, download_id: &str) -> Option<PathBuf> {
        let guard = self.torrents.read().await;
        let entry = guard.get(download_id)?;
        Some(entry.output_folder.clone())
    }

    pub async fn get_file_paths(&self, download_id: &str) -> Option<Vec<PathBuf>> {
        let guard = self.torrents.read().await;
        let entry = guard.get(download_id)?;
        let output_folder = entry.output_folder.clone();
        let files = entry.handle.with_metadata(|m| {
            m.file_infos.iter().map(|f| {
                output_folder.join(&f.relative_filename)
            }).collect::<Vec<_>>()
        }).unwrap_or_default();
        Some(files)
    }

    pub async fn get_stats(&self, download_id: &str) -> Option<TorrentPeerStats> {
        let guard = self.torrents.read().await;
        let entry = guard.get(download_id)?;
        let stats = entry.handle.stats();

        let downloaded = stats.progress_bytes;
        let uploaded = stats.uploaded_bytes;
        let total_size = stats.total_bytes;

        let (down_speed, up_speed, active_peers, total_peers) = stats.live.map(|live| {
            let ds = (live.download_speed.mbps * 1024.0 * 1024.0 / 8.0) as u64;
            let us = (live.upload_speed.mbps * 1024.0 * 1024.0 / 8.0) as u64;
            let ap = live.snapshot.peer_stats.live;
            let tp = live.snapshot.peer_stats.seen;
            (ds, us, ap, tp)
        }).unwrap_or((0, 0, 0, 0));

        let progress = if total_size > 0 {
            (downloaded as f64 / total_size as f64) * 100.0
        } else {
            0.0
        };

        Some(TorrentPeerStats {
            active_peers,
            total_peers,
            down_speed,
            up_speed,
            progress,
            downloaded,
            uploaded,
            total_size,
        })
    }
}

async fn mirror_torrent_files(
    entry: &TorrentEntry,
    pool: &sqlx::Pool<sqlx::Sqlite>,
    app: &AppHandle,
) {
    let output_folder = entry.output_folder.clone();

    let files: Vec<PathBuf> = entry.handle.with_metadata(|m| {
        m.file_infos.iter().map(|f| {
            output_folder.join(&f.relative_filename)
        }).collect::<Vec<_>>()
    }).unwrap_or_default();

    if files.is_empty() {
        return;
    }

    let runtime = crate::engine::runtime_settings::load_runtime_settings(pool).await;
    if !runtime.cloud_mirroring_enabled {
        return;
    }

    let token = match &runtime.cloud_access_token {
        Some(t) if !t.is_empty() => t.clone(),
        _ => return,
    };

    let folder_id = runtime.cloud_folder_id.clone().unwrap_or_default();
    let provider = &runtime.cloud_mirroring_provider;

    for file_path in &files {
        if !file_path.exists() {
            continue;
        }
        if let Err(err) = crate::engine::cloud::CloudDriveEngine::upload_file_to_node(
            provider,
            &file_path.to_string_lossy(),
            &folder_id,
            &token,
        ).await {
            eprintln!("Torrent cloud mirroring failed for {}: {}", file_path.display(), err);
        } else {
            println!("Torrent cloud mirrored: {}", file_path.display());
        }
    }

    let _ = app.emit("download-status", serde_json::json!({
        "id": entry.download_id,
        "status": "CloudMirrored",
    }));
}

impl Clone for TorrentEngine {
    fn clone(&self) -> Self {
        Self {
            session: self.session.clone(),
            torrents: self.torrents.clone(),
            app: self.app.clone(),
            db: self.db.clone(),
        }
    }
}

impl TorrentEngine {
    /// List files in torrent
    pub async fn list_files(&self, download_id: &str) -> Result<Vec<crate::engine::torrent_extras::TorrentFileEntry>, String> {
        use crate::engine::torrent_extras::TorrentFileEntry;
        let torrents = self.torrents.read().await;
        let entry = torrents.get(download_id).ok_or_else(|| "Torrent not found".to_string())?;
        let files = entry.handle.with_metadata(|m| {
            m.file_infos.iter().enumerate().map(|(i, f)| {
                TorrentFileEntry { index: i, path: f.relative_filename.to_string_lossy().to_string(), size: f.len, selected: true }
            }).collect::<Vec<_>>()
        }).unwrap_or_default();
        Ok(files)
    }

    /// Get health based on active peers
    pub async fn get_torrent_health(&self, download_id: &str) -> Result<String, String> {
        let torrents = self.torrents.read().await;
        let entry = torrents.get(download_id).ok_or_else(|| "Torrent not found".to_string())?;
        let stats = entry.handle.stats();
        let peers = stats.live.map_or(0, |l| l.snapshot.peer_stats.live);
        Ok(match peers { 0 => "dead", 1..=4 => "poor", 5..=19 => "decent", 20..=99 => "good", _ => "excellent" }.into())
    }
}
