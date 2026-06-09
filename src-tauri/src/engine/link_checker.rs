use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkCheckResult {
    pub url: String,
    pub alive: bool,
    pub status_code: u16,
    pub file_size: Option<u64>,
    pub file_size_human: Option<String>,
    pub content_type: Option<String>,
    pub file_extension: Option<String>,
    pub requires_auth: bool,
    pub has_rate_limit: bool,
    pub disk_space_available: u64,
    pub disk_space_sufficient: bool,
    pub estimated_time: Option<String>,
    pub warnings: Vec<String>,
    pub redirect_url: Option<String>,
}

fn format_bytes(bytes: u64) -> String {
    if bytes == 0 { return "0 B".into(); }
    let k = 1024_f64;
    let sizes = ["B", "KB", "MB", "GB", "TB"];
    let i = (bytes as f64).ln() / k.ln();
    let i = (i.floor() as usize).min(sizes.len() - 1);
    let val = bytes as f64 / k.powi(i as i32);
    format!("{:.1} {}", val, sizes[i])
}

fn estimate_download_time(bytes: u64, avg_speed_bps: f64) -> Option<String> {
    if avg_speed_bps <= 0.0 || bytes == 0 { return None; }
    let seconds = (bytes as f64 / avg_speed_bps) as u64;
    if seconds < 60 {
        Some(format!("{}s", seconds))
    } else if seconds < 3600 {
        Some(format!("{}m {}s", seconds / 60, seconds % 60))
    } else {
        Some(format!("{}h {}m", seconds / 3600, (seconds % 3600) / 60))
    }
}

fn ext_from_url(url: &str) -> Option<String> {
    let path = url.split('?').next()?;
    let filename = path.rsplit('/').next()?;
    let dot_pos = filename.rfind('.')?;
    let ext = &filename[dot_pos + 1..];
    if ext.len() > 1 && ext.len() < 10 && !ext.contains(' ') {
        Some(ext.to_lowercase())
    } else {
        None
    }
}

fn ext_from_content_type(ct: &str) -> Option<String> {
    match ct {
        "video/mp4" => Some("mp4".into()),
        "video/x-matroska" => Some("mkv".into()),
        "video/webm" => Some("webm".into()),
        "video/avi" => Some("avi".into()),
        "audio/mpeg" => Some("mp3".into()),
        "audio/mp3" => Some("mp3".into()),
        "audio/flac" => Some("flac".into()),
        "audio/ogg" => Some("ogg".into()),
        "audio/x-wav" => Some("wav".into()),
        "application/zip" => Some("zip".into()),
        "application/x-rar" => Some("rar".into()),
        "application/x-7z-compressed" => Some("7z".into()),
        "application/pdf" => Some("pdf".into()),
        "application/x-msdownload" => Some("exe".into()),
        "application/x-iso9660-image" => Some("iso".into()),
        "image/jpeg" => Some("jpg".into()),
        "image/png" => Some("png".into()),
        "image/webp" => Some("webp".into()),
        "image/gif" => Some("gif".into()),
        _ => None,
    }
}

pub async fn check_link(url: &str) -> Result<LinkCheckResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    // Get disk space
    let disk_available = get_disk_space().await;

    let mut warnings = Vec::new();
    let mut redirect_url = None;

    // HEAD request first
    let head_resp = client.head(url).send().await;
    let resp = match head_resp {
        Ok(r) => r,
        Err(e) => {
            return Ok(LinkCheckResult {
                url: url.to_string(),
                alive: false,
                status_code: 0,
                file_size: None,
                file_size_human: None,
                content_type: None,
                file_extension: None,
                requires_auth: false,
                has_rate_limit: false,
                disk_space_available: disk_available,
                disk_space_sufficient: true,
                estimated_time: None,
                warnings: vec![format!("Connection failed: {}", e)],
                redirect_url: None,
            });
        }
    };

    let status = resp.status();
    let status_code = status.as_u16();
    let alive = status.is_success() || status.is_redirection();

    // Check for redirect
    if let Some(final_url) = resp.url().as_str().strip_suffix("/") {
        if final_url != url.trim_end_matches('/') {
            redirect_url = Some(resp.url().to_string());
        }
    }

    let requires_auth = status == 401 || status == 403;
    if requires_auth {
        warnings.push("This link requires authentication".into());
    }

    let content_type = resp.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(';').next().unwrap_or(s).trim().to_string());

    let file_size = resp.headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok());

    let file_size_human = file_size.map(|s| format_bytes(s));

    // Check disk space
    let disk_sufficient = match file_size {
        Some(size) => size <= disk_available,
        None => true,
    };
    if !disk_sufficient {
        warnings.push(format!(
            "File ({}) exceeds available disk space ({})",
            file_size_human.as_deref().unwrap_or("?"),
            format_bytes(disk_available)
        ));
    }

    // Detect rate limiting
    let has_rate_limit = resp.headers().get("retry-after").is_some()
        || resp.headers().get("x-ratelimit-remaining").is_some();
    if has_rate_limit {
        warnings.push("Server has rate limiting — download may be throttled".into());
    }

    // Determine file extension
    let file_extension = content_type.as_deref()
        .and_then(ext_from_content_type)
        .or_else(|| ext_from_url(url));

    // Estimate download time (assume 5 MB/s average)
    let estimated_time = file_size.and_then(|s| estimate_download_time(s, 5.0 * 1024.0 * 1024.0));

    // Warn about very large files
    if let Some(size) = file_size {
        if size > 10 * 1024 * 1024 * 1024 {
            warnings.push("Very large file (>10 GB) — may take a long time".into());
        }
    }

    // Warn about unknown content
    if content_type.is_none() && file_size.is_none() {
        warnings.push("Server did not provide file size or type — link may be expired".into());
    }

    Ok(LinkCheckResult {
        url: url.to_string(),
        alive,
        status_code,
        file_size,
        file_size_human,
        content_type,
        file_extension,
        requires_auth,
        has_rate_limit,
        disk_space_available: disk_available,
        disk_space_sufficient: disk_sufficient,
        estimated_time,
        warnings,
        redirect_url,
    })
}

async fn get_disk_space() -> u64 {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("wmic")
            .args(["logicaldisk", "where", "DeviceID='C:'", "get", "FreeSpace", "/value"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Some(val) = line.strip_prefix("FreeSpace=") {
                    if let Ok(bytes) = val.trim().parse::<u64>() {
                        return bytes;
                    }
                }
            }
        }
        100 * 1024 * 1024 * 1024 // fallback 100 GB
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Fallback: use CommandRunner to get disk space
        if let Ok(output) = std::process::Command::new("df")
            .arg("-B1")
            .arg("/")
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // Parse second line: Filesystem 1B-blocks Used Available Use% Mounted
            if let Some(line) = stdout.lines().nth(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 4 {
                    if let Ok(available) = parts[3].parse::<u64>() {
                        return available;
                    }
                }
            }
        }
        100 * 1024 * 1024 * 1024 // fallback 100 GB
    }
}

pub async fn check_links_batch(urls: &[String]) -> Vec<LinkCheckResult> {
    let mut results = Vec::with_capacity(urls.len());
    for url in urls {
        match check_link(url).await {
            Ok(result) => results.push(result),
            Err(e) => results.push(LinkCheckResult {
                url: url.clone(),
                alive: false,
                status_code: 0,
                file_size: None,
                file_size_human: None,
                content_type: None,
                file_extension: None,
                requires_auth: false,
                has_rate_limit: false,
                disk_space_available: 0,
                disk_space_sufficient: true,
                estimated_time: None,
                warnings: vec![e],
                redirect_url: None,
            }),
        }
    }
    results
}
