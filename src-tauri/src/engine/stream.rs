use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::Emitter;
use std::path::PathBuf;
use tauri::Manager;
use tokio::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamFormat {
    pub format_id: String,
    pub ext: String,
    pub resolution: String,
    pub filesize: Option<i64>,
    pub vcodec: String,
    pub acodec: String,
    pub tbr: Option<f64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub fps: Option<i64>,
    pub format_note: Option<String>,
}

#[derive(Deserialize, Default)]
struct StreamExtraMeta {
    format: Option<String>,
    #[serde(rename = "browserForCookies")]
    browser_for_cookies: Option<String>,
    #[serde(rename = "cookiesPath")]
    cookies_path: Option<String>,
    #[serde(rename = "proxyUrl")]
    proxy_url: Option<String>,
    #[serde(rename = "cookies")]
    cookies: Option<String>,
    #[serde(rename = "playlistStart")]
    playlist_start: Option<usize>,
    #[serde(rename = "playlistEnd")]
    playlist_end: Option<usize>,
    #[serde(rename = "downloadPlaylist")]
    download_playlist: Option<bool>,
    #[serde(rename = "embedSubs")]
    embed_subs: Option<bool>,
    #[serde(rename = "embedThumbnail")]
    embed_thumbnail: Option<bool>,
    #[serde(rename = "embedMetadata")]
    embed_metadata: Option<bool>,
    #[serde(rename = "embedChapters")]
    embed_chapters: Option<bool>,
    #[serde(rename = "audioExtract")]
    audio_extract: Option<bool>,
    #[serde(rename = "audioFormat")]
    audio_format: Option<String>,
    #[serde(rename = "audioQuality")]
    audio_quality: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamMetadata {
    pub title: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub formats: Vec<StreamFormat>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlaylistEntry {
    pub id: String,
    pub title: String,
    pub url: String,
    pub index: i64,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaylistMetadata {
    pub id: String,
    pub title: String,
    pub entries: Vec<PlaylistEntry>,
    pub entry_count: i64,
}

#[derive(serde::Serialize, Clone)]
struct StatusPayload {
    id: String,
    status: String,
}

/// Build yt-dlp --add-header "Cookie: ..." arguments from a raw cookie string.
/// Much more reliable than writing Netscape cookie files (which Python's buggy
/// http.cookiejar often fails to parse).
fn add_cookie_headers(command: &mut Command, raw_cookies: &str) {
    for pair in raw_cookies.split(';') {
        let pair = pair.trim();
        if pair.is_empty() { continue; }
        if let Some((name, value)) = pair.split_once('=') {
            let name = name.trim();
            let value = value.trim();
            // Skip empty or suspicious cookies
            if name.is_empty() || name.len() > 256 || value.is_empty() { continue; }
            command.arg("--add-header").arg(format!("Cookie:{}={}", name, value));
        }
    }
}

pub async fn get_ytdlp_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|_| "Failed to get app data dir".to_string())?;
    if !app_dir.exists() {
        let _ = fs::create_dir_all(&app_dir).await;
    }
    
    #[cfg(target_os = "windows")]
    let binary_name = "yt-dlp.exe";
    #[cfg(target_os = "macos")]
    let binary_name = "yt-dlp_macos";
    #[cfg(target_os = "linux")]
    let binary_name = "yt-dlp_linux";

    let binary_path = app_dir.join(binary_name);

    if !binary_path.exists() {
        let url = match std::env::consts::OS {
            "windows" => "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
            "macos" => "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos",
            "linux" => {
                #[cfg(target_arch = "x86_64")]
                { "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" }
                #[cfg(target_arch = "aarch64")]
                { "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64" }
                #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
                { "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" }
            },
            _ => return Err(format!("Unsupported OS: {}", std::env::consts::OS)),
        };

        println!("Downloading yt-dlp from {}...", url);
        let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Failed to download yt-dlp: HTTP {}", response.status()));
        }
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        
        fs::write(&binary_path, bytes).await.map_err(|e| e.to_string())?;
        
        #[cfg(target_family = "unix")]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(metadata) = std::fs::metadata(&binary_path) {
                let mut perms = metadata.permissions();
                perms.set_mode(0o755);
                let _ = std::fs::set_permissions(&binary_path, perms);
            }
        }
        println!("yt-dlp downloaded and installed to {:?}", binary_path);
    }

    Ok(binary_path)
}

pub async fn get_ffmpeg_path(app: &tauri::AppHandle) -> Result<Option<PathBuf>, String> {
    let app_dir = app.path().app_data_dir().map_err(|_| "Failed to get app data dir".to_string())?;
    if !app_dir.exists() {
        let _ = fs::create_dir_all(&app_dir).await;
    }

    #[cfg(target_os = "windows")]
    let binary_name = "ffmpeg.exe";
    #[cfg(not(target_os = "windows"))]
    let binary_name = "ffmpeg";

    let binary_path = app_dir.join(binary_name);

    // --- 1. Check for cached/bundled binary ---
    if binary_path.exists() {
        let meta = std::fs::metadata(&binary_path).ok();
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        #[cfg(unix)]
        let is_valid = size > 0 && meta.map(|m| m.permissions().mode() & 0o111 != 0).unwrap_or(false);
        #[cfg(windows)]
        let is_valid = size > 0;
        println!("Found cached ffmpeg at {:?}: size={}, valid={}", binary_path, size, is_valid);
        if is_valid {
            return Ok(Some(binary_path));
        }
        println!("Cached ffmpeg is invalid, removing and re-downloading...");
        let _ = std::fs::remove_file(&binary_path);
    }

    // --- 2. Try system PATH: resolve full absolute path ---
    // Tauri subprocesses may not inherit the full shell PATH, so we need the absolute path.
    let system_ffmpeg = Command::new("ffmpeg").arg("-version").output().await;
    if let Ok(ref output) = system_ffmpeg {
        if output.status.success() {
            // Resolve absolute path: `which` on Unix, `where` on Windows
            #[cfg(unix)]
            let resolver_cmd = "which";
            #[cfg(windows)]
            let resolver_cmd = "where";

            let resolved = Command::new(resolver_cmd).arg("ffmpeg").output().await;
            if let Ok(output) = resolved {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    // `where` on Windows can return multiple lines; take the first
                    let first_line = stdout.lines().next().unwrap_or("").trim();
                    if !first_line.is_empty() {
                        let abs_path = PathBuf::from(first_line);
                        if abs_path.is_absolute() && abs_path.exists() {
                            println!("Using system ffmpeg at: {:?}", abs_path);
                            return Ok(Some(abs_path));
                        }
                    }
                }
            }
            // Fallback: bare name (may fail if Tauri PATH differs from shell PATH)
            println!("Using system ffmpeg from PATH (bare name fallback)");
            return Ok(Some(PathBuf::from("ffmpeg")));
        }
    }

    // --- 3. Auto-download ffmpeg ---
    // Recursively find a binary inside an extracted directory tree
    fn find_binary(dir: &std::path::Path, name: &str) -> Option<PathBuf> {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.file_name().map(|n| n == name).unwrap_or(false) && path.is_file() {
                    return Some(path);
                }
                if path.is_dir() {
                    if let Some(found) = find_binary(&path, name) {
                        return Some(found);
                    }
                }
            }
        }
        None
    }

    // Helper: download, extract, find binary, copy to app_dir, set permissions
    async fn auto_download_ffmpeg(
        app_dir: &std::path::Path,
        binary_name: &str,
        download_url: &str,
        archive_ext: &str, // "tar.xz" or "zip"
    ) -> Option<PathBuf> {
        println!("ffmpeg not found. Auto-downloading from {}...", download_url);
        let temp_archive = app_dir.join(format!("ffmpeg_download.{}", archive_ext));
        let temp_extract = app_dir.join("ffmpeg_extract");

        let _ = tokio::fs::create_dir_all(&temp_extract).await;

        // Download
        let response = match reqwest::get(download_url).await {
            Ok(r) => r,
            Err(e) => { println!("Failed to download ffmpeg: {}", e); return None; }
        };
        let bytes = match response.bytes().await {
            Ok(b) => b,
            Err(e) => { println!("Failed to read ffmpeg download: {}", e); return None; }
        };
        if let Err(e) = tokio::fs::write(&temp_archive, &bytes).await {
            println!("Failed to save ffmpeg archive: {}", e); return None;
        }

        // Extract
        let extract_ok = if archive_ext == "zip" {
            // Use PowerShell on Windows to extract zip
            #[cfg(windows)]
            {
                let result = Command::new("powershell")
                    .args(["-Command", &format!("Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                        temp_archive.display(), temp_extract.display())])
                    .output().await;
                matches!(result, Ok(ref o) if o.status.success())
            }
            #[cfg(not(windows))]
            { false }
        } else {
            // Use system tar for .tar.xz / .tar.gz (Unix)
            let result = Command::new("tar")
                .args(["-xf", &temp_archive.to_string_lossy(), "-C", &temp_extract.to_string_lossy()])
                .output().await;
            matches!(result, Ok(ref o) if o.status.success())
        };

        if !extract_ok {
            let _ = tokio::fs::remove_file(&temp_archive).await;
            let _ = tokio::fs::remove_dir_all(&temp_extract).await;
            println!("Failed to extract ffmpeg archive");
            return None;
        }

        // Find and copy binary
        if let Some(found) = find_binary(&temp_extract, binary_name) {
            let dest = app_dir.join(binary_name);
            match tokio::fs::copy(&found, &dest).await {
                Ok(_) => {
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        if let Ok(meta) = std::fs::metadata(&dest) {
                            let mut perms = meta.permissions();
                            perms.set_mode(0o755);
                            let _ = std::fs::set_permissions(&dest, perms);
                        }
                    }
                    println!("ffmpeg auto-installed to {:?}", dest);
                    let _ = tokio::fs::remove_file(&temp_archive).await;
                    let _ = tokio::fs::remove_dir_all(&temp_extract).await;
                    return Some(dest);
                }
                Err(e) => println!("Failed to copy ffmpeg binary: {}", e),
            }
        } else {
            println!("ffmpeg binary not found in extracted archive");
        }

        // Cleanup on failure
        let _ = tokio::fs::remove_file(&temp_archive).await;
        let _ = tokio::fs::remove_dir_all(&temp_extract).await;
        None
    }

    // Platform-specific auto-download
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        let url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz";
        if let Some(path) = auto_download_ffmpeg(&app_dir, binary_name, url, "tar.xz").await {
            return Ok(Some(path));
        }
    }

    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        let url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz";
        if let Some(path) = auto_download_ffmpeg(&app_dir, binary_name, url, "tar.xz").await {
            return Ok(Some(path));
        }
    }

    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        let url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
        if let Some(path) = auto_download_ffmpeg(&app_dir, binary_name, url, "zip").await {
            return Ok(Some(path));
        }
    }

    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        let url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-macarm64-gpl.tar.xz";
        if let Some(path) = auto_download_ffmpeg(&app_dir, binary_name, url, "tar.xz").await {
            return Ok(Some(path));
        }
    }

    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        let url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-macos64-gpl.tar.xz";
        if let Some(path) = auto_download_ffmpeg(&app_dir, binary_name, url, "tar.xz").await {
            return Ok(Some(path));
        }
    }

    println!("Could not find or auto-download ffmpeg for this platform. Please install ffmpeg manually.");
    Ok(None)
}

pub async fn probe_stream_url(
    url: &str, 
    browser_for_cookies: Option<String>, 
    cookies_path: Option<String>, 
    extra_meta: Option<String>,
    app: &tauri::AppHandle
) -> Result<StreamMetadata, String> {
    let ytdlp_path = get_ytdlp_path(app).await?;
    let extra_meta: StreamExtraMeta = extra_meta
        .as_deref()
        .and_then(|value| serde_json::from_str(value).ok())
        .unwrap_or_default();
    
    let mut command = Command::new(&ytdlp_path);
    command.arg("--dump-json");
    if extra_meta.download_playlist.unwrap_or(false) {
        if let Some(start) = extra_meta.playlist_start {
            command.arg("--playlist-start").arg(start.to_string());
        }
        if let Some(end) = extra_meta.playlist_end {
            command.arg("--playlist-end").arg(end.to_string());
        }
    } else {
        command.arg("--no-playlist");
    }
    command.arg("--encoding").arg("utf-8");

    // Site-specific extractor args (handles YouTube + adult sites)
    if let Some(extractor_args) = site_specific_extractor_args(url) {
        command.arg("--extractor-args").arg(extractor_args);
    }
    
    if let Some(browser) = browser_for_cookies {
        if browser != "none" {
            command.arg("--cookies-from-browser").arg(&browser);
        }
    }
    if let Some(path) = cookies_path {
        if !path.is_empty() {
            command.arg("--cookies").arg(&path);
        }
    }

    // Raw cookies from browser extension
    if let Some(ref raw_cookies) = extra_meta.cookies {
        if !raw_cookies.is_empty() {
            add_cookie_headers(&mut command, raw_cookies);
        }
    }

    if let Some(proxy_url) = extra_meta.proxy_url.as_ref() {
        if !proxy_url.is_empty() {
            command.arg("--proxy").arg(proxy_url);
        }
    }
    
    if extra_meta.download_playlist.unwrap_or(false) {
        command.arg("--yes-playlist");
    }

    command.arg(url);
    
    let output = command.output().await
        .map_err(|e| format!("Failed to execute yt-dlp: {}. Make sure yt-dlp is installed.", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp probe failed: {}", err_msg));
    }

    let json_text = String::from_utf8_lossy(&output.stdout);
    
    // yt-dlp can output extra progress lines before the JSON; find the first JSON object
    let first_json_line = json_text.lines()
        .map(|l| l.trim())
        .find(|l| l.starts_with('{'))
        .unwrap_or(&json_text);
    
    let parsed: serde_json::Value = serde_json::from_str(first_json_line)
        .map_err(|e| format!("Failed to parse yt-dlp JSON: {}", e))?;

    let title = parsed["title"].as_str().unwrap_or("Unknown Title").to_string();
    let thumbnail = parsed["thumbnail"].as_str().map(|s| s.to_string());
    let duration = parsed["duration"].as_f64();
    
    let mut available_formats = Vec::new();
    
    if let Some(formats) = parsed["formats"].as_array() {
        for fmt in formats {
            let format_id = fmt["format_id"].as_str().unwrap_or("").to_string();
            let ext = fmt["ext"].as_str().unwrap_or("unknown").to_string();
            let resolution = fmt["resolution"].as_str().unwrap_or("audio only").to_string();
            let vcodec = fmt["vcodec"].as_str().unwrap_or("none").to_string();
            let acodec = fmt["acodec"].as_str().unwrap_or("none").to_string();
            let mut filesize = fmt["filesize"].as_i64().or_else(|| fmt["filesize_approx"].as_i64());
            let tbr = fmt["tbr"].as_f64();
            let width = fmt["width"].as_i64();
            let height = fmt["height"].as_i64();
            let fps = fmt["fps"].as_i64();
            let format_note = fmt["format_note"].as_str().map(|s| s.to_string());
            
            // Estimate filesize from tbr + duration when filesize is missing
            if filesize.is_none() {
                if let (Some(tbr_val), Some(dur_val)) = (tbr, duration) {
                    if dur_val > 0.0 && tbr_val > 0.0 {
                        let estimated = ((tbr_val * 1000.0) / 8.0 * dur_val) as i64;
                        filesize = Some(estimated);
                    }
                }
            }
            
            // Skip storyboards, thumbnails, and broken formats
            if format_note.as_deref() == Some("storyboard") {
                continue;
            }
            if vcodec == "none" && acodec == "none" {
                continue;
            }
            
            available_formats.push(StreamFormat {
                format_id,
                ext,
                resolution,
                filesize,
                vcodec,
                acodec,
                tbr,
                width,
                height,
                fps,
                format_note,
            });
        }
    }

    Ok(StreamMetadata {
        title,
        thumbnail,
        duration,
        formats: available_formats,
    })
}

#[derive(Debug, Clone)]
pub struct StreamProbeResult {
    pub title: String,
    pub resolution: Option<String>,
    pub thumbnail_url: Option<String>,
}

pub async fn probe_stream_metadata(
    url: &str,
    extra_meta: Option<&str>,
    app: &tauri::AppHandle,
) -> Option<StreamProbeResult> {
    eprintln!("[PROBE] Starting metadata probe for: {}", url);
    let ytdlp_path = match get_ytdlp_path(app).await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[PROBE] Failed to get yt-dlp path: {}", e);
            return None;
        }
    };

    let mut command = Command::new(&ytdlp_path);
    command.arg("--dump-json");
    command.arg("--no-download");
    command.arg("--no-warnings");
    command.arg("--encoding").arg("utf-8");
    command.arg("--skip-download");

    if let Some(extractor_args) = site_specific_extractor_args(url) {
        command.arg("--extractor-args").arg(extractor_args);
    }

    let extra_meta: StreamExtraMeta = extra_meta
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or_default();

    if let Some(ref browser) = extra_meta.browser_for_cookies {
        if browser != "none" {
            command.arg("--cookies-from-browser").arg(browser);
        }
    }
    if let Some(ref path) = extra_meta.cookies_path {
        if !path.is_empty() {
            command.arg("--cookies").arg(path);
        }
    }
    // Raw cookies from browser extension
    if let Some(ref raw_cookies) = extra_meta.cookies {
        if !raw_cookies.is_empty() {
            add_cookie_headers(&mut command, raw_cookies);
        }
    }
    if let Some(ref proxy_url) = extra_meta.proxy_url {
        if !proxy_url.is_empty() {
            command.arg("--proxy").arg(proxy_url);
        }
    }

    command.arg(url);

    let output = command.output().await.ok()?;
    if !output.status.success() {
        eprintln!("[PROBE] yt-dlp failed with status: {:?}, stderr: {}", output.status, String::from_utf8_lossy(&output.stderr));
        return None;
    }

    let json_text = String::from_utf8_lossy(&output.stdout);
    let first_json_line = json_text.lines()
        .map(|l| l.trim())
        .find(|l| l.starts_with('{'))
        .unwrap_or(&json_text);

    let parsed: serde_json::Value = serde_json::from_str(first_json_line).ok()?;

    let title = parsed["title"].as_str()
        .or_else(|| parsed["fulltitle"].as_str())
        .unwrap_or("Unknown Title")
        .to_string();

    let thumbnail_url = parsed["thumbnail"].as_str().map(|s| s.to_string());
    eprintln!("[PROBE] Found thumbnail_url: {:?}", thumbnail_url);

    let resolution = parsed["height"].as_i64().map(|h| {
        format!("{}p", h)
    }).or_else(|| {
        parsed["resolution"].as_str().map(|s| s.to_string())
    });

    eprintln!("[PROBE] Probe result: title='{}', resolution='{:?}', thumbnail_url='{:?}'", title, resolution, thumbnail_url);
    Some(StreamProbeResult {
        title,
        resolution,
        thumbnail_url,
    })
}

fn is_youtube_url(url: &str) -> bool {
    url.to_lowercase().contains("youtube.com") ||
    url.to_lowercase().contains("youtu.be") ||
    url.to_lowercase().contains("youtube-nocookie.com")
}

fn site_specific_extractor_args(url: &str) -> Option<String> {
    let lower = url.to_lowercase();
    if lower.contains("youtube.com") || lower.contains("youtu.be") || lower.contains("youtube-nocookie.com") {
        // Use mweb (mobile web) as primary client — most reliable for avoiding bot detection.
        // Falls back to android_vr if mweb fails.
        return Some("youtube:player_client=mweb,android_vr,web".to_string());
    }
    if lower.contains("pornhub.com") {
        return Some("PornHub:age_limit=age_limit_all".to_string());
    }
    if lower.contains("xhamster.com") || lower.contains("xhamster2.com") || lower.contains("xhamster.desi") {
        return Some("xHamster:access_token=".to_string());
    }
    if lower.contains("facebook.com") || lower.contains("fb.watch") {
        // Facebook extractor args for better compatibility
        return Some("facebook:version=v2.0".to_string());
    }
    if lower.contains("instagram.com") {
        // Instagram extractor args
        return Some("instagram:use_api=v1".to_string());
    }
    if lower.contains("twitter.com") || lower.contains("x.com") {
        // Twitter/X extractor args - use generic extractor for better compatibility
        return Some("generic:impersonate=chrome".to_string());
    }
    if lower.contains("threads.net") {
        // Threads extractor args
        return Some("threads:impersonate=chrome".to_string());
    }
    None
}

#[derive(serde::Serialize, Clone, serde::Deserialize)]
pub struct AdultSearchResult {
    pub id: String,
    pub title: String,
    pub url: String,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
}

pub async fn search_adult_site(
    site_key: &str,
    query: &str,
    app: &tauri::AppHandle,
) -> Result<Vec<AdultSearchResult>, String> {
    let ytdlp_path = get_ytdlp_path(app).await?;
    let search_query = format!("{} {}", site_key, query);

    let output = Command::new(&ytdlp_path)
        .arg("--dump-json")
        .arg("--flat-playlist")
        .arg("--no-warnings")
        .arg("--encoding").arg("utf-8")
        .arg(format!("ytsearch10:{}", search_query))
        .output()
        .await
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp search failed: {}", err_msg));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut results = Vec::new();

    for line in stdout.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with('{') {
            continue;
        }
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
            let id = parsed["id"].as_str().unwrap_or("").to_string();
            let title = parsed["title"].as_str().unwrap_or("Unknown").to_string();
            let url = parsed["url"].as_str()
                .or_else(|| parsed["webpage_url"].as_str())
                .or_else(|| parsed["original_url"].as_str())
                .unwrap_or("").to_string();
            let duration = parsed["duration"].as_f64();
            let thumbnail = parsed["thumbnail"].as_str()
                .or_else(|| parsed["thumbnails"].as_array().and_then(|t| t.first()).and_then(|t| t["url"].as_str()))
                .map(|s| s.to_string());

            if !id.is_empty() && !url.is_empty() {
                results.push(AdultSearchResult {
                    id,
                    title,
                    url,
                    duration,
                    thumbnail,
                });
            }
        }
    }

    Ok(results)
}

pub async fn probe_playlist_url(
    url: &str,
    browser_for_cookies: Option<String>,
    cookies_path: Option<String>,
    extra_meta: Option<String>,
    app: &tauri::AppHandle
) -> Result<PlaylistMetadata, String> {
    let ytdlp_path = get_ytdlp_path(app).await?;
    let extra_meta: StreamExtraMeta = extra_meta
        .as_deref()
        .and_then(|value| serde_json::from_str(value).ok())
        .unwrap_or_default();
    
    let mut command = Command::new(&ytdlp_path);
    command.arg("--dump-json");
    command.arg("--flat-playlist");
    command.arg("--encoding").arg("utf-8");
    
    if is_youtube_url(url) {
        command.arg("--extractor-args").arg("youtube:player_client=default,-web,-web_safari");
    }
    
    if let Some(browser) = browser_for_cookies {
        if browser != "none" {
            command.arg("--cookies-from-browser").arg(&browser);
        }
    }
    if let Some(path) = cookies_path {
        if !path.is_empty() {
            command.arg("--cookies").arg(&path);
        }
    }

    // Raw cookies from browser extension
    if let Some(ref raw_cookies) = extra_meta.cookies {
        if !raw_cookies.is_empty() {
            add_cookie_headers(&mut command, raw_cookies);
        }
    }

    if let Some(proxy_url) = extra_meta.proxy_url.as_ref() {
        if !proxy_url.is_empty() {
            command.arg("--proxy").arg(proxy_url);
        }
    }
    
    command.arg(url);
    
    let output = command.output().await
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp playlist probe failed: {}", err_msg));
    }

    let json_text = String::from_utf8_lossy(&output.stdout);
    let first_json_line = json_text.lines()
        .map(|l| l.trim())
        .find(|l| l.starts_with('{'))
        .unwrap_or(&json_text);
    
    let parsed: serde_json::Value = serde_json::from_str(first_json_line)
        .map_err(|e| format!("Failed to parse yt-dlp JSON: {}", e))?;

    let id = parsed["id"].as_str().unwrap_or("").to_string();
    let title = parsed["title"].as_str().unwrap_or("Unknown Playlist").to_string();
    
    let mut entries = Vec::new();
    let mut entry_count = 0i64;
    
    if let Some(e) = parsed["entries"].as_array() {
        entry_count = e.len() as i64;
        for (idx, entry) in e.iter().enumerate() {
            let entry_id = entry["id"].as_str().unwrap_or("").to_string();
            let entry_title = entry["title"].as_str().unwrap_or("Unknown").to_string();
            let entry_url = entry["url"].as_str()
                .or_else(|| entry["webpage_url"].as_str())
                .or_else(|| entry["original_url"].as_str())
                .unwrap_or("").to_string();
            let thumbnail = entry["thumbnail"].as_str().map(|s| s.to_string());
            
            entries.push(PlaylistEntry {
                id: entry_id,
                title: entry_title,
                url: entry_url,
                index: (idx + 1) as i64,
                thumbnail,
            });
        }
    }

    Ok(PlaylistMetadata {
        id,
        title,
        entries,
        entry_count,
    })
}

fn parse_ytdlp_progress(line: &str) -> Option<(f64, i64, Option<String>)> {
    // yt-dlp progress lines look like:
    // [download]  12.3% of ~156.78MiB at  2.56MiB/s ETA 00:45
    // [download]  50.0% of  156.78MiB at  2.56MiB/s ETA 00:45
    if !line.starts_with("[download]") {
        return None;
    }

    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 4 {
        return None;
    }

    // Find percentage
    let mut percent = 0.0;
    for part in &parts {
        if part.ends_with('%') {
            if let Ok(p) = part[..part.len()-1].parse::<f64>() {
                percent = p;
            }
        }
    }

    // Find total size (after "of")
    let mut total_size: Option<i64> = None;
    let mut speed_str: Option<String> = None;

    for (i, part) in parts.iter().enumerate() {
        if *part == "of" && i + 1 < parts.len() {
            let mut size_part = parts[i + 1].to_string();
            // Handle "~ 766.19MiB" (space after tilde) — skip the tilde token
            if size_part == "~" && i + 2 < parts.len() {
                size_part = parts[i + 2].to_string();
            }
            total_size = parse_size_str(&size_part);
        }
        if *part == "at" && i + 1 < parts.len() {
            speed_str = Some(parts[i + 1].to_string());
        }
    }

    Some((percent, total_size.unwrap_or(0), speed_str))
}

fn parse_size_str(s: &str) -> Option<i64> {
    let cleaned = s.replace("~", "").replace(",", "");
    let lower = cleaned.to_lowercase();
    let num_part = lower
        .replace("tib", "")
        .replace("t", "")
        .replace("gib", "")
        .replace("g", "")
        .replace("mib", "")
        .replace("m", "")
        .replace("kib", "")
        .replace("k", "")
        .replace("b", "");
    
    if let Ok(num) = num_part.trim().parse::<f64>() {
        let multiplier = if lower.contains("tib") {
            1024.0 * 1024.0 * 1024.0 * 1024.0
        } else if lower.contains("gib") || lower.contains("gb") {
            1024.0 * 1024.0 * 1024.0
        } else if lower.contains("mib") || lower.contains("mb") {
            1024.0 * 1024.0
        } else if lower.contains("kib") || lower.contains("kb") {
            1024.0
        } else {
            1.0
        };
        return Some((num * multiplier) as i64);
    }
    None
}

/// Parse yt-dlp speed string like "4.98MiB/s" into bytes per second
fn parse_speed_str(s: &str) -> f64 {
    let cleaned = s.replace(",", "").replace("/s", "").replace("/s", "");
    let lower = cleaned.to_lowercase();

    // Determine multiplier from unit BEFORE stripping characters
    let multiplier = if lower.contains("tib") || lower.contains("tb") {
        1024.0 * 1024.0 * 1024.0 * 1024.0
    } else if lower.contains("gib") || lower.contains("gb") {
        1024.0 * 1024.0 * 1024.0
    } else if lower.contains("mib") || lower.contains("mb") {
        1024.0 * 1024.0
    } else if lower.contains("kib") || lower.contains("kb") {
        1024.0
    } else {
        1.0
    };

    // Extract just the numeric part
    let num_str: String = lower.chars().filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-').collect();

    if let Ok(num) = num_str.parse::<f64>() {
        return num * multiplier;
    }
    0.0
}

pub async fn start_stream_download(ctx: Arc<crate::engine::http::DownloadContext>, cancel_flag: Arc<std::sync::atomic::AtomicBool>) {
    println!("Starting yt-dlp download for {}", ctx.url);

    // Safety net: validate URL isn't DRM-protected
    if let Err(e) = crate::engine::music::spotify::validate_no_drm(&ctx.url) {
        let _ = sqlx::query("UPDATE downloads SET status = 'Error', error_msg = ? WHERE id = ?")
            .bind(&e)
            .bind(&ctx.id)
            .execute(&ctx.db)
            .await;
        let _ = ctx.app.emit("download-status", StatusPayload {
            id: ctx.id.clone(),
            status: "Error".to_string(),
        });
        return;
    }

    let _ = ctx.app.emit("download-status", StatusPayload {
        id: ctx.id.clone(),
        status: "Downloading".to_string(),
    });

    // Update database status
    let _ = sqlx::query("UPDATE downloads SET status = 'Downloading', started_at = ? WHERE id = ?")
        .bind(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs().to_string())
        .bind(&ctx.id)
        .execute(&ctx.db)
        .await;

    let ytdlp_path = match get_ytdlp_path(&ctx.app).await {
        Ok(p) => p,
        Err(e) => {
            let _ = sqlx::query("UPDATE downloads SET status = 'Error', error_msg = ? WHERE id = ?")
                .bind(e.clone())
                .bind(&ctx.id)
                .execute(&ctx.db)
                .await;

            let _ = ctx.app.emit("download-status", StatusPayload {
                id: ctx.id.clone(),
                status: "Error".to_string(),
            });
            return;
        }
    };

    // Parse extra_meta to get format and cookie settings
    let extra_meta: StreamExtraMeta = match &ctx.extra_meta {
        Some(json_str) => serde_json::from_str(json_str).unwrap_or_default(),
        None => StreamExtraMeta::default(),
    };

    let mut command = Command::new(&ytdlp_path);

    // Audio extraction mode (music downloader)
    let is_audio_extract = extra_meta.audio_extract.unwrap_or(false);

    if is_audio_extract {
        command.arg("--extract-audio");
        if let Some(ref af) = extra_meta.audio_format {
            command.arg("--audio-format").arg(af);
        }
        if let Some(ref aq) = extra_meta.audio_quality {
            command.arg("--audio-quality").arg(aq);
        }
        // For audio extraction, prefer bestaudio formats
        let format_str = extra_meta.format.unwrap_or_else(|| "bestaudio/best".to_string());
        command.arg("-f").arg(&format_str);
    } else {
    // Site-specific extractor args for downloads
    if let Some(extractor_args) = site_specific_extractor_args(&ctx.url) {
        command.arg("--extractor-args").arg(extractor_args);
    }

    // YouTube: no compat flags that suppress workarounds
    // (removed --compat-options no-youtube-unavailable-videos — it hurts more than it helps)

        // Format selection (video stream mode)
        let format_str = extra_meta.format.unwrap_or_else(|| "bestvideo+bestaudio/best".to_string());
        command.arg("-f").arg(&format_str);

        // Audio multistreams if merging multiple audio tracks
        if format_str.contains('+') && format_str.contains("mergeall") {
            command.arg("--audio-multistreams");
        }
    }

    // Cookies
    if let Some(ref browser) = extra_meta.browser_for_cookies {
        if browser != "none" {
            command.arg("--cookies-from-browser").arg(browser);
        }
    }
    if let Some(ref path) = extra_meta.cookies_path {
        if !path.is_empty() {
            command.arg("--cookies").arg(path);
        }
    }
    // Raw cookies from browser extension (written to temp file)
    if let Some(ref raw_cookies) = extra_meta.cookies {
        if !raw_cookies.is_empty() {
            add_cookie_headers(&mut command, raw_cookies);
        }
    }

    if let Some(ref proxy_url) = extra_meta.proxy_url {
        if !proxy_url.is_empty() {
            command.arg("--proxy").arg(proxy_url);
        }
    }

    // Subtitles
    let embed_subs = extra_meta.embed_subs.unwrap_or(true);
    let is_bilibili = ctx.url.to_lowercase().contains("bilibili.com")
        || ctx.url.to_lowercase().contains("b23.tv");
    let has_cookie_auth = extra_meta.browser_for_cookies.as_ref().map(|s| s != "none").unwrap_or(false)
        || extra_meta.cookies_path.as_ref().map(|s| !s.is_empty()).unwrap_or(false);
    let should_attempt_subtitles = !is_bilibili || has_cookie_auth;

    if should_attempt_subtitles {
        if embed_subs {
            command.arg("--sub-langs").arg("all");
            command.arg("--embed-subs");
        } else {
            command.arg("--write-subs");
            command.arg("--no-embed-subs");
        }
    } else {
        command.arg("--no-embed-subs");
    }

    // Embeds (thumbnail embed disabled — thumbnails stored in DB via metadata probe)
    command.arg("--no-write-thumbnail");
    command.arg("--no-embed-thumbnail");
    command.arg(if extra_meta.embed_metadata.unwrap_or(true) { "--embed-metadata" } else { "--no-embed-metadata" });
    command.arg(if extra_meta.embed_chapters.unwrap_or(true) { "--embed-chapters" } else { "--no-embed-chapters" });

    // FFmpeg location: pass the directory containing ffmpeg to yt-dlp.
    // This is critical because Tauri subprocesses may not inherit the full shell PATH.
    match get_ffmpeg_path(&ctx.app).await {
        Ok(Some(ffmpeg_path)) => {
            println!("get_ffmpeg_path returned: {:?}", ffmpeg_path);
            if let Some(parent) = ffmpeg_path.parent() {
                if !parent.as_os_str().is_empty() {
                    println!("Passing --ffmpeg-location {:?}", parent);
                    command.arg("--ffmpeg-location").arg(parent);
                }
            }
            // If parent is empty (bare "ffmpeg" fallback), skip the flag — yt-dlp will try PATH on its own
        }
        Ok(None) => println!("get_ffmpeg_path returned None, yt-dlp will try PATH"),
        Err(e) => println!("get_ffmpeg_path error: {}", e),
    }

    // Platform filename safety
    #[cfg(target_os = "windows")]
    command.arg("--windows-filenames");
    command.arg("--trim-filenames").arg("120");

    // Output template
    let is_dir = tokio::fs::metadata(&ctx.save_path).await.map(|m| m.is_dir()).unwrap_or(false);
    let save_dir = if is_dir {
        std::path::Path::new(&ctx.save_path)
    } else {
        std::path::Path::new(&ctx.save_path).parent().unwrap_or(std::path::Path::new(&ctx.save_path))
    };

    let template = save_dir.join("%(title)s.%(ext)s");
    command.arg("-o").arg(template.to_string_lossy().to_string());

    // Resume and misc
    command.arg("--continue");
    command.arg("--newline"); // Force yt-dlp to output progress on new lines so BufReader doesn't get stuck
    command.arg("--no-playlist-reverse");
    command.arg("--encoding").arg("utf-8");

    // URL
    command.arg(&ctx.url);

    // Spawn process with streaming stdout/stderr for real-time progress
    let cmd = command
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Make child its own process group leader (kill -<pid> kills group).
    // `process_group` lives on std::process::Command (Unix-only), so we use
    // `pre_exec` on the tokio command to call setsid() after fork() / before exec().
    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            extern "C" { fn setsid() -> i32; }
            if setsid() < 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }

    let mut child = match cmd.spawn()
    {
        Ok(c) => {
            // Register the child PID so we can kill it on cancel/delete
            if let Some(pid) = c.id() {
                use tauri::Manager;
                if let Some(engine) = ctx.app.try_state::<crate::engine::DownloadEngine>() {
                    engine.active_children.lock().unwrap().insert(ctx.id.clone(), pid);
                }
            }
            c
        },
        Err(e) => {
            let err = format!("Failed to spawn yt-dlp: {}", e);
            let _ = sqlx::query("UPDATE downloads SET status = 'Error', error_msg = ? WHERE id = ?")
                .bind(&err)
                .bind(&ctx.id)
                .execute(&ctx.db)
                .await;
            let _ = ctx.app.emit("download-status", StatusPayload {
                id: ctx.id.clone(),
                status: "Error".to_string(),
            });
            if let Some(engine) = ctx.app.try_state::<crate::engine::DownloadEngine>() {
                engine.plugin_manager.fire("download.error", serde_json::json!({
                    "id": ctx.id.clone(),
                    "error": err,
                })).await;
            }
            return;
        }
    };

    let stdout = match child.stdout.take() {
        Some(s) => s,
        None => {
            eprintln!("yt-dlp stdout not available");
            let _ = sqlx::query("UPDATE downloads SET status = 'Error', error_msg = ? WHERE id = ?")
                .bind("yt-dlp stdout not piped")
                .bind(&ctx.id)
                .execute(&ctx.db)
                .await;
            let _ = ctx.app.emit("download-status", StatusPayload {
                id: ctx.id.clone(),
                status: "Error".to_string(),
            });
            return;
        }
    };
    let stderr = match child.stderr.take() {
        Some(s) => s,
        None => {
            eprintln!("yt-dlp stderr not available");
            let _ = sqlx::query("UPDATE downloads SET status = 'Error', error_msg = ? WHERE id = ?")
                .bind("yt-dlp stderr not piped")
                .bind(&ctx.id)
                .execute(&ctx.db)
                .await;
            let _ = ctx.app.emit("download-status", StatusPayload {
                id: ctx.id.clone(),
                status: "Error".to_string(),
            });
            return;
        }
    };

    let stdout_reader = BufReader::new(stdout);
    let stderr_reader = BufReader::new(stderr);

    let ctx_stdout = Arc::clone(&ctx);
    let _ctx_stderr = Arc::clone(&ctx);

    let stdout_task = tokio::spawn(async move {
        let mut lines = stdout_reader.lines();
        let mut last_percent = 0.0f64;
        let mut final_path: Option<String> = None;

        while let Ok(Some(line)) = lines.next_line().await {
            // Check if cancelled — exit loop cleanly
            if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                println!("[yt-dlp stdout] Cancelled, stopping stdout read");
                break;
            }
            println!("[yt-dlp stdout] {}", line);

            // Parse progress
            if let Some((percent, total_size, speed_str)) = parse_ytdlp_progress(&line) {
                let downloaded = (percent / 100.0 * total_size as f64) as i64;
                let speed_bps = speed_str.as_deref().map(parse_speed_str).unwrap_or(0.0);

                // Only update total_size if the new value is larger than current (prevents bad parses from overwriting real size)
                if total_size > 0 {
                    let current_total: i64 = sqlx::query_scalar("SELECT total_size FROM downloads WHERE id = ?")
                        .bind(&ctx_stdout.id)
                        .fetch_one(&ctx_stdout.db)
                        .await
                        .unwrap_or(0);
                    if total_size > current_total {
                        let _ = sqlx::query("UPDATE downloads SET total_size = ? WHERE id = ?")
                            .bind(total_size)
                            .bind(&ctx_stdout.id)
                            .execute(&ctx_stdout.db)
                            .await;
                        let _ = ctx_stdout.app.emit("download-size", serde_json::json!({
                            "id": ctx_stdout.id.clone(),
                            "size": total_size,
                        }));
                    }
                }

                // Update downloaded bytes
                let _ = sqlx::query("UPDATE downloads SET downloaded = ? WHERE id = ?")
                    .bind(downloaded)
                    .bind(&ctx_stdout.id)
                    .execute(&ctx_stdout.db)
                    .await;

                // Emit progress event with speed as number (bytes/sec)
                let _ = ctx_stdout.app.emit("download-progress", serde_json::json!({
                    "id": ctx_stdout.id.clone(),
                    "downloaded": downloaded,
                    "speed": speed_bps,
                }));

                last_percent = percent;
            }

            // Capture destination path
            if line.contains("[Merger] Merging formats into \"") {
                if let Some(path) = line.split('\"').nth(1) {
                    final_path = Some(path.to_string());
                }
            } else if line.contains("[download] Destination: ") {
                if let Some(path) = line.split("[download] Destination: ").nth(1) {
                    final_path = Some(path.trim().to_string());
                }
            } else if line.contains("has already been downloaded") {
                if let Some(path) = line.split("has already been downloaded").next() {
                    final_path = Some(path.replace("[download]", "").trim().to_string());
                }
            } else if line.contains("[ExtractAudio] Destination: ") {
                if let Some(path) = line.split("[ExtractAudio] Destination: ").nth(1) {
                    final_path = Some(path.trim().to_string());
                }
            }
        }

        (last_percent, final_path)
    });

    let stderr_task = tokio::spawn(async move {
        let mut lines = stderr_reader.lines();
        let mut error_lines = Vec::new();

        while let Ok(Some(line)) = lines.next_line().await {
            println!("[yt-dlp stderr] {}", line);
            if line.contains("ERROR") || line.contains("error") || line.contains("WARNING") {
                error_lines.push(line);
            }
        }

        error_lines.join("\n")
    });

    let (stdout_result, stderr_result) = tokio::join!(stdout_task, stderr_task);
    let exit_status = match child.wait().await {
        Ok(s) => s,
        Err(e) => {
            let err = format!("yt-dlp process error: {}", e);
            let _ = sqlx::query("UPDATE downloads SET status = 'Error', error_msg = ? WHERE id = ?")
                .bind(&err)
                .bind(&ctx.id)
                .execute(&ctx.db)
                .await;
            let _ = ctx.app.emit("download-status", StatusPayload {
                id: ctx.id.clone(),
                status: "Error".to_string(),
            });
            return;
        }
    };

    let (_last_percent, final_path) = match stdout_result {
        Ok(r) => r,
        Err(_) => (0.0, None),
    };

    let stderr_text = match stderr_result {
        Ok(r) => r,
        Err(_) => String::new(),
    };

    if exit_status.success() {
        let real_path = final_path.unwrap_or_else(|| ctx.save_path.clone());
        let real_filename = std::path::Path::new(&real_path).file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Downloaded Stream".to_string());

        // Thumbnail is handled by background metadata probe — no sidecar files needed

        let mut size = 0i64;
        if let Ok(metadata) = std::fs::metadata(&real_path) {
            size = metadata.len() as i64;
        }

        let _ = sqlx::query("UPDATE downloads SET status = 'Completed', completed_at = CURRENT_TIMESTAMP, save_path = ?, file_name = ?, downloaded = ?, total_size = ? WHERE id = ?")
            .bind(&real_path)
            .bind(&real_filename)
            .bind(size)
            .bind(size)
            .bind(&ctx.id)
            .execute(&ctx.db)
            .await;

        let _ = ctx.app.emit("download-filename", serde_json::json!({
            "id": ctx.id.clone(),
            "filename": real_filename
        }));

        let _ = ctx.app.emit("download-status", StatusPayload {
            id: ctx.id.clone(),
            status: "Completed".to_string(),
        });

        // Clean up process registration
        if let Some(engine) = ctx.app.try_state::<crate::engine::DownloadEngine>() {
            engine.active_children.lock().unwrap().remove(&ctx.id);
        }

        // Fire plugin complete hook
        if let Some(engine) = ctx.app.try_state::<crate::engine::DownloadEngine>() {
            engine.plugin_manager.fire("download.complete", serde_json::json!({
                "id": ctx.id.clone(),
                "path": real_path,
            })).await;
        }

        // Emit correct final size to frontend
        if size > 0 {
            let _ = ctx.app.emit("download-size", serde_json::json!({
                "id": ctx.id.clone(),
                "size": size,
            }));
        }

        let _ = ctx.app.emit("download-progress", serde_json::json!({
            "id": ctx.id.clone(),
            "downloaded": size,
            "speed": 0.0,
        }));

        let _ = crate::engine::completion::finalize_completed_download(
            &ctx.db,
            &ctx.id,
            &real_path,
            ctx.extra_meta.as_deref(),
        ).await;

        // Fire file.postprocess hook for plugins
        if let Some(engine) = ctx.app.try_state::<crate::engine::DownloadEngine>() {
            engine.plugin_manager.fire("file.postprocess", serde_json::json!({
                "id": ctx.id.clone(),
                "path": real_path.clone(),
            })).await;
        }
    } else {
        let err_msg = if !stderr_text.is_empty() {
            // Provide actionable error messages for common failures
            let hint = if stderr_text.contains("not available") || stderr_text.contains("Video unavailable") {
                "Hint: The video may be region-restricted, age-gated, or deleted. Try setting cookies in Settings > Connection."
            } else if stderr_text.contains("Sign in to confirm") || stderr_text.contains("login") {
                "Hint: YouTube requires authentication. Set your browser cookies in Settings > Connection > Browser for Cookies."
            } else if stderr_text.contains("HTTP Error 403") {
                "Hint: Access denied. Try enabling cookies or using a proxy in Settings."
            } else if stderr_text.contains("HTTPS Error") || stderr_text.contains("Connection refused") {
                "Hint: Network issue. Check your connection or proxy settings."
            } else {
                ""
            };
            let mut msg = format!("yt-dlp failed (exit code: {:?}): {}", exit_status.code(), stderr_text);
            if !hint.is_empty() {
                msg.push_str(&format!("\n{}", hint));
            }
            msg
        } else {
            format!("yt-dlp failed with exit code: {:?}", exit_status.code())
        };
        println!("yt-dlp failed: {}", err_msg);

        let _ = sqlx::query("UPDATE downloads SET status = 'Error', error_msg = ? WHERE id = ?")
            .bind(&err_msg)
            .bind(&ctx.id)
            .execute(&ctx.db)
            .await;

        let _ = ctx.app.emit("download-status", StatusPayload {
            id: ctx.id.clone(),
            status: "Error".to_string(),
        });

        if let Some(engine) = ctx.app.try_state::<crate::engine::DownloadEngine>() {
            engine.plugin_manager.fire("download.error", serde_json::json!({
                "id": ctx.id.clone(),
                "error": err_msg,
            })).await;
        }
    }
}
