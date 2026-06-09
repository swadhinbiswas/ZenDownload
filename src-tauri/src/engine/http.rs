use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use reqwest::Client;

use std::path::Path;
use std::sync::atomic::{AtomicI64, Ordering};

pub struct DownloadContext {
    pub id: String,
    pub url: String,
    pub save_path: String,
    pub threads: usize,
    pub client: Client,
    pub app: AppHandle,
    pub db: sqlx::Pool<sqlx::Sqlite>,
    pub extra_meta: Option<String>,
}

#[derive(serde::Serialize, Clone)]
struct ProgressPayload {
    id: String,
    downloaded: i64,
    speed: f64,
}

#[derive(sqlx::FromRow)]
struct DbSegment {
    seg_index: i64,
    range_start: i64,
    range_end: i64,
    downloaded: i64,
}

#[derive(serde::Serialize, Clone)]
struct StatusPayload {
    id: String,
    status: String,
}

pub async fn start_download(ctx: Arc<DownloadContext>) {
    println!("Starting download for {}", ctx.url);
    
    // Notify frontend: Downloading
    let _ = ctx.app.emit("download-status", StatusPayload {
        id: ctx.id.clone(),
        status: "Downloading".to_string(),
    });
    
    update_db_status(&ctx.db, &ctx.id, "Downloading").await;

    match run_download_loop(&ctx).await {
        Ok(_) => {
            println!("Download complete for {}", ctx.id);
            
            // Post-processing hook
            let save_dir = sqlx::query_scalar::<_, String>("SELECT save_path FROM downloads WHERE id = ?")
                .bind(&ctx.id)
                .fetch_one(&ctx.db).await.unwrap_or_else(|_| ctx.save_path.clone());
            let file_name = sqlx::query_scalar::<_, String>("SELECT file_name FROM downloads WHERE id = ?")
                .bind(&ctx.id)
                .fetch_one(&ctx.db).await.unwrap_or_default();
                
            let full_path = std::path::Path::new(&save_dir).join(&file_name).to_string_lossy().to_string();
            
            let extra_meta_str = sqlx::query_scalar::<_, Option<String>>("SELECT extra_meta FROM downloads WHERE id = ?")
                .bind(&ctx.id)
                .fetch_one(&ctx.db).await.unwrap_or(None);
                
            let _ = crate::engine::completion::finalize_completed_download(
                &ctx.db,
                &ctx.id,
                &full_path,
                extra_meta_str.as_deref(),
            ).await;

            // Fire file.postprocess hook for plugins
            if let Some(engine) = ctx.app.try_state::<crate::engine::DownloadEngine>() {
                engine.plugin_manager.fire("file.postprocess", serde_json::json!({
                    "id": ctx.id.clone(),
                    "path": full_path.clone(),
                })).await;
            }

            let _ = ctx.app.emit("download-status", StatusPayload {
                id: ctx.id.clone(),
                status: "Completed".to_string(),
            });
            update_db_status(&ctx.db, &ctx.id, "Completed").await;
            if let Some(engine) = ctx.app.try_state::<crate::engine::DownloadEngine>() {
                engine.plugin_manager.fire("download.complete", serde_json::json!({
                    "id": ctx.id.clone(),
                })).await;
            }
        }
        Err(e) => {
            eprintln!("Download failed: {}", e);
            let _ = ctx.app.emit("download-status", StatusPayload {
                id: ctx.id.clone(),
                status: "Error".to_string(),
            });
            update_db_status(&ctx.db, &ctx.id, "Error").await;
            if let Some(engine) = ctx.app.try_state::<crate::engine::DownloadEngine>() {
                engine.plugin_manager.fire("download.error", serde_json::json!({
                    "id": ctx.id.clone(),
                    "error": e.to_string(),
                })).await;
            }
        }
    }
    
}

async fn run_download_loop(ctx: &Arc<DownloadContext>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut size: Option<i64> = None;
    let mut accepts_ranges = false;
    let mut content_type: Option<String> = None;
    let mut filename_from_header: Option<String> = None;
    let mut is_redirect_page = false;
    
    // Try HEAD first (single attempt, longer timeout for slow servers)
    let head_timeout = tokio::time::Duration::from_secs(15);
    match tokio::time::timeout(head_timeout, ctx.client.head(&ctx.url).send()).await {
        Ok(Ok(resp)) => {
            if let Some(s) = resp.headers().get("content-length")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<i64>().ok()) 
            {
                size = Some(s);
            }
            accepts_ranges = resp.headers().get("accept-ranges")
                .and_then(|v| v.to_str().ok()) == Some("bytes");
            
            content_type = resp.headers().get("content-type")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            
            if let Some(cd) = resp.headers().get("content-disposition") {
                if let Ok(cd_str) = cd.to_str() {
                    if let Some(pos) = cd_str.find("filename*=UTF-8''") {
                        let name = &cd_str[pos + 17..];
                        if !name.is_empty() {
                            filename_from_header = Some(urlencoding_decode(name));
                        }
                    } else if let Some(pos) = cd_str.find("filename=\"") {
                        let name = &cd_str[pos + 10..];
                        if let Some(end) = name.find('"') {
                            filename_from_header = Some(name[..end].to_string());
                        }
                    } else if let Some(pos) = cd_str.find("filename=") {
                        let name = &cd_str[pos + 9..];
                        let name = name.trim_matches('"').trim_matches('\'');
                        if !name.is_empty() {
                            filename_from_header = Some(name.to_string());
                        }
                    }
                }
            }
            
            // Detect if server returned an HTML page (redirect/interstitial)
            if let Some(ref ct) = content_type {
                if ct.contains("text/html") {
                    is_redirect_page = true;
                }
            }
        }
        Ok(Err(_)) => {
            // HEAD failed, proceed to GET probe
        }
        Err(_) => {
            // HEAD timed out, proceed to GET probe
        }
    }
    
    // If HEAD didn't get size or got HTML, try GET with Range header (lightweight probe)
    if size.is_none() || !accepts_ranges || filename_from_header.is_none() || is_redirect_page {
        match ctx.client.get(&ctx.url)
            .header("Range", "bytes=0-0")
            .send()
            .await 
        {
            Ok(resp) => {
                if let Some(range) = resp.headers().get("content-range") {
                    if let Ok(range_str) = range.to_str() {
                        if let Some(total) = range_str.split('/').nth(1) {
                            if let Ok(s) = total.parse::<i64>() {
                                size = Some(s);
                            }
                        }
                    }
                    accepts_ranges = true;
                } else if resp.status() == reqwest::StatusCode::PARTIAL_CONTENT {
                    accepts_ranges = true;
                }
                
                if size.is_none() {
                    size = resp.headers().get("content-length")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.parse::<i64>().ok());
                }
                
                if !accepts_ranges {
                    accepts_ranges = resp.headers().get("accept-ranges")
                        .and_then(|v| v.to_str().ok()) == Some("bytes");
                }
                
                if content_type.is_none() {
                    content_type = resp.headers().get("content-type")
                        .and_then(|v| v.to_str().ok())
                        .map(|s| s.to_string());
                    
                    // Re-check for HTML
                    if let Some(ref ct) = content_type {
                        if ct.contains("text/html") {
                            is_redirect_page = true;
                        }
                    }
                }
                
                if filename_from_header.is_none() {
                    if let Some(cd) = resp.headers().get("content-disposition") {
                        if let Ok(cd_str) = cd.to_str() {
                            if let Some(pos) = cd_str.find("filename*=UTF-8''") {
                                let name = &cd_str[pos + 17..];
                                if !name.is_empty() {
                                    filename_from_header = Some(urlencoding_decode(name));
                                }
                            } else if let Some(pos) = cd_str.find("filename=\"") {
                                let name = &cd_str[pos + 10..];
                                if let Some(end) = name.find('"') {
                                    filename_from_header = Some(name[..end].to_string());
                                }
                            } else if let Some(pos) = cd_str.find("filename=") {
                                let name = &cd_str[pos + 9..];
                                let name = name.trim_matches('"').trim_matches('\'');
                                if !name.is_empty() {
                                    filename_from_header = Some(name.to_string());
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("[http] Range probe failed for {}: {}", ctx.url, e);
            }
        }
    }
    
    // If server returned HTML for a non-HTML URL, it's likely an interstitial/redirect page
    // Try a direct GET to follow any redirects and get the actual binary
    if is_redirect_page {
        eprintln!("[http] Server returned HTML for binary URL, following redirects: {}", ctx.url);
        match ctx.client.get(&ctx.url).send().await {
            Ok(resp) => {
                if resp.status().is_redirection() {
                    eprintln!("[http] Redirect detected: {}", resp.status());
                }
                // Re-check content-type from the follow-up response
                let follow_up_ct = resp.headers().get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());

                // If the follow-up response is binary, clear HTML detection flag
                if let Some(ref ct) = follow_up_ct {
                    if !ct.contains("text/html") {
                        is_redirect_page = false;
                    }
                }

                if size.is_none() {
                    size = resp.headers().get("content-length")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.parse::<i64>().ok());
                }
                if content_type.is_none() {
                    content_type = follow_up_ct;
                }
                if filename_from_header.is_none() {
                    if let Some(cd) = resp.headers().get("content-disposition") {
                        if let Ok(cd_str) = cd.to_str() {
                            if let Some(pos) = cd_str.find("filename*=UTF-8''") {
                                let name = &cd_str[pos + 17..];
                                if !name.is_empty() {
                                    filename_from_header = Some(urlencoding_decode(name));
                                }
                            } else if let Some(pos) = cd_str.find("filename=\"") {
                                let name = &cd_str[pos + 10..];
                                if let Some(end) = name.find('"') {
                                    filename_from_header = Some(name[..end].to_string());
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("[http] Direct GET after HTML detection failed: {}", e);
            }
        }
    }

    // If all probes returned HTML, this is a landing page, not a downloadable file
    if is_redirect_page {
        if let Some(ref ct) = content_type {
            if ct.contains("text/html") {
                return Err("Server returned an HTML page instead of a file. This URL is likely a website landing page, not a direct download link. Try using the actual file URL.".into());
            }
        }
    }
    
    // Update database with size and content-type in single query
    if size.is_some() || content_type.is_some() {
        let mut update_query = String::from("UPDATE downloads SET");
        let mut first = true;
        
        if let Some(s) = size {
            update_query.push_str(" total_size = ?");
            first = false;
            
            let _ = ctx.app.emit("download-size", serde_json::json!({
                "id": ctx.id,
                "size": s,
            }));
        }
        
        if let Some(ref ct) = content_type {
            if !first {
                update_query.push_str(",");
            }
            update_query.push_str(" content_type = ?");
            first = false;
        }
        
        if !first {
            update_query.push_str(" WHERE id = ?");
            
            let mut query = sqlx::query(&update_query);
            if let Some(s) = size {
                query = query.bind(s);
            }
            if let Some(ref ct) = content_type {
                query = query.bind(ct);
            }
            query = query.bind(&ctx.id);
            let _ = query.execute(&ctx.db).await;
        }
    }
    
    // Determine the file extension from Content-Type if available
    let ext_from_content_type = content_type.as_ref().and_then(|ct| {
        if ct.contains("video/mp4") || ct.contains("video/webm") || ct.contains("video/x-matroska") {
            Some("mp4")
        } else if ct.contains("video/") {
            Some("mp4")
        } else if ct.contains("image/jpeg") {
            Some("jpg")
        } else if ct.contains("image/png") {
            Some("png")
        } else if ct.contains("image/gif") {
            Some("gif")
        } else if ct.contains("image/webp") {
            Some("webp")
        } else if ct.contains("audio/mpeg") || ct.contains("audio/mp3") {
            Some("mp3")
        } else if ct.contains("audio/") {
            Some("mp3")
        } else if ct.contains("application/zip") || ct.contains("application/x-zip") {
            Some("zip")
        } else if ct.contains("application/pdf") {
            Some("pdf")
        } else {
            None
        }
    });
    
    // Determine final save path and filename
    let mut final_save_path = ctx.save_path.clone();
    let save_path_str = final_save_path.clone();
    
    // Check if we need to rename (no extension, google URL, or too long)
    let current_filename = std::path::Path::new(&save_path_str)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    
    let needs_rename = current_filename.is_empty() || 
        current_filename == "untitled" ||
        save_path_str.len() > 200 || 
        save_path_str.contains("googleusercontent") ||
        !current_filename.contains('.');
    
    if needs_rename {
        // Build new filename: priority is header > content-type > timestamp
        let ext = filename_from_header
            .as_ref()
            .and_then(|n| std::path::Path::new(n).extension().and_then(|e| e.to_str()))
            .map(|s| s.to_lowercase())
            .or_else(|| ext_from_content_type.map(|s| s.to_string()))
            .unwrap_or_else(|| "dat".to_string());
        
        let new_filename = if let Some(ref name) = filename_from_header {
            if !name.is_empty() && name.len() < 200 {
                name.clone()
            } else {
                format!("download_{}.{}", 
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis(),
                    ext
                )
            }
        } else {
            format!("download_{}.{}", 
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis(),
                ext
            )
        };
        
        if let Some(parent) = std::path::Path::new(&save_path_str).parent() {
            final_save_path = format!("{}/{}", parent.to_string_lossy(), new_filename);
            
            // Emit event so frontend can update
            let _ = ctx.app.emit("download-filename", serde_json::json!({
                "id": ctx.id,
                "filename": new_filename
            }));
        }
    }
    
    // Size and content-type already updated earlier in combined query

    if let Some(parent) = Path::new(&final_save_path).parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let num_threads = if accepts_ranges && size.is_some() && ctx.threads > 1 {
        ctx.threads as i64
    } else {
        1
    };

    if num_threads == 1 {
        run_single_thread_with_path(ctx, final_save_path).await
    } else {
        // Create file without pre-allocating space (faster startup)
        // File will grow as chunks are downloaded
        let _file = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .open(&final_save_path).await?;
        
        // Skip set_len() for faster startup - file grows dynamically
        // This is safe because each chunk writes to its specific offset
        
        run_multi_thread_with_path(ctx, size.unwrap_or(0), num_threads, final_save_path).await
    }
}

async fn run_single_thread_with_path(ctx: &Arc<DownloadContext>, save_path: String) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut downloaded: i64 = sqlx::query_scalar("SELECT downloaded FROM downloads WHERE id = ?")
        .bind(&ctx.id)
        .fetch_one(&ctx.db)
        .await
        .unwrap_or(0);

    let mut response_opt = None;
    let mut last_error = String::new();
    for _ in 0..3 {
        let mut req = ctx.client.get(&ctx.url);
        if downloaded > 0 {
            req = req.header("Range", format!("bytes={}-", downloaded));
        }

        match req.send().await {
            Ok(res) if downloaded > 0 && res.status() == reqwest::StatusCode::OK => {
                // Server ignored Range header and sent the full file. Reset download.
                downloaded = 0;
                response_opt = Some(res);
                break;
            }
            Ok(res) if res.status().is_success() || res.status() == reqwest::StatusCode::PARTIAL_CONTENT => {
                response_opt = Some(res);
                break;
            }
            Ok(res) => {
                let status = res.status();
                let ct = res.headers().get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("unknown");
                last_error = format!("HTTP {} (Content-Type: {})", status.as_u16(), ct);
                if downloaded > 0 {
                    // Range request might have failed. Try without range.
                    downloaded = 0;
                    last_error = format!("{} - Retrying without Range...", last_error);
                    match ctx.client.get(&ctx.url).send().await {
                        Ok(res2) if res2.status().is_success() => {
                            response_opt = Some(res2);
                            break;
                        }
                        Ok(res2) => {
                            last_error = format!("HTTP {} (Content-Type: {}) after reset", res2.status().as_u16(),
                                res2.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("unknown"));
                        }
                        Err(e) => last_error = e.to_string(),
                    }
                } else {
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                }
            }
            Err(e) => {
                last_error = e.to_string();
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }
        }
    }
    
    let mut response = response_opt.ok_or_else(|| format!("Server returned error after 3 retries: {}", last_error))?;

    // Final check: if the response is HTML, this is a landing page not a file
    if let Some(ct) = response.headers().get("content-type").and_then(|v| v.to_str().ok()) {
        if ct.contains("text/html") && !ctx.url.contains(".htm") {
            return Err(format!("Server returned an HTML page instead of a file (Content-Type: {})", ct).into());
        }
    }

    let mut dest = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(downloaded == 0) // Truncate if we're starting from 0
        .append(downloaded > 0)    // Append if we're resuming
        .open(&save_path).await?;
        
    let mut last_emit = std::time::Instant::now();
    let start_time = std::time::Instant::now();

    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = response.chunk().await? {
        dest.write_all(&chunk).await?;
        downloaded += chunk.len() as i64;

        if last_emit.elapsed().as_millis() > 500 {
            let elapsed_secs = start_time.elapsed().as_secs_f64();
            let speed = if elapsed_secs > 0.0 {
                downloaded as f64 / elapsed_secs
            } else {
                0.0
            };

            let _ = ctx.app.clone().emit("download-progress", ProgressPayload {
                id: ctx.id.clone(),
                downloaded,
                speed,
            });

            // Opportunistically update DB
            let _ = sqlx::query("UPDATE downloads SET downloaded = ? WHERE id = ?")
                .bind(downloaded)
                .bind(&ctx.id)
                .execute(&ctx.db).await;

            last_emit = std::time::Instant::now();
        }
    }
    
    // Final update
    let _ = sqlx::query("UPDATE downloads SET downloaded = ? WHERE id = ?")
        .bind(downloaded)
        .bind(&ctx.id)
        .execute(&ctx.db).await;

    Ok(())
}

async fn run_multi_thread_with_path(ctx: &Arc<DownloadContext>, total_size: i64, threads: i64, save_path: String) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // OPTIMAL CHUNK SIZE: Balance parallelism vs overhead
    // aria2c uses 1-5 MB chunks for max parallelism
    // Too large (64MB): Only 19 chunks for 1.2GB = not enough parallelism
    // Too small (512KB): Too much HTTP overhead
    // Sweet spot: 2-4 MB chunks
    let chunk_size = if total_size < 50 * 1024 * 1024 {
        1024 * 1024  // 1 MB for small files
    } else if total_size < 500 * 1024 * 1024 {
        2 * 1024 * 1024  // 2 MB for medium files
    } else {
        4 * 1024 * 1024  // 4 MB for large files
    };

    // Check if extra_meta has sequential preference (Media Preview)
    let is_sequential = ctx.extra_meta.as_deref().map(|m| m.contains("\"sequential\":true")).unwrap_or(false);

    // Use more threads for better parallelism
    // aria2c default: 5 connections, max 16
    // For max speed: use 16-32 threads
    let requested_threads = threads.max(16) as usize;
    let coordinator = Arc::new(crate::engine::hybrid::ChunkCoordinator::new_with_threads(
        ctx.id.clone(),
        total_size,
        chunk_size,
        is_sequential,
        requested_threads.min(64),
    ));

    println!(
        "[http] Chunk size: {} bytes ({} MB), threads: {}, file: {} MB",
        chunk_size, chunk_size / (1024 * 1024), requested_threads, total_size / (1024 * 1024)
    );

    // For resuming: check existing segments in DB
    let initial_downloaded = sqlx::query_scalar::<_, i64>("SELECT SUM(downloaded) FROM segments WHERE download_id = ?")
        .bind(&ctx.id)
        .fetch_one(&ctx.db)
        .await
        .unwrap_or(0);

    // If we have no progress, clear DB and batch insert all segments
    if initial_downloaded == 0 {
        let _ = sqlx::query("DELETE FROM segments WHERE download_id = ?").bind(&ctx.id).execute(&ctx.db).await;
        
        // Batch insert all segments at once (much faster than individual INSERTs)
        let chunks_lock = coordinator.chunks.lock().await;
        
        // Build batch INSERT query
        if !chunks_lock.is_empty() {
            let mut query = String::from("INSERT INTO segments (download_id, seg_index, range_start, range_end, downloaded) VALUES ");
            let mut first = true;
            
            for chunk in chunks_lock.iter() {
                if !first {
                    query.push_str(", ");
                }
                query.push_str(&format!("('{}', {}, {}, {}, 0)", 
                    ctx.id.replace("'", "''"),  // Escape single quotes
                    chunk.index,
                    chunk.start_byte,
                    chunk.end_byte
                ));
                first = false;
            }
            
            let _ = sqlx::query(&query).execute(&ctx.db).await;
        }
    } else {
        // Robust resume: mark completed chunks and advance partially-downloaded chunks
        let segments = sqlx::query_as::<_, DbSegment>("SELECT seg_index, range_start, range_end, downloaded FROM segments WHERE download_id = ? ORDER BY seg_index")
            .bind(&ctx.id)
            .fetch_all(&ctx.db)
            .await?;

        let mut chunks_lock = coordinator.chunks.lock().await;
        for seg in segments {
            if let Some(chunk) = chunks_lock.get_mut(seg.seg_index as usize) {
                let seg_size = seg.range_end - seg.range_start + 1;
                if seg.downloaded >= seg_size {
                    // Fully downloaded — mark complete
                    chunk.status = crate::engine::hybrid::ChunkStatus::Completed;
                } else if seg.downloaded > 0 {
                    // Partially downloaded — advance start byte so we resume from where we left off
                    chunk.start_byte = seg.range_start + seg.downloaded;
                }
            }
        }
    }

    let downloaded_counter = Arc::new(AtomicI64::new(initial_downloaded));
    
    // Central speed calculator: tracks total bytes in time windows
    // This gives aggregate speed across ALL workers, not per-worker speed
    let speed_bytes = Arc::new(AtomicI64::new(0));
    let speed_last_check = Arc::new(std::sync::Mutex::new(std::time::Instant::now()));

    let mut tasks = Vec::new();

    // Speed limiter
    let limit_kb = sqlx::query_scalar::<_, i64>("SELECT speed_limit FROM downloads WHERE id = ?")
        .bind(&ctx.id)
        .fetch_one(&ctx.db).await.unwrap_or(0);
    let bucket: Option<Arc<tokio::sync::Mutex<crate::utils::speed_limiter::TokenBucket>>> = if limit_kb > 0 {
        let bytes_per_sec = (limit_kb as usize) * 1024;
        Some(Arc::new(tokio::sync::Mutex::new(crate::utils::speed_limiter::TokenBucket::new(bytes_per_sec, bytes_per_sec))))
    } else {
        None
    };

    // Actual thread count: min(requested, available chunks, 64 max)
    let total_chunks = coordinator.chunks.lock().await.len() as i64;
    let actual_threads = std::cmp::min(requested_threads as i64, std::cmp::min(total_chunks, 64)) as usize;

    // DYNAMIC CONNECTION SCALING
    // Start with 3 connections, automatically adjust based on:
    // - 429 errors (reduce connections)
    // - Speed improvement (increase connections)
    // - Speed plateau (stop increasing)
    // Like aria2c's auto-scaling algorithm
    let initial_connections = 3usize;
    let max_connections = 16usize;
    let min_connections = 1usize;
    
    // Shared state for dynamic adjustment
    let current_connections = Arc::new(std::sync::atomic::AtomicUsize::new(initial_connections));
    let success_count = Arc::new(std::sync::atomic::AtomicU32::new(0));
    let error_429_count = Arc::new(std::sync::atomic::AtomicU32::new(0));
    let last_speed = Arc::new(std::sync::atomic::AtomicI64::new(0));
    let last_adjustment = Arc::new(std::sync::atomic::AtomicU64::new(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    ));
    
    let connection_semaphore = Arc::new(tokio::sync::Semaphore::new(initial_connections));

    // Central progress emitter: calculates aggregate speed and emits once per second
    // This replaces per-worker speed emissions with a single aggregate emission
    let progress_handle = {
        let db = ctx.db.clone();
        let id = ctx.id.clone();
        let app = ctx.app.clone();
        let downloaded_counter = downloaded_counter.clone();
        let speed_bytes = speed_bytes.clone();
        let speed_last_check = speed_last_check.clone();
        let current_connections = current_connections.clone();
        let success_count = success_count.clone();
        let error_429_count = error_429_count.clone();
        let last_speed = last_speed.clone();
        let last_adjustment = last_adjustment.clone();
        let connection_semaphore = connection_semaphore.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(2));
            println!("[Progress] Monitor started for download {}", id);
            loop {
                interval.tick().await;
                
                // Calculate aggregate speed from central counter
                let bytes_this_second = speed_bytes.swap(0, Ordering::Relaxed);
                let speed = bytes_this_second as f64; // bytes per second
                
                let total = downloaded_counter.load(Ordering::Relaxed);
                
                println!("[Progress] Emitting: downloaded={}, speed={:.1} MB/s", total, speed / 1024.0 / 1024.0);
                
                // Emit aggregate progress
                let _ = app.emit("download-progress", ProgressPayload {
                    id: id.clone(),
                    downloaded: total,
                    speed,
                });
                
                // Also save to DB
                let _ = sqlx::query("UPDATE downloads SET downloaded = ? WHERE id = ?")
                    .bind(total)
                    .bind(&id)
                    .execute(&db)
                    .await;

                // DYNAMIC CONNECTION SCALING LOGIC
                // Check every 2 seconds if we should adjust connections
                let last_adj_secs = last_adjustment.load(Ordering::Relaxed);
                let now_secs = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs();
                
                if now_secs - last_adj_secs >= 5 {
                    let successes = success_count.swap(0, Ordering::Relaxed);
                    let errors_429 = error_429_count.swap(0, Ordering::Relaxed);
                    let current = current_connections.load(Ordering::Relaxed);
                    let last_spd = last_speed.load(Ordering::Relaxed) as f64;
                    
                    println!("[Monitor] Connections: {}, Successes: {}, 429s: {}, Speed: {:.1} MB/s", 
                        current, successes, errors_429, speed / 1024.0 / 1024.0);
                    
                    // If we got 429 errors, reduce connections
                    if errors_429 > 0 {
                        let new_connections = (current - 1).max(min_connections);
                        if new_connections != current {
                            println!("[Monitor] Reducing connections: {} -> {} (due to 429 errors)", current, new_connections);
                            current_connections.store(new_connections, Ordering::Relaxed);
                            last_adjustment.store(now_secs, Ordering::Relaxed);
                        }
                    }
                    // If speed improved significantly, try increasing connections
                    else if speed > last_spd * 1.2 && current < max_connections && successes >= 3 {
                        let new_connections = (current + 1).min(max_connections);
                        println!("[Monitor] Increasing connections: {} -> {} (speed improved)", current, new_connections);
                        current_connections.store(new_connections, Ordering::Relaxed);
                        connection_semaphore.add_permits(1);
                        last_speed.store(speed as i64, Ordering::Relaxed);
                        last_adjustment.store(now_secs, Ordering::Relaxed);
                    }
                    // If speed plateaued or decreased, stop increasing
                    else if speed < last_spd * 0.9 && current > min_connections {
                        println!("[Monitor] Speed decreased, keeping {} connections", current);
                        last_speed.store(speed as i64, Ordering::Relaxed);
                        last_adjustment.store(now_secs, Ordering::Relaxed);
                    }
                    else {
                        last_speed.store(speed as i64, Ordering::Relaxed);
                        last_adjustment.store(now_secs, Ordering::Relaxed);
                    }
                }

                let status = sqlx::query_scalar::<_, String>("SELECT status FROM downloads WHERE id = ?")
                    .bind(&id)
                    .fetch_one(&db)
                    .await
                    .unwrap_or_default();
                if status != "Downloading" {
                    break;
                }
            }
        })
    };

    for thread_id in 0..actual_threads {
        let ctx = ctx.clone();
        let downloaded_counter = downloaded_counter.clone();
        let speed_bytes = speed_bytes.clone();
        let success_count = success_count.clone();
        let error_429_count = error_429_count.clone();
        let bucket = bucket.clone();
        let save_path = save_path.clone();
        let coordinator = coordinator.clone();
        let connection_semaphore = connection_semaphore.clone();
        let current_connections = current_connections.clone();

        let handle = tokio::spawn(async move {
            let worker_id = format!("http-worker-{}", thread_id);

            // Each worker gets its own reqwest Client with minimal connection pooling
            // This helps ensure workers use separate TCP connections
            let worker_client = reqwest::Client::builder()
                .pool_max_idle_per_host(1)  // Minimal pooling - forces separate connections
                .pool_idle_timeout(std::time::Duration::from_secs(30))
                .http2_adaptive_window(true)
                .tcp_nodelay(true)
                .timeout(std::time::Duration::from_secs(3600))
                .build()
                .unwrap_or_else(|_| ctx.client.clone());

            // No stagger needed - semaphore controls concurrency
            // Workers queue up and wait for their turn

            // Open file ONCE per thread, reuse across all chunks
            let mut file_handle = tokio::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .open(&save_path).await.ok();

            println!("[{}] Started (chunk size: {} MB, max threads: {})", 
                worker_id, chunk_size / (1024 * 1024), actual_threads);

            while let Some(chunk) = coordinator.get_next_pending_chunk(&worker_id).await {
                // No per-chunk DB query — resume offsets are handled by chunk.start_byte
                let mut retries = 5;  // Increased retries since semaphore prevents 429 storms
                let mut success = false;
                let chunk_start_time = std::time::Instant::now();

                println!("[{}] Acquired chunk #{}: bytes {}-{} ({} KB)", 
                    worker_id, chunk.index, chunk.start_byte, chunk.end_byte,
                    (chunk.end_byte - chunk.start_byte + 1) / 1024);

                while retries > 0 {
                    let chunk_start_offset = chunk.start_byte;
                    let end_byte = chunk.end_byte;

                    if chunk_start_offset > end_byte {
                        success = true;
                        break;
                    }

                    // Acquire semaphore slot before making HTTP request
                    // This limits concurrent connections to avoid 429 rate limiting
                    let _permit = connection_semaphore.acquire().await.map_err(|e| {
                        println!("[{}] Chunk #{}: Semaphore error: {}", worker_id, chunk.index, e);
                    }).ok();

                    let mut response = match worker_client.get(&ctx.url)
                        .header("Range", format!("bytes={}-{}", chunk_start_offset, end_byte))
                        .send().await {
                            Ok(res) if res.status() == reqwest::StatusCode::PARTIAL_CONTENT => {
                                res
                            },
                            Ok(res) if res.status() == reqwest::StatusCode::TOO_MANY_REQUESTS => {
                                // 429 Too Many Requests — server is rate limiting
                                // Report to monitor for dynamic adjustment
                                error_429_count.fetch_add(1, Ordering::Relaxed);
                                
                                // Wait longer and retry
                                let retry_after = res.headers().get("retry-after")
                                    .and_then(|v| v.to_str().ok())
                                    .and_then(|v| v.parse::<u64>().ok())
                                    .unwrap_or(5);
                                let wait_secs = retry_after.max(5).min(30);
                                println!("[{}] Chunk #{}: 429 Too Many Requests, waiting {}s", 
                                    worker_id, chunk.index, wait_secs);
                                retries -= 1;
                                tokio::time::sleep(tokio::time::Duration::from_secs(wait_secs)).await;
                                continue;
                            },
                            Ok(res) => {
                                if res.status() == reqwest::StatusCode::UNAUTHORIZED ||
                                   res.status() == reqwest::StatusCode::FORBIDDEN ||
                                   res.status() == reqwest::StatusCode::GONE {
                                    println!("[{}] Chunk #{}: Link expired (status {})", 
                                        worker_id, chunk.index, res.status());
                                    let _ = sqlx::query("UPDATE downloads SET status = 'Needs Refresh', error_msg = 'Link expired. Please refresh the download link.' WHERE id = ?")
                                        .bind(&ctx.id)
                                        .execute(&ctx.db).await;
                                    let _ = ctx.app.emit("download-status", serde_json::json!({
                                        "id": ctx.id.clone(),
                                        "status": "Needs Refresh"
                                    }));
                                    return Ok::<(), Box<dyn std::error::Error + Send + Sync>>(());
                                }
                                println!("[{}] Chunk #{}: Unexpected status {}", 
                                    worker_id, chunk.index, res.status());
                                retries -= 1;
                                let backoff = 2u64.pow((3 - retries) as u32).min(5);
                                tokio::time::sleep(tokio::time::Duration::from_secs(backoff)).await;
                                continue;
                            },
                            Err(e) => {
                                println!("[{}] Chunk #{}: HTTP error: {}", 
                                    worker_id, chunk.index, e);
                                retries -= 1;
                                let backoff = 2u64.pow((3 - retries) as u32).min(5);
                                tokio::time::sleep(tokio::time::Duration::from_secs(backoff)).await;
                                continue;
                            }
                        };

                    // Reuse file handle or reopen
                    if file_handle.is_none() {
                        file_handle = tokio::fs::OpenOptions::new()
                            .write(true)
                            .create(true)
                            .open(&save_path).await.ok();
                    }
                    let dest = file_handle.as_mut().unwrap();

                    use tokio::io::AsyncSeekExt;
                    if let Err(e) = dest.seek(std::io::SeekFrom::Start(chunk_start_offset as u64)).await {
                        println!("[{}] Chunk #{}: Seek failed: {}", worker_id, chunk.index, e);
                        retries -= 1;
                        continue;
                    }

                    let max_expected = chunk.end_byte - chunk.start_byte + 1;
                    let mut chunk_down: i64 = 0;
                    let mut has_error = false;

                    // STREAMING with buffer: accumulate chunks and write in batches
                    // 256 KB buffer balances memory usage and write efficiency
                    let mut write_buffer = Vec::with_capacity(256 * 1024); // 256 KB buffer
                    let mut read_count = 0;
                    let mut write_count = 0;

                    let read_start = std::time::Instant::now();

                    while let Ok(Some(bytes_chunk)) = response.chunk().await {
                        if let Some(b) = &bucket {
                            crate::utils::speed_limiter::TokenBucket::acquire(b.clone(), bytes_chunk.len()).await;
                        }

                        let remaining = (max_expected - chunk_down).max(0) as usize;
                        if remaining == 0 {
                            break;
                        }

                        let to_write = if bytes_chunk.len() > remaining {
                            &bytes_chunk[..remaining]
                        } else {
                            &bytes_chunk
                        };

                        // Accumulate in buffer
                        write_buffer.extend_from_slice(to_write);
                        chunk_down += to_write.len() as i64;
                        read_count += 1;

                        // Add to central speed counter (aggregate across all workers)
                        speed_bytes.fetch_add(to_write.len() as i64, Ordering::Relaxed);

                        // Write when buffer is large enough (256 KB)
                        if write_buffer.len() >= 256 * 1024 {
                            use tokio::io::AsyncWriteExt;
                            if dest.write_all(&write_buffer).await.is_err() {
                                has_error = true;
                                println!("[{}] Chunk #{}: Write failed", worker_id, chunk.index);
                                break;
                            }
                            write_count += 1;
                            write_buffer.clear();
                        }

                        let current_total = downloaded_counter.fetch_add(to_write.len() as i64, Ordering::Relaxed) + to_write.len() as i64;

                        // NO progress emission here - central monitor handles it
                        // Workers only update counters, central monitor emits events
                    }

                    // Flush remaining buffer
                    if !has_error && !write_buffer.is_empty() {
                        use tokio::io::AsyncWriteExt;
                        if dest.write_all(&write_buffer).await.is_err() {
                            has_error = true;
                            println!("[{}] Chunk #{}: Final flush failed", worker_id, chunk.index);
                        } else {
                            write_count += 1;
                        }
                        write_buffer.clear();
                    }

                    let read_elapsed = read_start.elapsed();
                    let avg_speed = if read_elapsed.as_secs_f64() > 0.0 {
                        chunk_down as f64 / 1024.0 / 1024.0 / read_elapsed.as_secs_f64()
                    } else {
                        0.0
                    };

                    println!("[{}] Chunk #{}: {} MB in {:.1}s ({:.1} MB/s)", 
                        worker_id, chunk.index, chunk_down / (1024 * 1024), 
                        read_elapsed.as_secs_f64(), avg_speed);

                    if has_error {
                        retries -= 1;
                        println!("[{}] Chunk #{}: Error, retry {} remaining", 
                            worker_id, chunk.index, retries);
                        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                        continue;
                    }

                    // Report success for dynamic scaling
                    success_count.fetch_add(1, Ordering::Relaxed);

                    success = true;
                    break;
                }

                if success {
                    coordinator.mark_chunk_completed(chunk.index).await;
                } else {
                    coordinator.mark_chunk_failed(chunk.index).await;
                    println!("[{}] Chunk #{}: Failed after retries", worker_id, chunk.index);
                    if chunk.retry_count >= 2 {
                        let _ = coordinator.adaptively_split_chunk(chunk.index, 2).await;
                    }
                }
            }

            println!("[{}] Worker finished", worker_id);
            // Flush file handle at end of thread
            if let Some(dest) = &mut file_handle {
                use tokio::io::AsyncWriteExt;
                let _ = dest.flush().await;
            }

            Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
        });

        tasks.push(handle);
    }

    for task in tasks {
        task.await.map_err(|e| e.to_string())??;
    }

    progress_handle.abort();

    // Final flush
    let final_total = downloaded_counter.load(Ordering::Relaxed);
    let _ = sqlx::query("UPDATE downloads SET downloaded = ? WHERE id = ?")
        .bind(final_total)
        .bind(&ctx.id)
        .execute(&ctx.db)
        .await;

    if !coordinator.is_fully_completed().await {
        return Err("Some chunks failed to download entirely.".into());
    }

    Ok(())
}

async fn update_db_status(pool: &sqlx::Pool<sqlx::Sqlite>, id: &str, status: &str) {
    if status == "Completed" {
        let completed_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let _ = sqlx::query("UPDATE downloads SET status = ?, completed_at = ? WHERE id = ?")
            .bind(status)
            .bind(completed_at.to_string())
            .bind(id)
            .execute(pool).await;
    } else if status == "Downloading" {
        let started_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let _ = sqlx::query("UPDATE downloads SET status = ?, started_at = ? WHERE id = ?")
            .bind(status)
            .bind(started_at.to_string())
            .bind(id)
            .execute(pool).await;
    } else {
        let _ = sqlx::query("UPDATE downloads SET status = ? WHERE id = ?")
            .bind(status)
            .bind(id)
            .execute(pool).await;
    }
}

fn urlencoding_decode(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if hex.len() == 2 {
                if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                    result.push(byte as char);
                    continue;
                }
            }
            result.push('%');
            result.push_str(&hex);
        } else {
            result.push(c);
        }
    }
    result
}
