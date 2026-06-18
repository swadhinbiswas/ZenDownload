mod db;
mod engine;
mod grabber;
mod utils;
mod browser;

use engine::DownloadEngine;
use tauri::{Manager, Emitter, Runtime};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Handle zendown:// protocol URLs from the browser extension.
/// Format: zendown://add?url=<encoded>&page=<encoded>&cookies=<encoded>&format=<encoded>&title=<encoded>&threads=<n>
async fn handle_zendown_link(app: &tauri::AppHandle, raw_url: &str) {
    println!("[zendown] Received deep link: {}", raw_url);
    let engine = match app.try_state::<crate::engine::DownloadEngine>() {
        Some(e) => e.inner().clone(),
        None => {
            eprintln!("[zendown] Download engine not available");
            return;
        }
    };

    // Parse query parameters
    let mut url = String::new();
    let mut page_url = String::new();
    let mut cookies = String::new();
    let mut format = String::new();
    let mut title = String::new();
    let mut category: Option<String> = None;
    let mut threads: usize = 8;
    let mut user_agent = String::new();

    if let Some(query) = raw_url.strip_prefix("zendown://add?") {
        for pair in query.split('&') {
            if let Some((key, value)) = pair.split_once('=') {
                let decoded = urlencoding::decode(value).unwrap_or_else(|_| value.into()).into_owned();
                match key {
                    "url" => url = decoded,
                    "page" => page_url = decoded,
                    "cookies" => cookies = decoded,
                    "format" => format = decoded,
                    "title" => title = decoded,
                    "category" => category = Some(decoded),
                    "threads" => threads = value.parse().unwrap_or(8),
                    "ua" => user_agent = decoded,
                    _ => {}
                }
            }
        }
    }

    if url.is_empty() {
        eprintln!("[zendown] No URL in deep link");
        return;
    }

    // Build extra_meta JSON with all context
    let mut extra = serde_json::Map::new();
    extra.insert("source".into(), serde_json::Value::String("browser_extension".into()));
    if !page_url.is_empty() { extra.insert("page_url".into(), serde_json::Value::String(page_url.clone())); }
    if !title.is_empty() { extra.insert("page_title".into(), serde_json::Value::String(title)); }
    if !cookies.is_empty() { extra.insert("cookies".into(), serde_json::Value::String(cookies)); }
    if !format.is_empty() { extra.insert("format".into(), serde_json::Value::String(format)); }
    if !user_agent.is_empty() { extra.insert("user_agent".into(), serde_json::Value::String(user_agent)); }
    let extra_meta = if extra.len() > 1 {
        Some(serde_json::Value::Object(extra).to_string())
    } else {
        None
    };

    let save_path = engine::resolve_category_path(&engine.db, category.as_deref()).await;
    match engine.add_download(url, save_path, threads, category, extra_meta).await {
        Ok(id) => {
            println!("[zendown] Added download: {}", id);
            let _ = app.emit("downloads-updated", ());
        }
        Err(e) => {
            eprintln!("[zendown] Failed to add download: {}", e);
        }
    }
}

#[tauri::command]
async fn send_notification<R: Runtime>(
    app: tauri::AppHandle<R>,
    title: String,
    body: String,
    icon: Option<String>,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    let mut builder = app.notification().builder();
    builder = builder.title(&title).body(&body);
    if let Some(icon_path) = icon {
        builder = builder.icon(&icon_path);
    }
    builder.show().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn request_notification_permission<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<bool, String> {
    use tauri_plugin_notification::NotificationExt;
    match app.notification().request_permission() {
        Ok(state) => Ok(matches!(state, tauri_plugin_notification::PermissionState::Granted)),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn is_notification_permission_granted<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<bool, String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .permission_state()
        .map(|s| matches!(s, tauri_plugin_notification::PermissionState::Granted))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn enable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().enable().map_err(|e| e.to_string())
}

#[tauri::command]
async fn disable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().disable().map_err(|e| e.to_string())
}

#[tauri::command]
async fn is_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_download(
    url: String,
    save_path: String,
    threads: usize,
    category: Option<String>,
    extra_meta: Option<String>,
    engine: tauri::State<'_, DownloadEngine>
) -> Result<String, String> {
    let cleaned_url = strip_url_fragment(&url);
    let cleaned_path = match sanitize_save_path(&save_path) {
        Some(p) => expand_tilde(&p),
        None => return Err("Invalid save path".to_string()),
    };
    engine.add_download(cleaned_url, cleaned_path, threads, category, extra_meta).await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchDownloadItem {
    url: String,
    save_path: String,
    threads: usize,
    category: Option<String>,
    extra_meta: Option<String>,
}

#[tauri::command]
async fn add_downloads_batch(
    items: Vec<BatchDownloadItem>,
    engine: tauri::State<'_, DownloadEngine>
) -> Result<Vec<String>, String> {
    let mut batch_items = Vec::with_capacity(items.len());
    for item in items {
        let cleaned_url = strip_url_fragment(&item.url);
        let cleaned_path = match sanitize_save_path(&item.save_path) {
            Some(p) => expand_tilde(&p),
            None => return Err(format!("Invalid save path: {}", item.save_path)),
        };
        batch_items.push((cleaned_url, cleaned_path, item.threads, item.category, item.extra_meta));
    }
    engine.add_downloads_batch(batch_items).await
}

fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return format!("{}/{}", home.display(), rest);
        }
    }
    path.to_string()
}

/// Strip URL fragments (#...) and validate the path is usable.
/// Returns None if the path is empty or contains characters that are
/// clearly not valid filesystem path characters.
fn sanitize_save_path(path: &str) -> Option<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }
    // Reject paths containing control characters, NUL, or URL-fragment markers.
    // `#` is valid in a path on some filesystems but it almost always indicates
    // a leaked URL fragment that was meant to be stripped earlier.
    if trimmed.contains('#') {
        if let Some(idx) = trimmed.find('#') {
            let candidate = trimmed[..idx].trim_end_matches('/');
            if candidate.is_empty() {
                return None;
            }
            return Some(candidate.to_string());
        }
    }
    if trimmed.chars().any(|c| c.is_control() || c == '\0') {
        return None;
    }
    Some(trimmed.to_string())
}

/// Strip URL fragments from a URL. Some copy-pasted URLs include
/// `#anchor` parts that should never reach the download engine.
fn strip_url_fragment(url: &str) -> String {
    if let Some(idx) = url.find('#') {
        return url[..idx].to_string();
    }
    url.to_string()
}

#[tauri::command]
async fn get_downloads(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<crate::db::DownloadRecord>, String> {
    engine.get_all_downloads().await
}

#[tauri::command]
async fn scrape_site_grabber(url: String) -> Result<Vec<grabber::parser::GrabbedResource>, String> {
    grabber::parser::scrape_site(&url).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn probe_stream_url(
    url: String, 
    browser_for_cookies: Option<String>,
    cookies_path: Option<String>,
    extra_meta: Option<String>,
    app: tauri::AppHandle
) -> Result<engine::stream::StreamMetadata, String> {
    engine::stream::probe_stream_url(&url, browser_for_cookies, cookies_path, extra_meta, &app).await
}

#[tauri::command]
async fn probe_playlist_url(
    url: String,
    browser_for_cookies: Option<String>,
    cookies_path: Option<String>,
    extra_meta: Option<String>,
    app: tauri::AppHandle
) -> Result<engine::stream::PlaylistMetadata, String> {
    engine::stream::probe_playlist_url(&url, browser_for_cookies, cookies_path, extra_meta, &app).await
}

#[tauri::command]
async fn search_adult_site(
    site: String,
    query: String,
    app: tauri::AppHandle
) -> Result<Vec<engine::stream::AdultSearchResult>, String> {
    engine::stream::search_adult_site(&site, &query, &app).await
}

#[tauri::command]
async fn get_default_save_path() -> Result<String, String> {
    Ok(dirs::download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string()))
}

// ==================== PHASE 1.4: Checksum Verification ====================

#[tauri::command]
async fn compute_file_checksums(file_path: String) -> Result<engine::checksum::ChecksumResult, String> {
    engine::checksum::compute_checksums(&file_path).await
}

#[tauri::command]
async fn verify_file_checksum(file_path: String, expected_sha256: String) -> Result<bool, String> {
    engine::checksum::verify_checksum(&file_path, &expected_sha256).await
}

// ==================== PHASE 1.1/1.2: Native HLS/DASH ====================

#[tauri::command]
async fn probe_hls_playlist(url: String, referer: Option<String>) -> Result<engine::hls::HlsMetadata, String> {
    engine::hls::probe_hls(&url, referer).await
}

#[tauri::command]
async fn probe_dash_manifest(url: String, referer: Option<String>) -> Result<engine::dash::DashMetadata, String> {
    engine::dash::probe_dash(&url, referer).await
}

#[tauri::command]
async fn download_hls_stream(
    url: String,
    output_path: String,
    download_id: String,
    app: tauri::AppHandle,
    engine: tauri::State<'_, DownloadEngine>
) -> Result<String, String> {
    let metadata = engine::hls::probe_hls(&url, None).await?;
    engine::hls::download_hls(&app, &engine.db, &download_id, &metadata, &output_path, 8).await
}

#[tauri::command]
async fn download_dash_stream(
    url: String,
    output_path: String,
    download_id: String,
    app: tauri::AppHandle,
    _engine: tauri::State<'_, DownloadEngine>
) -> Result<String, String> {
    let metadata = engine::dash::probe_dash(&url, None).await?;
    engine::dash::download_dash(&app, &metadata, &output_path, 8).await.map_err(|e| e.to_string())?;
    Ok(download_id)
}

// ==================== PHASE 2.2: Scheduler ====================

#[tauri::command]
async fn add_scheduled_task(task: engine::scheduler::ScheduledTask, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine::scheduler::add_scheduled_task(&engine.db, &task).await
}

#[tauri::command]
async fn get_pending_scheduled_tasks(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::scheduler::ScheduledTask>, String> {
    engine::scheduler::get_pending_tasks(&engine.db).await
}

#[tauri::command]
async fn delete_scheduled_task(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine::scheduler::delete_scheduled_task(&engine.db, &id).await
}

// ==================== PHASE 2.3: Watch Folder ====================

#[tauri::command]
async fn add_watch_folder(config: engine::watch_folder::WatchFolderConfig, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.watch_folder_manager.add_watch(engine.app.clone(), engine.db.clone(), config).await
}

// ==================== PHASE 2.4: Duplicate Detection ====================

#[tauri::command]
async fn find_duplicates(file_name: String, size: i64, engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::dedup::DuplicateMatch>, String> {
    engine::dedup::find_duplicates(&engine.db, &file_name, size).await
}

// ==================== PHASE 2.5: Filename Cleaner ====================

#[tauri::command]
async fn clean_filename(input: String) -> Result<String, String> {
    Ok(engine::filename::clean_filename(&input))
}

#[tauri::command]
async fn render_filename_template(template: String, vars: std::collections::HashMap<String, String>) -> Result<String, String> {
    Ok(engine::filename::render_template(&template, &vars))
}

// ==================== PHASE 3.1: Native Messaging ====================

#[tauri::command]
async fn get_native_messaging_manifest(browser: String) -> Result<String, String> {
    Ok(engine::native_messaging::build_manifest_json(&browser))
}

#[tauri::command]
async fn get_native_messaging_manifest_path(browser: String) -> Result<String, String> {
    Ok(engine::native_messaging::get_native_messaging_manifest_path(&browser))
}

// ==================== PHASE 4.3: M3U/IPTV ====================

#[tauri::command]
async fn import_m3u_playlist(url: String, app: tauri::AppHandle) -> Result<Vec<engine::m3u::M3uEntry>, String> {
    engine::m3u::import_m3u_from_url(&app, &url).await
}

#[tauri::command]
async fn parse_m3u_content(content: String) -> Result<Vec<engine::m3u::M3uEntry>, String> {
    Ok(engine::m3u::parse_m3u(&content))
}

// ==================== PHASE 4.4: VirusTotal ====================

#[tauri::command]
async fn virustotal_check(api_key: String, file_hash: String) -> Result<engine::security::VtReport, String> {
    engine::security::check_hash(&api_key, &file_hash).await
}

// ==================== PHASE 5.2: Settings Backup/Restore ====================

#[tauri::command]
async fn export_settings_backup(output_path: String, engine: tauri::State<'_, DownloadEngine>) -> Result<String, String> {
    engine::settings_sync::export_to_json(&engine.db, &output_path).await
}

#[tauri::command]
async fn import_settings_backup(input_path: String, engine: tauri::State<'_, DownloadEngine>) -> Result<usize, String> {
    engine::settings_sync::import_from_json(&engine.db, &input_path).await
}

#[tauri::command]
async fn list_settings_backups(backup_dir: String) -> Result<Vec<String>, String> {
    engine::settings_sync::list_backup_files(&backup_dir)
}

// ==================== PHASE 5.3: Speed Test + Diagnostics ====================

#[tauri::command]
async fn run_speed_test_download(app: tauri::AppHandle) -> Result<engine::diagnostics::SpeedTestResult, String> {
    engine::diagnostics::run_download_speed_test(&app).await
}

#[tauri::command]
async fn run_speed_test_upload(app: tauri::AppHandle) -> Result<engine::diagnostics::SpeedTestResult, String> {
    engine::diagnostics::run_upload_speed_test(&app).await
}

#[tauri::command]
async fn ping_host(host: String) -> Result<f64, String> {
    engine::diagnostics::ping_host(&host).await
}

#[tauri::command]
async fn generate_diagnostics_report(engine: tauri::State<'_, DownloadEngine>) -> Result<engine::diagnostics::DiagnosticsReport, String> {
    engine::diagnostics::generate_diagnostics_report(&engine).await
}

#[tauri::command]
async fn run_full_speed_test(app: tauri::AppHandle) -> Result<engine::diagnostics::SpeedTestResult, String> {
    engine::diagnostics::run_full_speed_test(&app).await
}

#[tauri::command]
async fn run_multi_server_test(app: tauri::AppHandle) -> Result<Vec<engine::diagnostics::SpeedTestResult>, String> {
    engine::diagnostics::run_multi_server_test(&app).await
}

#[tauri::command]
async fn get_speed_test_history() -> Vec<engine::diagnostics::SpeedTestResult> {
    engine::diagnostics::get_speed_test_history()
}

#[tauri::command]
async fn search_music(
    query: String,
    source: String,
    app: tauri::AppHandle
) -> Result<engine::music::MusicSearchResult, String> {
    engine::music::search_music(&query, &source, &app).await
}

#[tauri::command]
async fn fetch_collection_tracks(
    url: String,
    app: tauri::AppHandle
) -> Result<engine::music::MusicCollection, String> {
    engine::music::platforms::fetch_collection_tracks(&url, &app).await
}

#[tauri::command]
async fn resolve_spotify_url(
    url: String,
    app: tauri::AppHandle
) -> Result<engine::music::MusicSearchResult, String> {
    use engine::music::spotify;

    let trimmed_url = url.trim();

    let (item_type, item_id) = spotify::parse_spotify_url(trimmed_url)
        .ok_or("Invalid Spotify URL. Supported formats:\n• https://open.spotify.com/track/ID\n• https://open.spotify.com/album/ID\n• https://open.spotify.com/playlist/ID\n• spotify:track:ID")?;

    match item_type {
        "track" => {
            let track_info = spotify::fetch_track_info(&item_id).await?;
            let search_query = spotify::spotify_to_search_query(&track_info);
            engine::music::platforms::search_all_platforms(
                &search_query,
                &engine::music::MusicPlatform::YouTubeMusic,
                &app
            ).await
        }
        "album" => {
            let album_info = spotify::fetch_collection_info("album", &item_id).await?;
            let search_query = format!("{} {}", album_info.owner, album_info.title);
            engine::music::platforms::search_all_platforms(
                &search_query,
                &engine::music::MusicPlatform::YouTubeMusic,
                &app
            ).await
        }
        "playlist" => {
            let playlist_info = spotify::fetch_collection_info("playlist", &item_id).await?;
            let search_query = format!("{} {}", playlist_info.owner, playlist_info.title);
            engine::music::platforms::search_all_platforms(
                &search_query,
                &engine::music::MusicPlatform::YouTubeMusic,
                &app
            ).await
        }
        _ => Err("Unsupported Spotify item type. Only tracks, albums, and playlists are supported.".to_string()),
    }
}

#[tauri::command]
async fn get_audio_formats() -> Vec<engine::music::AudioFormat> {
    engine::music::AudioFormat::all()
}

#[tauri::command]
async fn download_music(
    url: String,
    save_dir: String,
    options: engine::music::MusicDownloadOptions,
    engine: tauri::State<'_, DownloadEngine>
) -> Result<String, String> {
    let resolved_dir = expand_tilde(&save_dir);
    engine::music::download_music(url, resolved_dir, options, &engine).await
}

#[tauri::command]
async fn pause_download(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.pause_download(id).await
}

#[tauri::command]
async fn refresh_download_link(id: String, new_url: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    sqlx::query("UPDATE downloads SET url = ?, status = 'Pending', error_msg = NULL WHERE id = ?")
        .bind(&new_url)
        .bind(&id)
        .execute(&engine.db)
        .await
        .map_err(|e| e.to_string())?;
        
    let _ = engine.app.emit("download-status", serde_json::json!({
        "id": id,
        "status": "Pending"
    }));
    
    // Optionally auto-resume
    engine.resume_download(id).await
}

#[tauri::command]
async fn resume_download(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.resume_download(id).await
}

#[tauri::command]
async fn pause_all_downloads(engine: tauri::State<'_, DownloadEngine>) -> Result<u32, String> {
    engine.pause_all_downloads().await
}

#[tauri::command]
async fn resume_all_downloads(engine: tauri::State<'_, DownloadEngine>) -> Result<u32, String> {
    engine.resume_all_downloads().await
}

#[tauri::command]
async fn cancel_download(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.cancel_download(id).await
}

#[tauri::command]
async fn delete_download(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.delete_download(id).await
}

#[tauri::command]
async fn add_torrent_file(
    file_path: String,
    save_path: String,
    engine: tauri::State<'_, DownloadEngine>
) -> Result<String, String> {
    let cleaned_path = match sanitize_save_path(&save_path) {
        Some(p) => expand_tilde(&p),
        None => return Err("Invalid save path".to_string()),
    };
    let resolved_path = cleaned_path;
    let bytes = tokio::fs::read(&file_path).await
        .map_err(|e| format!("Failed to read torrent file: {}", e))?;
    let new_id = uuid::Uuid::new_v4().to_string();

    // Insert into DB
    let pool = engine.db.clone();
    let file_name = std::path::Path::new(&file_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "torrent".to_string());

    let save_dir = std::path::Path::new(&resolved_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| resolved_path.clone());

    let category = crate::utils::metadata::guess_category(&file_name);

    sqlx::query(
        "INSERT INTO downloads (id, url, file_name, save_path, category, status, download_type, connections, created_at, extra_meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&new_id)
    .bind(&file_path)
    .bind(&file_name)
    .bind(&save_dir)
    .bind(&category)
    .bind("Downloading")
    .bind("torrent")
    .bind(8i64)
    .bind(chrono::Utc::now().to_rfc3339())
    .bind(None::<String>)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Background metadata fetch
    let pool_clone = pool.clone();
    let file_name_clone = file_name.clone();
    let download_id_clone = new_id.clone();
    let app_clone = engine.app.clone();
    let cat_clone = category.clone();
    
    tokio::spawn(async move {
        if let Some(metadata) = crate::utils::metadata::fetch_metadata(&file_name_clone, &cat_clone).await {
            if let Ok(json_str) = serde_json::to_string(&metadata) {
                let _ = sqlx::query("UPDATE downloads SET extra_meta = ? WHERE id = ?")
                    .bind(json_str.clone())
                    .bind(&download_id_clone)
                    .execute(&pool_clone)
                    .await;
                    
                let _ = app_clone.emit("metadata-updated", serde_json::json!({
                    "id": download_id_clone,
                    "extra_meta": json_str
                }));
            }
        }
    });

    engine.torrent_engine.write().await.add_torrent_file(bytes, save_dir.clone(), new_id.clone()).await?;

    let _ = engine.app.emit("download-status", serde_json::json!({
        "id": new_id,
        "status": "Downloading"
    }));

    Ok(new_id)
}

#[tauri::command]
async fn torrent_list_files(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<crate::engine::torrent_extras::TorrentFileEntry>, String> {
    engine.torrent_engine.read().await.list_files(&id).await
}

#[tauri::command]
async fn torrent_get_health(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<String, String> {
    engine.torrent_engine.read().await.get_torrent_health(&id).await
}

#[tauri::command]
async fn search_torrents(query: String) -> Result<Vec<engine::torrent_search::TorrentResult>, String> {
    Ok(engine::torrent_search::search_all(&query).await)
}

#[tauri::command]
async fn discover_torrents() -> Result<Vec<engine::torrent_discover::TrendingTorrent>, String> {
    Ok(engine::torrent_discover::fetch_trending().await)
}

#[tauri::command]
async fn preview_torrent(magnet: String) -> Result<serde_json::Value, String> {
    use librqbit::{Session, AddTorrent, AddTorrentOptions};
    use std::path::PathBuf;
    let dl_dir = dirs::download_dir().unwrap_or_else(|| PathBuf::from("."));
    let session = Session::new(dl_dir).await.map_err(|e| e.to_string())?;
    let add = AddTorrent::from_url(&magnet);
    let response = session.add_torrent(add, Some(AddTorrentOptions::default()))
        .await.map_err(|e| format!("Failed: {:?}", e))?;
    let handle = match response {
        librqbit::AddTorrentResponse::AlreadyManaged(_, h) => h,
        librqbit::AddTorrentResponse::Added(_, h) => h,
        _ => return Err("Torrent metadata not available".into()),
    };
    let name = handle.name().unwrap_or_default();
    let info = handle.with_metadata(|m| {
        let files: Vec<serde_json::Value> = m.file_infos.iter().map(|f| {
            serde_json::json!({ "path": f.relative_filename.to_string_lossy().to_string(), "size": f.len })
        }).collect();
        let total = m.file_infos.iter().map(|f| f.len).sum::<u64>();
        serde_json::json!({
            "name": name, "total_size": total,
            "file_count": m.file_infos.len(), "files": files,
        })
    }).unwrap_or(serde_json::json!({ "name": name, "total_size": 0, "file_count": 0, "files": [] }));
    Ok(info)
}

#[tauri::command]
async fn get_subscriptions(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<crate::engine::automation::Subscription>, String> {
    sqlx::query_as::<_, crate::engine::automation::Subscription>("SELECT id, name, url, sub_type, enabled, interval_minutes, include_keywords, exclude_keywords, category, last_checked, last_error FROM subscriptions ORDER BY id DESC")
        .fetch_all(&engine.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_subscription(
    sub: crate::engine::automation::SubscriptionInput,
    engine: tauri::State<'_, DownloadEngine>
) -> Result<(), String> {
    sqlx::query("INSERT INTO subscriptions (name, url, sub_type, enabled, interval_minutes, include_keywords, exclude_keywords, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(sub.name)
        .bind(sub.url)
        .bind(sub.sub_type)
        .bind(sub.enabled.unwrap_or(true) as i64)
        .bind(sub.interval_minutes.unwrap_or(60))
        .bind(sub.include_keywords)
        .bind(sub.exclude_keywords)
        .bind(sub.category.unwrap_or_else(|| "General".to_string()))
        .execute(&engine.db)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_subscription(id: i64, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    sqlx::query("DELETE FROM subscriptions WHERE id = ?")
        .bind(id)
        .execute(&engine.db)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_updates(app: tauri::AppHandle) -> Result<engine::updates::UpdateState, String> {
    engine::updates::check_for_updates(&app).await
}

#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    engine::updates::install_update(&app).await
}

#[tauri::command]
async fn get_history(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<crate::db::DownloadRecord>, String> {
    sqlx::query_as::<_, crate::db::DownloadRecord>("SELECT * FROM downloads WHERE status = 'Completed' ORDER BY completed_at DESC, created_at DESC")
        .fetch_all(&engine.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_runtime_settings(settings: engine::runtime_settings::RuntimeSettingsInput, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    if let Some(max_concurrent) = settings.max_concurrent_downloads {
        let clamped = max_concurrent.clamp(1, 3);
        *engine.max_concurrent.lock().await = clamped;
    }
    engine::runtime_settings::save_runtime_settings(&engine.db, settings).await
}

#[tauri::command]
async fn run_subscription_now(id: i64, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    crate::engine::automation::run_subscription_now(id, &engine.db, &engine.app).await
}

#[tauri::command]
async fn set_subscription_enabled(id: i64, enabled: bool, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    crate::engine::automation::set_subscription_enabled(id, enabled, &engine.db).await
}

/// Discover available RSSHub routes from a running RSSHub instance
#[tauri::command]
async fn discover_rsshub_routes(rsshub_url: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let base = rsshub_url.unwrap_or_else(|| "https://rsshub.app".to_string());
    let url = format!("{}/api/routes?lang=en", base.trim_end_matches('/'));
    let resp = reqwest::get(&url).await.map_err(|e| format!("Cannot reach RSSHub: {}", e))?;
    let data: serde_json::Value = resp.json().await.map_err(|e| format!("Bad response: {}", e))?;
    let routes = if let Some(r) = data.get("data") {
        r.as_object().map(|obj| {
            obj.iter().map(|(name, info)| {
                serde_json::json!({
                    "name": name,
                    "description": info.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                    "routes": info.get("routes"),
                })
            }).collect()
        }).unwrap_or_default()
    } else {
        vec![]
    };
    Ok(routes)
}

#[tauri::command]
async fn set_download_speed_limit(
    id: String,
    limit_kb: i64,
    engine: tauri::State<'_, DownloadEngine>,
) -> Result<(), String> {
    sqlx::query("UPDATE downloads SET speed_limit = ? WHERE id = ?")
        .bind(limit_kb)
        .bind(&id)
        .execute(&engine.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn parse_network_entries(entries: Vec<crate::engine::browser::sniffer::NetworkEntry>) -> Result<Vec<crate::engine::browser::sniffer::SniffedStream>, String> {
    let mut streams = Vec::new();
    for entry in entries {
        if let Some(stream) = crate::engine::browser::sniffer::parse_network_entry(&entry) {
            streams.push(stream);
        }
    }
    Ok(crate::engine::browser::sniffer::merge_streams(streams))
}

#[tauri::command]
async fn detect_stream_from_url(url: String) -> Result<Vec<crate::engine::browser::sniffer::SniffedStream>, String> {
    let stream_type = crate::engine::browser::sniffer::StreamType::from_url(&url);
    if stream_type == crate::engine::browser::sniffer::StreamType::Unknown {
        return Ok(vec![]);
    }

    let site = crate::engine::browser::sniffer::extract_site_from_url(&url)
        .unwrap_or_else(|| "Unknown".to_string());
    let quality = crate::engine::browser::sniffer::extract_quality_from_url(&url);

    Ok(vec![crate::engine::browser::sniffer::SniffedStream {
        url,
        stream_type,
        quality,
        mime_type: None,
        title: None,
        duration: None,
        site: Some(site),
    }])
}

#[tauri::command]
async fn fetch_iptv_channels(url: String) -> Result<Vec<crate::engine::iptv::IptvChannel>, String> {
    crate::engine::iptv::fetch_iptv_channels(&url).await
}

#[tauri::command]
async fn fetch_iptv_channels_chunked(
    app: tauri::AppHandle,
    url: String,
) -> Result<usize, String> {
    crate::engine::iptv::fetch_iptv_channels_chunked(&app, &url).await
}

#[tauri::command]
fn get_cached_iptv_channels() -> Option<Vec<crate::engine::iptv::IptvChannel>> {
    crate::engine::iptv::get_cached_channels()
}

#[tauri::command]
fn get_cached_iptv_summary() -> Option<crate::engine::iptv::ChannelSummary> {
    crate::engine::iptv::get_cached_summary()
}

#[tauri::command]
fn clear_iptv_cache() {
    crate::engine::iptv::clear_cache()
}

#[tauri::command]
async fn check_link(url: String) -> Result<crate::engine::link_checker::LinkCheckResult, String> {
    crate::engine::link_checker::check_link(&url).await
}

#[tauri::command]
async fn check_links_batch(urls: Vec<String>) -> Result<Vec<crate::engine::link_checker::LinkCheckResult>, String> {
    Ok(crate::engine::link_checker::check_links_batch(&urls).await)
}

#[derive(serde::Serialize)]
struct ApiServerStatus {
    enabled: bool,
    running: bool,
    port: u16,
    url: String,
}

#[tauri::command]
async fn get_api_server_status(engine: tauri::State<'_, DownloadEngine>) -> Result<ApiServerStatus, String> {
    let settings = engine::runtime_settings::load_runtime_settings(&engine.db).await;
    Ok(ApiServerStatus {
        enabled: settings.api_server_enabled,
        running: settings.api_server_enabled,
        port: settings.api_server_port,
        url: format!("http://127.0.0.1:{}", settings.api_server_port),
    })
}

#[tauri::command]
async fn set_api_server_enabled(enabled: bool, port: u16, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine::runtime_settings::save_runtime_settings(&engine.db, engine::runtime_settings::RuntimeSettingsInput {
        api_server_enabled: Some(enabled),
        api_server_port: if port > 0 { Some(port) } else { None },
        ..Default::default()
    }).await?;
    Ok(())
}

#[tauri::command]
async fn read_text_file(path: String, max_bytes: usize) -> Result<String, String> {
    if std::path::Path::new(&path).is_dir() {
        return Err("Cannot preview a directory. Select a file.".into());
    }
    use std::io::Read;
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buffer = vec![0u8; max_bytes];
    let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
    buffer.truncate(n);
    String::from_utf8(buffer).map_err(|e| format!("Not valid UTF-8: {}", e))
}

#[tauri::command]
async fn serve_file(path: String) -> Result<String, String> {
    if std::path::Path::new(&path).is_dir() {
        return Err("Cannot preview a directory. Select a file.".into());
    }
    use std::io::Read;
    let mut file = std::fs::File::open(&path).map_err(|e| format!("Cannot open file: {}", e))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| format!("Cannot read file: {}", e))?;

    let mime = match std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    };

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buffer);
    Ok(format!("data:{};base64,{}", mime, b64))
}

// ============== User Custom IPTV Playlists ==============

#[derive(serde::Serialize, serde::Deserialize)]
struct UserPlaylist {
    id: i64,
    name: String,
    url: String,
    country_code: String,
    enabled: bool,
    created_at: String,
}

#[tauri::command]
async fn add_user_playlist(name: String, url: String, country_code: String, engine: tauri::State<'_, DownloadEngine>) -> Result<i64, String> {
    sqlx::query(
        "INSERT INTO user_playlists (name, url, country_code) VALUES (?, ?, ?)"
    )
    .bind(&name)
    .bind(&url)
    .bind(&country_code)
    .execute(&engine.db)
    .await
    .map_err(|e| e.to_string())?;
    let id = sqlx::query_scalar::<_, i64>("SELECT last_insert_rowid()")
        .fetch_one(&engine.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
async fn list_user_playlists(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<UserPlaylist>, String> {
    sqlx::query_as::<_, (i64, String, String, String, i64, String)>("SELECT id, name, url, country_code, enabled, created_at FROM user_playlists ORDER BY name")
        .fetch_all(&engine.db)
        .await
        .map_err(|e| e.to_string())
        .map(|rows| rows.into_iter().map(|(id, name, url, country_code, enabled, created_at)| UserPlaylist { id, name, url, country_code, enabled: enabled != 0, created_at }).collect())
}

#[tauri::command]
async fn delete_user_playlist(id: i64, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    sqlx::query("DELETE FROM user_playlists WHERE id = ?")
        .bind(id)
        .execute(&engine.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn import_custom_m3u(url: String, _country_code: String, _engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::m3u::M3uEntry>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let content = client.get(&url).send().await
        .map_err(|e| format!("Failed to fetch M3U: {}", e))?
        .text().await
        .map_err(|e| format!("Failed to read M3U: {}", e))?;
    let entries = engine::m3u::parse_m3u(&content);
    Ok(entries)
}

#[derive(serde::Serialize)]
struct ArchiveEntry {
    name: String,
    size: u64,
    is_dir: bool,
}

#[tauri::command]
async fn list_archive(path: String) -> Result<Vec<ArchiveEntry>, String> {
    let p = std::path::Path::new(&path);
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "zip" => list_zip(p).await,
        "tar" | "tgz" | "gz" | "bz2" | "xz" => list_tar(p).await,
        _ => Err(format!("Unsupported archive format: {}", ext)),
    }
}

async fn list_zip(p: &std::path::Path) -> Result<Vec<ArchiveEntry>, String> {
    let f = std::fs::File::open(p).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for i in 0..zip.len() {
        let entry = zip.by_index(i).map_err(|e| e.to_string())?;
        entries.push(ArchiveEntry {
            name: entry.name().to_string(),
            size: entry.size(),
            is_dir: entry.is_dir(),
        });
    }
    Ok(entries)
}

async fn list_tar(p: &std::path::Path) -> Result<Vec<ArchiveEntry>, String> {
    let f = std::fs::File::open(p).map_err(|e| e.to_string())?;
    let mut tar = tar::Archive::new(f);
    let mut entries = Vec::new();
    for entry in tar.entries().map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let header = entry.header();
        entries.push(ArchiveEntry {
            name: entry.path().map(|p| p.display().to_string()).unwrap_or_default(),
            size: header.size().unwrap_or(0),
            is_dir: header.entry_type().is_dir(),
        });
    }
    Ok(entries)
}

#[tauri::command]
fn get_conversion_presets() -> Vec<crate::engine::converter::ConversionPreset> {
    crate::engine::converter::get_all_presets()
}

#[tauri::command]
fn get_compatible_presets(file_path: String) -> Vec<crate::engine::converter::ConversionPreset> {
    crate::engine::converter::get_compatible_presets(&file_path)
}

#[tauri::command]
async fn convert_file(input_path: String, preset_id: String, download_id: String) -> Result<crate::engine::converter::ConvertProgress, String> {
    crate::engine::converter::convert_file(&input_path, &preset_id, &download_id).await
}

#[tauri::command]
async fn analyze_site(config: crate::engine::site_grabber::SiteGrabberConfig, job_id: String, app: tauri::AppHandle) -> Result<crate::engine::site_grabber::GrabberResult, String> {
    crate::engine::site_grabber::analyze_site(config, app, job_id).await
}

#[tauri::command]
async fn download_grabbed_files(files: Vec<crate::engine::site_grabber::FoundFile>, save_path: String, app: tauri::AppHandle) -> Result<u32, String> {
    crate::engine::site_grabber::download_grabbed_files(files, save_path, app).await
}

#[tauri::command]
async fn capture_links_from_page(url: String) -> Result<Vec<crate::engine::site_grabber::FoundFile>, String> {
    use std::time::Duration;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("ZenDownload/1.0 (Link Capture)")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| format!("Failed to fetch page: {}", e))?;
    let html = resp.text().await.map_err(|e| format!("Failed to read page: {}", e))?;
    let base_parsed = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let patterns = ["href=", "src=", "data-src="];
    for pattern in &patterns {
        let mut start = 0;
        while let Some(pos) = html[start..].find(pattern) {
            let abs_pos = start + pos + pattern.len();
            let remaining = &html[abs_pos..];
            let trimmed = remaining.trim_start();
            let abs_pos = abs_pos + (remaining.len() - trimmed.len());
            let quote = trimmed.chars().next();
            if quote != Some('"') && quote != Some('\'') {
                start = abs_pos + 1;
                continue;
            }
            let quote_char = quote.unwrap();
            let after_quote = &trimmed[1..];
            if let Some(end) = after_quote.find(quote_char) {
                let raw_url = &after_quote[..end];
                let resolved = base_parsed.join(raw_url).ok().map(|u| u.to_string()).unwrap_or_else(|| raw_url.to_string());
                if !resolved.starts_with("http") || seen.contains(&resolved) {
                    start = abs_pos + 1 + end;
                    continue;
                }
                seen.insert(resolved.clone());
                if let Some((filename, ext)) = is_downloadable_file(&resolved) {
                    results.push(crate::engine::site_grabber::FoundFile {
                        url: resolved,
                        file_name: filename,
                        file_type: ext,
                        file_size: None,
                        source_page: url.clone(),
                        depth: 0,
                    });
                }
                start = abs_pos + 1 + end;
            } else {
                break;
            }
        }
    }

    Ok(results)
}

fn is_downloadable_file(url: &str) -> Option<(String, String)> {
    let downloadable = ["zip", "rar", "7z", "tar", "gz", "bz2", "exe", "msi", "apk", "dmg", "iso", "img",
                       "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md",
                       "mp4", "mkv", "avi", "webm", "mov", "flv", "wmv", "3gp",
                       "mp3", "wav", "flac", "aac", "ogg", "m4a", "opus", "wma",
                       "jpg", "jpeg", "png", "gif", "svg", "webp", "bmp",
                       "torrent"];
    let clean = url.split('?').next()?;
    let filename = clean.rsplit('/').next()?;
    if let Some(dot_pos) = filename.rfind('.') {
        let ext = &filename[dot_pos + 1..].to_lowercase();
        if downloadable.contains(&ext.as_str()) {
            return Some((filename.to_string(), ext.to_string()));
        }
    }
    None
}

// ============================================================================
// Phase 3-8 Commands: Smart Queue, Profiles, Health, Debrid, Clipboard,
// Plugins, Mirror Network, Analytics
// ============================================================================

#[tauri::command]
async fn list_schedules(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::schedule::Schedule>, String> {
    Ok(engine.schedule_engine.list_schedules().await)
}

#[tauri::command]
async fn upsert_schedule(schedule: engine::schedule::Schedule, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.schedule_engine.upsert_schedule(schedule).await
}

#[tauri::command]
async fn delete_schedule(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.schedule_engine.delete_schedule(&id).await
}

#[tauri::command]
async fn pause_queue(engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.schedule_engine.pause().await;
    Ok(())
}

#[tauri::command]
async fn resume_queue(engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.schedule_engine.resume().await;
    Ok(())
}

#[tauri::command]
async fn get_queue_stats(engine: tauri::State<'_, DownloadEngine>) -> Result<engine::schedule::QueueStats, String> {
    Ok(engine.schedule_engine.stats().await)
}

#[tauri::command]
async fn list_profiles(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::profiles::DownloadProfile>, String> {
    Ok(engine.profile_manager.list().await)
}

#[tauri::command]
async fn get_profile(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<Option<engine::profiles::DownloadProfile>, String> {
    Ok(engine.profile_manager.get(&id).await)
}

#[tauri::command]
async fn upsert_profile(profile: engine::profiles::DownloadProfile, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.profile_manager.upsert(profile).await
}

#[tauri::command]
async fn delete_profile(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.profile_manager.delete(&id).await
}

#[tauri::command]
async fn match_url_to_profile(url: String, engine: tauri::State<'_, DownloadEngine>) -> Result<Option<engine::profiles::DownloadProfile>, String> {
    Ok(engine.profile_manager.match_url(&url).await)
}

#[tauri::command]
async fn list_health_checks(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::health_monitor::HealthCheck>, String> {
    Ok(engine.health_monitor.list_checks().await)
}

#[tauri::command]
async fn get_health_config(engine: tauri::State<'_, DownloadEngine>) -> Result<engine::health_monitor::HealthConfig, String> {
    Ok(engine.health_monitor.get_config().await)
}

#[tauri::command]
async fn set_health_config(config: engine::health_monitor::HealthConfig, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.health_monitor.set_config(config).await;
    Ok(())
}

#[tauri::command]
async fn list_debrid_accounts(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::debrid::DebridAccount>, String> {
    Ok(engine.debrid_manager.list_accounts().await)
}

#[tauri::command]
async fn upsert_debrid_account(account: engine::debrid::DebridAccount, engine: tauri::State<'_, DownloadEngine>) -> Result<String, String> {
    engine.debrid_manager.upsert_account(account).await
}

#[tauri::command]
async fn delete_debrid_account(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.debrid_manager.delete_account(&id).await
}

#[tauri::command]
async fn verify_debrid_account(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<engine::debrid::DebridStatus, String> {
    engine.debrid_manager.verify_account(&id).await
}

#[tauri::command]
async fn list_debrid_statuses(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::debrid::DebridStatus>, String> {
    Ok(engine.debrid_manager.list_statuses().await)
}

#[tauri::command]
async fn debrid_unrestrict(url: String, engine: tauri::State<'_, DownloadEngine>) -> Result<String, String> {
    engine.debrid_manager.unrestrict(&url).await
}

#[tauri::command]
async fn list_detected_urls(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::clipboard_intel::DetectedUrl>, String> {
    Ok(engine.clipboard_intel.list_detected().await)
}

#[tauri::command]
async fn get_clipboard_config(engine: tauri::State<'_, DownloadEngine>) -> Result<engine::clipboard_intel::ClipboardConfig, String> {
    Ok(engine.clipboard_intel.get_config().await)
}

#[tauri::command]
async fn set_clipboard_config(config: engine::clipboard_intel::ClipboardConfig, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.clipboard_intel.set_config(config).await;
    Ok(())
}

#[tauri::command]
async fn ignore_detected_url(url: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.clipboard_intel.ignore(&url).await;
    Ok(())
}

#[tauri::command]
async fn clear_detected_urls(engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.clipboard_intel.clear().await;
    Ok(())
}

#[tauri::command]
async fn get_clipboard_text(engine: tauri::State<'_, DownloadEngine>) -> Result<String, String> {
    Ok(engine.clipboard_intel.get_last_clipboard().await)
}

#[tauri::command]
async fn list_plugins(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::plugin_system::Plugin>, String> {
    Ok(engine.plugin_manager.list().await)
}

#[tauri::command]
async fn install_plugin(plugin: engine::plugin_system::Plugin, engine: tauri::State<'_, DownloadEngine>) -> Result<String, String> {
    engine.plugin_manager.install(plugin).await
}

#[tauri::command]
async fn uninstall_plugin(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.plugin_manager.uninstall(&id).await
}

#[tauri::command]
async fn enable_plugin(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.plugin_manager.enable(&id).await
}

#[tauri::command]
async fn disable_plugin(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.plugin_manager.disable(&id).await
}

#[tauri::command]
async fn list_plugin_hooks(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::plugin_system::PluginHook>, String> {
    Ok(engine.plugin_manager.list_hooks().await)
}

#[tauri::command]
async fn list_ui_plugins(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::plugin_system::Plugin>, String> {
    Ok(engine.plugin_manager.list_ui().await)
}

#[tauri::command]
async fn get_plugin(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<Option<engine::plugin_system::Plugin>, String> {
    Ok(engine.plugin_manager.get(&id).await)
}

#[tauri::command]
async fn update_plugin_config(id: String, config: serde_json::Value, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.plugin_manager.update_config(&id, config).await
}

#[tauri::command]
async fn get_plugin_config_schema(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::plugin_system::ConfigOption>, String> {
    if let Some(plugin) = engine.plugin_manager.get(&id).await {
        Ok(plugin.config_schema)
    } else {
        Err("Plugin not found".into())
    }
}

#[tauri::command]
async fn fetch_plugin_catalog(url: String) -> Result<Vec<engine::plugin_system::CatalogPlugin>, String> {
    engine::plugin_system::PluginManager::fetch_catalog(&url).await
}

#[tauri::command]
async fn list_mirrors(engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::mirror_network::Mirror>, String> {
    Ok(engine.mirror_network.list().await)
}

#[tauri::command]
async fn add_mirror(mirror: engine::mirror_network::Mirror, engine: tauri::State<'_, DownloadEngine>) -> Result<String, String> {
    engine.mirror_network.add(mirror).await
}

#[tauri::command]
async fn remove_mirror(id: String, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.mirror_network.remove(&id).await
}

#[tauri::command]
async fn get_mirror_config(engine: tauri::State<'_, DownloadEngine>) -> Result<engine::mirror_network::MirrorConfig, String> {
    Ok(engine.mirror_network.get_config().await)
}

#[tauri::command]
async fn set_mirror_config(config: engine::mirror_network::MirrorConfig, engine: tauri::State<'_, DownloadEngine>) -> Result<(), String> {
    engine.mirror_network.set_config(config).await;
    Ok(())
}

#[tauri::command]
async fn get_analytics_summary(engine: tauri::State<'_, DownloadEngine>) -> Result<engine::analytics::AnalyticsSummary, String> {
    Ok(engine.analytics.get_summary().await)
}

#[tauri::command]
async fn get_recent_analytics(limit: usize, engine: tauri::State<'_, DownloadEngine>) -> Result<Vec<engine::analytics::DownloadStat>, String> {
    Ok(engine.analytics.get_recent_stats(limit).await)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|_app, argv, _cwd| {
            println!("A new instance was opened with: {argv:?}");
        }))
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Force-set window icon from PNG embedded at compile time
            if let Some(window) = app.get_webview_window("main") {
                let png_bytes = include_bytes!("../icons/128x128.png");
                if let Ok(img) = tauri::image::Image::from_bytes(png_bytes) {
                    let _ = window.set_icon(img);
                }
            }

            // Check for --minimized flag (set by autostart on boot)
            let args: Vec<String> = std::env::args().collect();
            if args.iter().any(|a| a == "--minimized") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // Dispatch Background Browser Interceptor
            let ws_handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                browser::ws_server::start_ws_server(ws_handle).await;
            });

            // Dispatch Automatic OS Clipboard scraping loop
            browser::clipboard::start_clipboard_monitor(app_handle.clone());
            
            // Generate System Tray native icon map gracefully
            #[cfg(desktop)]
            {
                use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

                let show_i = MenuItem::with_id(app, "show", "Show ZenDownload", true, None::<&str>)?;
                let hide_i = MenuItem::with_id(app, "hide", "Hide to Tray", true, None::<&str>)?;
                let sep1 = PredefinedMenuItem::separator(app)?;
                let pause_i = MenuItem::with_id(app, "pause_all", "Pause All Downloads", true, None::<&str>)?;
                let resume_i = MenuItem::with_id(app, "resume_all", "Resume All Downloads", true, None::<&str>)?;
                let sep2 = PredefinedMenuItem::separator(app)?;
                let add_i = MenuItem::with_id(app, "add", "Add New Download", true, None::<&str>)?;
                let open_folder_i = MenuItem::with_id(app, "open_folder", "Open Downloads Folder", true, None::<&str>)?;
                let sep3 = PredefinedMenuItem::separator(app)?;
                let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
                let about_i = MenuItem::with_id(app, "about", "About ZenDownload", true, None::<&str>)?;
                let sep4 = PredefinedMenuItem::separator(app)?;
                let quit_i = MenuItem::with_id(app, "quit", "Quit ZenDownload", true, None::<&str>)?;

                let menu = Menu::with_items(app, &[
                    &show_i, &hide_i, &sep1,
                    &pause_i, &resume_i, &sep2,
                    &add_i, &open_folder_i, &sep3,
                    &settings_i, &about_i, &sep4,
                    &quit_i,
                ])?;

                let tray_icon = tauri::image::Image::from_bytes(
                    include_bytes!("../icons/128x128.png")
                ).ok();
                let _tray = TrayIconBuilder::new()
                    .icon(tray_icon.unwrap_or_else(|| app.default_window_icon().unwrap().clone()))
                    .tooltip("ZenDownload - UDM Engine Active")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(move |app, event| {
                        match event.id().as_ref() {
                            "show" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "hide" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.hide();
                                }
                            }
                            "pause_all" => {
                                let _ = app.emit("tray-action", "pause_all");
                            }
                            "resume_all" => {
                                let _ = app.emit("tray-action", "resume_all");
                            }
                            "add" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                                let _ = app.emit("tray-action", "add");
                            }
                            "open_folder" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                }
                                let _ = app.emit("tray-action", "open_folder");
                            }
                            "settings" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                                let _ = app.emit("tray-action", "settings");
                            }
                            "about" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                                let _ = app.emit("tray-action", "about");
                            }
                            "quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    })
                    .build(app)?;
            }

            tauri::async_runtime::block_on(async move {
                match db::init_db(&app_handle).await {
                    Ok(pool) => {
                        println!("Database initialized successfully.");
                        let engine = DownloadEngine::new(pool, app_handle.clone());
                        let runtime_pool = engine.db.clone();

                        // Load settings and apply max_concurrent BEFORE managing engine
                        let settings = engine::runtime_settings::load_runtime_settings(&runtime_pool).await;
                        let max_conc = settings.max_concurrent_downloads.clamp(1, 3);
                        *engine.max_concurrent.lock().await = max_conc;
                        println!("Max concurrent downloads set to {}", max_conc);

                        // Initialize torrent engine with default download path
                        let default_path = dirs::download_dir()
                            .map(|p| p.to_string_lossy().to_string())
                            .unwrap_or_else(|| ".".to_string());
                        if let Err(e) = engine.init_torrent_engine(default_path).await {
                            eprintln!("Failed to initialize torrent engine: {}", e);
                        } else {
                            println!("Torrent engine initialized successfully.");
                        }
                        engine.start_queue_poller();

                        app_handle.manage(engine);

                        if settings.cloud_mirroring_enabled {
                            println!("Cloud mirroring enabled for {}", settings.cloud_mirroring_provider);
                        }

                        // Start REST API server only if enabled in settings (off by default for security)
                        let api_db = runtime_pool.clone();
                        if settings.api_server_enabled {
                            let port = std::env::var("ZENDOWNLOAD_API_PORT")
                                .ok()
                                .and_then(|p| p.parse().ok())
                                .unwrap_or(settings.api_server_port);
                            println!("Starting REST API server on port {}", port);
                            let api_app = app_handle.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = engine::api_server::start_api_server(api_db, port, api_app).await {
                                    eprintln!("API server error: {}", e);
                                }
                            });
                        } else {
                            println!("REST API server disabled (enable in Settings → Advanced → API Server)");
                        }

                        // Deep link handler for zendown:// protocol
                        use tauri_plugin_deep_link::DeepLinkExt;
                        app_handle.deep_link().register("zendown").ok();
                        let dl_handle = app_handle.clone();
                        app.deep_link().on_open_url(move |event| {
                            for url in event.urls() {
                                let url_str = url.to_string();
                                if url_str.starts_with("zendown://") {
                                    let h = dl_handle.clone();
                                    let u = url_str.clone();
                                    tauri::async_runtime::spawn(async move {
                                        handle_zendown_link(&h, &u).await;
                                    });
                                }
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("Failed to initialize database: {}", e);
                    }
                }
            });
            Ok(())
        })
        // === Phase 3-8: Smart Queue, Profiles, Health, Debrid, Clipboard, Plugins, Mirrors, Analytics ===
        .invoke_handler(tauri::generate_handler![
            greet,
            add_download,
            add_downloads_batch,
            get_downloads,
            scrape_site_grabber,
            probe_stream_url,
            probe_playlist_url,
            search_music,
            fetch_collection_tracks,
            get_audio_formats,
            resolve_spotify_url,
            download_music,
            resume_download,
            pause_all_downloads,
            resume_all_downloads,
            pause_download,
            refresh_download_link,
            cancel_download,
            delete_download,
            add_torrent_file,
            torrent_list_files,
            torrent_get_health,
            search_torrents,
            discover_torrents,
            preview_torrent,
            get_subscriptions,
            add_subscription,
            delete_subscription,
            save_runtime_settings,
            run_subscription_now,
            set_subscription_enabled,
            discover_rsshub_routes,
            check_updates,
            install_update,
            get_history,
            search_adult_site,
            get_default_save_path,
            // Phase 1.4: Checksum
            compute_file_checksums,
            verify_file_checksum,
            // Phase 1.1/1.2: HLS/DASH
            probe_hls_playlist,
            probe_dash_manifest,
            download_hls_stream,
            download_dash_stream,
            // Phase 2.2: Scheduler
            add_scheduled_task,
            get_pending_scheduled_tasks,
            delete_scheduled_task,
            // Phase 2.3: Watch folder
            add_watch_folder,
            // Phase 2.4: Dedup
            find_duplicates,
            // Phase 2.5: Filename cleaner
            clean_filename,
            render_filename_template,
            // Phase 3.1: Native messaging
            get_native_messaging_manifest,
            get_native_messaging_manifest_path,
            // Phase 4.3: M3U
            import_m3u_playlist,
            parse_m3u_content,
            // Phase 4.4: VirusTotal
            virustotal_check,
            // Phase 5.2: Settings backup
            export_settings_backup,
            import_settings_backup,
            list_settings_backups,
            // Phase 5.3: Speed test + diagnostics
            run_speed_test_download,
            run_speed_test_upload,
            ping_host,
            generate_diagnostics_report,
            run_full_speed_test,
            run_multi_server_test,
            get_speed_test_history,
            // Phase 3.2: Video stream sniffer
            parse_network_entries,
            detect_stream_from_url,
            // Per-download speed limit
            set_download_speed_limit,
            // IPTV live TV
            fetch_iptv_channels,
            fetch_iptv_channels_chunked,
            get_cached_iptv_channels,
            get_cached_iptv_summary,
            clear_iptv_cache,
            // Link Checker
            check_link,
            check_links_batch,
            // Format Converter
            get_conversion_presets,
            get_compatible_presets,
            convert_file,
            // Site Grabber
            analyze_site,
            download_grabbed_files,
            capture_links_from_page,
            // Notifications & Autostart
            send_notification,
            request_notification_permission,
            is_notification_permission_granted,
            enable_autostart,
            disable_autostart,
            is_autostart_enabled,
            // Phase 3-8: Smart Queue, Profiles, Health, Debrid, Clipboard, Plugins, Mirrors, Analytics
            list_schedules,
            upsert_schedule,
            delete_schedule,
            pause_queue,
            resume_queue,
            get_queue_stats,
            list_profiles,
            get_profile,
            upsert_profile,
            delete_profile,
            match_url_to_profile,
            list_health_checks,
            get_health_config,
            set_health_config,
            list_debrid_accounts,
            upsert_debrid_account,
            delete_debrid_account,
            verify_debrid_account,
            list_debrid_statuses,
            debrid_unrestrict,
            list_detected_urls,
            get_clipboard_config,
            set_clipboard_config,
            ignore_detected_url,
            clear_detected_urls,
            get_clipboard_text,
            list_plugins,
            install_plugin,
            uninstall_plugin,
            enable_plugin,
            disable_plugin,
            list_plugin_hooks,
            list_ui_plugins,
            get_plugin,
            update_plugin_config,
            get_plugin_config_schema,
            fetch_plugin_catalog,
            list_mirrors,
            add_mirror,
            remove_mirror,
            get_mirror_config,
            set_mirror_config,
            get_analytics_summary,
            get_recent_analytics,
            // File Preview
            read_text_file,
            serve_file,
            list_archive,
            // API Server
            get_api_server_status,
            set_api_server_enabled,
            // User Custom IPTV Playlists
            add_user_playlist,
            list_user_playlists,
            delete_user_playlist,
            import_custom_m3u,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                // Close-to-tray: hide window instead of exiting
                // This keeps downloads running in background
                if let Some(win) = app_handle.get_webview_window(&label) {
                    let _ = win.hide();
                }
                api.prevent_close();
            }
            _ => {}
        });
}
