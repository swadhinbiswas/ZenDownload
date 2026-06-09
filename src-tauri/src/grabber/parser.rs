use reqwest::Client;
use scraper::{Html, Selector};
use url::Url;
use std::collections::HashSet;
use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq, Eq, Hash)]
pub struct GrabbedResource {
    pub url: String,
    pub resource_type: String, // "Image", "Video", "Document", "Link", etc.
    pub filename: String,
}

pub async fn scrape_site(target_url: &str) -> Result<Vec<GrabbedResource>, Box<dyn std::error::Error>> {
    eprintln!("Starting site scrape for: {}", target_url);
    
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()?;
    
    let res = client.get(target_url).send().await?;
    let status = res.status();
    eprintln!("HTTP response status: {}", status);
    
    let content_type = res.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    eprintln!("Content-Type: {}", content_type);
    
    if !status.is_success() {
        return Err(format!("HTTP error: {}", status).into());
    }
    
    let body = res.text().await?;
    eprintln!("Raw response body length: {} bytes", body.len());
    
    if body.is_empty() {
        return Err("Empty response body from server".into());
    }
    
    // Check if response is actually HTML
    if !content_type.contains("html") {
        eprintln!("WARNING: Content-Type is not HTML: {}", content_type);
    }
    
    let document = Html::parse_document(&body);
    eprintln!("Parsed HTML document, length: {} bytes", body.len());
    
    let base_url = Url::parse(target_url)?;
    let mut resources = HashSet::new();

    // 1. Scrape <img>
    let img_selector = Selector::parse("img").unwrap();
    for element in document.select(&img_selector) {
        if let Some(src) = element.value().attr("src") {
            if let Ok(full_url) = base_url.join(src) {
                if !full_url.to_string().contains("data:") { // skip data URIs
                    resources.insert(create_resource("Image", full_url));
                }
            }
        }
        // Also check srcset
        if let Some(srcset) = element.value().attr("srcset") {
            for src in srcset.split(',') {
                if let Ok(full_url) = base_url.join(src.split_whitespace().next().unwrap_or("")) {
                    if !full_url.to_string().contains("data:") {
                        resources.insert(create_resource("Image", full_url));
                    }
                }
            }
        }
    }

    // 2. Scrape <video> and <source>
    let video_selectors = ["video", "source"];
    for tag in video_selectors {
        let selector = Selector::parse(tag).unwrap();
        for element in document.select(&selector) {
            if let Some(src) = element.value().attr("src") {
                if let Ok(full_url) = base_url.join(src) {
                    resources.insert(create_resource("Video", full_url));
                }
            }
            if let Some(poster) = element.value().attr("poster") {
                if let Ok(full_url) = base_url.join(poster) {
                    resources.insert(create_resource("Image", full_url));
                }
            }
        }
    }

    // 3. Scrape <a> links looking for file extensions
    
    // AGGRESSIVE MEDIA SNIFFING (Like IDM / ABDownloader): 
    // Search raw string structure for obfuscated m3u8 and mp4 URLs hidden inside JS app states, 
    // JSON objects, or custom CDN player configs (like hub.glasscdn.buzz).
    let mut start_idx = 0;
    while let Some(http_idx) = body[start_idx..].find("http") {
        let actual_start = start_idx + http_idx;
        let mut end_idx = actual_start;
        let bytes = body.as_bytes();
        while end_idx < body.len() {
            let c = bytes[end_idx] as char;
            if c == '"' || c == '\'' || c == '<' || c == '>' || c == '\n' || c == '\r' || c == ' ' || c == ',' {
                break;
            }
            end_idx += 1;
        }
        
        let possible_url = &body[actual_start..end_idx];
        let lower_url = possible_url.to_lowercase();
        // Decode javascript escaped URLs (\/ instead of /)
        let clean_url = possible_url.replace("\\/", "/").replace("\\\"", "");
        
        if lower_url.contains(".m3u8") || lower_url.contains(".mp4") || lower_url.contains(".mkv") || lower_url.contains(".webm") || lower_url.contains("blob:http") {
             if let Ok(full_url) = Url::parse(&clean_url) {
                 resources.insert(create_resource("Video", full_url));
             }
        }
        
        // Ensure forward progress
        start_idx = end_idx + 1;
        if start_idx >= body.len() { break; }
    }

    let a_selector = Selector::parse("a").unwrap();
    for element in document.select(&a_selector) {
        if let Some(href) = element.value().attr("href") {
            if let Ok(full_url) = base_url.join(href) {
                let ty = guess_type_from_url(&full_url);
                resources.insert(create_resource(ty, full_url.clone()));
            }
        }
    }

    // 4. Scrape favicon / icons
    let link_selector = Selector::parse("link").unwrap();
    for element in document.select(&link_selector) {
        if let Some(rel) = element.value().attr("rel") {
            if rel.to_lowercase().contains("icon") {
                if let Some(href) = element.value().attr("href") {
                    if let Ok(full_url) = base_url.join(href) {
                        resources.insert(create_resource("Icon", full_url));
                    }
                }
            }
        }
    }

    eprintln!("Found {} unique resources", resources.len());
    Ok(resources.into_iter().collect())
}

fn create_resource(r_type: &str, url: Url) -> GrabbedResource {
    let url_str = url.to_string();
    let mut filename = String::new();
    
    eprintln!("DEBUG create_resource: URL = {}", url_str);
    
    // Try to extract filename from path
    if let Some(seg) = url.path_segments().and_then(|mut segs| segs.next_back()) {
        let decoded = urlencoding_decode(seg);
        eprintln!("DEBUG: path_segments got: '{}', decoded: '{}'", seg, decoded);
        if !decoded.is_empty() && decoded.len() < 200 && decoded != "/" {
            filename = decoded;
        }
    }
    
    // Try query parameter (filename=, name=, etc.)
    if filename.is_empty() {
        if let Some(query) = url.query() {
            eprintln!("DEBUG: query = {}", query);
            for param in query.split('&') {
                if param.starts_with("filename=") || param.starts_with("name=") {
                    if let Some(name) = param.split('=').nth(1) {
                        let decoded = urlencoding_decode(name);
                        eprintln!("DEBUG: query param got: '{}', decoded: '{}'", name, decoded);
                        if !decoded.is_empty() && decoded.len() < 200 {
                            filename = decoded;
                            break;
                        }
                    }
                }
            }
        }
    }
    
    // Try to extract from path again with rsplit
    if filename.is_empty() {
        if let Some(last) = url.path().rsplit('/').next() {
            let decoded = urlencoding_decode(last);
            eprintln!("DEBUG: rsplit got: '{}', decoded: '{}'", last, decoded);
            if !decoded.is_empty() && decoded.len() < 200 && decoded != "/" {
                filename = decoded;
            }
        }
    }
    
    // Truncate extremely long URLs and create sensible name
    if filename.is_empty() || filename.len() > 200 {
        eprintln!("DEBUG: Generating fallback filename for type: {}", r_type);
        let ext = match r_type {
            "Video" => "mp4",
            "Image" => "jpg", 
            "Audio" => "mp3",
            "Archive" => "zip",
            "Document" => "pdf",
            _ => "dat"
        };
        filename = format!("download_{}.{}", 
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis(),
            ext
        );
    }
    
    eprintln!("DEBUG: Final filename = '{}'", filename);
    
    GrabbedResource {
        url: url_str,
        resource_type: r_type.to_string(),
        filename,
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
    if result.is_empty() { "untitled".to_string() } else { result }
}

fn guess_type_from_url(url: &Url) -> &str {
    let path = url.path().to_lowercase();
    if path.ends_with(".mp4") || path.ends_with(".webm") || path.ends_with(".mkv") {
        "Video"
    } else if path.ends_with(".jpg") || path.ends_with(".png") || path.ends_with(".gif") || path.ends_with(".svg") || path.ends_with(".webp") {
        "Image"
    } else if path.ends_with(".ico") || path.ends_with(".icns") {
        "Icon"
    } else if path.ends_with(".mp3") || path.ends_with(".wav") || path.ends_with(".ogg") {
        "Audio"
    } else if path.ends_with(".zip") || path.ends_with(".rar") || path.ends_with(".7z") || path.ends_with(".tar") || path.ends_with(".gz") {
        "Archive"
    } else if path.ends_with(".pdf") || path.ends_with(".doc") || path.ends_with(".docx") {
        "Document"
    } else if path.ends_with(".exe") || path.ends_with(".dmg") || path.ends_with(".iso") || path.ends_with(".apk") {
        "Program"
    } else {
        "Webpage"
    }
}
