use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::time::Duration;
use url::Url;
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteGrabberConfig {
    pub start_url: String,
    pub max_depth: u32,
    pub file_types: Vec<String>,  // [".jpg", ".pdf"]
    pub min_size: Option<u64>,
    pub max_size: Option<u64>,
    pub url_pattern: Option<String>,
    pub same_domain: bool,
    pub delay_ms: u64,
    pub max_files: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoundFile {
    pub url: String,
    pub file_name: String,
    pub file_type: String,
    pub file_size: Option<u64>,
    pub source_page: String,
    pub depth: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrabberProgress {
    pub job_id: String,
    pub status: String,
    pub pages_crawled: u32,
    pub files_found: u32,
    pub files_downloaded: u32,
    pub current_url: Option<String>,
    pub total_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrabberResult {
    pub files: Vec<FoundFile>,
    pub pages_crawled: u32,
    pub total_size: u64,
    pub errors: Vec<String>,
}

fn is_file_url(url_str: &str) -> Option<(String, String)> {
    // Returns (file_name, extension) if URL looks like a file
    if let Ok(parsed) = Url::parse(url_str) {
        let path = parsed.path();
        if let Some(filename) = path.split('/').last() {
            if let Some(dot_pos) = filename.rfind('.') {
                let ext = &filename[dot_pos + 1..];
                if ext.len() > 0 && ext.len() < 10 && !ext.contains('/') {
                    return Some((filename.to_string(), ext.to_lowercase()));
                }
            }
        }
    }
    None
}

fn matches_file_filter(ext: &str, filters: &[String]) -> bool {
    if filters.is_empty() {
        return true; // no filter = all files
    }
    filters.iter().any(|f| {
        let f_lower = f.trim_start_matches('.').to_lowercase();
        f_lower == ext.to_lowercase()
    })
}

pub async fn analyze_site(
    config: SiteGrabberConfig,
    app: tauri::AppHandle,
    job_id: String,
) -> Result<GrabberResult, String> {
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    let mut found_files = Vec::new();
    let mut pages_crawled = 0u32;
    let mut total_size = 0u64;
    let mut errors = Vec::new();

    let start = Url::parse(&config.start_url).map_err(|e| format!("Invalid URL: {}", e))?;
    let base_domain = start.host_str().unwrap_or("").to_string();

    queue.push_back((config.start_url.clone(), 0u32));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent("ZenDownload/1.0 (Site Grabber)")
        .build()
        .map_err(|e| e.to_string())?;

    let _ = app.emit("grabber-progress", GrabberProgress {
        job_id: job_id.clone(),
        status: "Crawling".into(),
        pages_crawled: 0,
        files_found: 0,
        files_downloaded: 0,
        current_url: Some(config.start_url.clone()),
        total_size: 0,
    });

    while let Some((current_url, depth)) = queue.pop_front() {
        if visited.contains(&current_url) {
            continue;
        }
        if depth > config.max_depth {
            break;
        }
        if found_files.len() >= config.max_files as usize {
            break;
        }

        visited.insert(current_url.clone());
        pages_crawled += 1;

        // Check if this URL is a file
        if let Some((filename, ext)) = is_file_url(&current_url) {
            if matches_file_filter(&ext, &config.file_types) {
                let file_size = check_file_size(&client, &current_url).await;
                if let Some(size) = file_size {
                    if let Some(min) = config.min_size {
                        if size < min { continue; }
                    }
                    if let Some(max) = config.max_size {
                        if size > max { continue; }
                    }
                    total_size += size;
                }
                found_files.push(FoundFile {
                    url: current_url.clone(),
                    file_name: filename,
                    file_type: ext,
                    file_size,
                    source_page: String::new(),
                    depth,
                });
            }
            continue;
        }

        // Otherwise fetch the page and extract links
        let _ = app.emit("grabber-progress", GrabberProgress {
            job_id: job_id.clone(),
            status: "Crawling".into(),
            pages_crawled,
            files_found: found_files.len() as u32,
            files_downloaded: 0,
            current_url: Some(current_url.clone()),
            total_size,
        });

        let response = client.get(&current_url).send().await;
        match response {
            Ok(resp) => {
                if !resp.status().is_success() {
                    errors.push(format!("HTTP {} on {}", resp.status(), current_url));
                    continue;
                }
                let content_type = resp.headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string())
                    .unwrap_or_default();

                // If content is HTML, parse for links
                if content_type.contains("text/html") {
                    if let Ok(html) = resp.text().await {
                        let links = extract_links(&html, &current_url);
                        for link in links {
                            if !visited.contains(&link) {
                                if config.same_domain {
                                    if let Ok(link_parsed) = Url::parse(&link) {
                                        if link_parsed.host_str() != Some(&base_domain) {
                                            continue;
                                        }
                                    } else {
                                        continue;
                                    }
                                }
                                if let Some(ref pattern) = config.url_pattern {
                                    if !link.contains(pattern) {
                                        continue;
                                    }
                                }
                                queue.push_back((link, depth + 1));
                            }
                        }
                    }
                } else if content_type.contains("application/") || content_type.contains("video/") || content_type.contains("audio/") || content_type.contains("image/") {
                    // It's a direct file
                    let ext = match content_type.as_str() {
                        s if s.contains("pdf") => "pdf",
                        s if s.contains("zip") => "zip",
                        s if s.contains("mp4") => "mp4",
                        s if s.contains("mp3") => "mp3",
                        s if s.contains("jpeg") || s.contains("jpg") => "jpg",
                        s if s.contains("png") => "png",
                        s if s.contains("gif") => "gif",
                        s if s.contains("webp") => "webp",
                        s if s.contains("octet-stream") => "bin",
                        _ => "file",
                    };
                    if matches_file_filter(ext, &config.file_types) {
                        let file_size = check_file_size(&client, &current_url).await;
                        let filename = current_url.split('/').last().unwrap_or("file").to_string();
                        if let Some(size) = file_size {
                            if let Some(min) = config.min_size {
                                if size < min { continue; }
                            }
                            if let Some(max) = config.max_size {
                                if size > max { continue; }
                            }
                            total_size += size;
                        }
                        found_files.push(FoundFile {
                            url: current_url.clone(),
                            file_name: filename,
                            file_type: ext.to_string(),
                            file_size,
                            source_page: String::new(),
                            depth,
                        });
                    }
                }
            }
            Err(e) => {
                errors.push(format!("Failed to fetch {}: {}", current_url, e));
            }
        }

        if config.delay_ms > 0 {
            tokio::time::sleep(Duration::from_millis(config.delay_ms)).await;
        }
    }

    let _ = app.emit("grabber-progress", GrabberProgress {
        job_id,
        status: "Completed".into(),
        pages_crawled,
        files_found: found_files.len() as u32,
        files_downloaded: 0,
        current_url: None,
        total_size,
    });

    Ok(GrabberResult {
        files: found_files,
        pages_crawled,
        total_size,
        errors,
    })
}

fn extract_links(html: &str, base_url: &str) -> Vec<String> {
    let mut links = HashSet::new();
    let base = Url::parse(base_url).ok();

    // Extract from href, src, action attributes
    let patterns = ["href=", "src=", "action=", "data-src="];
    for pattern in &patterns {
        let mut start = 0;
        while let Some(pos) = html[start..].find(pattern) {
            let abs_pos = start + pos + pattern.len();
            let remaining = &html[abs_pos..];
            // Skip whitespace
            let trimmed = remaining.trim_start();
            let abs_pos = abs_pos + (remaining.len() - trimmed.len());
            // Check for quoted value
            let quote = trimmed.chars().next();
            if quote != Some('"') && quote != Some('\'') {
                start = abs_pos + 1;
                continue;
            }
            let quote_char = quote.unwrap();
            let after_quote = &trimmed[1..];
            if let Some(end) = after_quote.find(quote_char) {
                let url = &after_quote[..end];
                // Resolve relative URL
                let resolved = if let Some(b) = &base {
                    b.join(url).ok().map(|u| u.to_string()).unwrap_or_else(|| url.to_string())
                } else {
                    url.to_string()
                };
                // Skip javascript, mailto, anchor-only, data URIs
                if !resolved.starts_with("javascript:")
                    && !resolved.starts_with("mailto:")
                    && !resolved.starts_with("data:")
                    && !resolved.starts_with("#")
                    && resolved.starts_with("http")
                {
                    links.insert(resolved);
                }
                start = abs_pos + 1 + end;
            } else {
                break;
            }
        }
    }

    links.into_iter().collect()
}

async fn check_file_size(client: &reqwest::Client, url: &str) -> Option<u64> {
    if let Ok(resp) = client.head(url).send().await {
        if let Some(len) = resp.headers().get("content-length") {
            if let Ok(s) = len.to_str() {
                if let Ok(size) = s.parse::<u64>() {
                    return Some(size);
                }
            }
        }
    }
    None
}

pub async fn download_grabbed_files(
    files: Vec<FoundFile>,
    save_path: String,
    app: tauri::AppHandle,
) -> Result<u32, String> {
    use std::path::Path;
    let mut downloaded = 0u32;

    let save_dir = Path::new(&save_path);
    if !save_dir.exists() {
        let _ = tokio::fs::create_dir_all(save_dir).await;
    }

    // Get the engine instance from the app state
    let engine = app.state::<crate::engine::DownloadEngine>().inner().clone();

    for file in &files {
        let full_path = save_dir.join(&file.file_name);
        let category = match file.file_type.as_str() {
            "mp4" | "mkv" | "avi" | "webm" | "mov" | "flv" => Some("Video".to_string()),
            "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "opus" => Some("Music".to_string()),
            "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" => Some("Compressed".to_string()),
            "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" => Some("Documents".to_string()),
            "exe" | "msi" | "apk" | "dmg" | "iso" | "img" => Some("Programs".to_string()),
            _ => None,
        };
        match engine.add_download(
            file.url.clone(),
            full_path.to_string_lossy().to_string(),
            4,
            category,
            None,
        ).await {
            Ok(_) => downloaded += 1,
            Err(e) => eprintln!("Failed to add grabbed download {}: {}", file.url, e),
        }
    }

    Ok(downloaded)
}
