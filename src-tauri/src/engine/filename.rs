use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilenameTemplate {
    pub template: String,
    pub variables: HashMap<String, String>,
}

pub fn clean_filename(input: &str) -> String {
    // Strip URL fragments
    let cleaned = input
        .split('?').next().unwrap_or(input)
        .split('#').next().unwrap_or(input);

    // Replace common URL-encoded characters
    let decoded = url_decode(cleaned);

    // Take only the filename portion
    let basename = decoded.rsplit(['/', '\\']).next().unwrap_or(&decoded);

    // Remove illegal characters
    let illegal_chars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let mut result = basename.to_string();
    for ch in illegal_chars {
        result = result.replace(ch, "_");
    }

    // Collapse multiple underscores/spaces
    while result.contains("__") {
        result = result.replace("__", "_");
    }
    while result.contains("  ") {
        result = result.replace("  ", " ");
    }

    // Trim leading/trailing whitespace and dots
    result = result.trim().trim_matches('.').to_string();

    // Truncate to reasonable length (most filesystems support 255 bytes)
    if result.len() > 200 {
        // Preserve extension if any
        if let Some(dot_idx) = result.rfind('.') {
            let ext = &result[dot_idx..];
            if ext.len() < 10 {
                let stem_len = 200 - ext.len();
                result = format!("{}{}", &result[..stem_len], ext);
            } else {
                result.truncate(200);
            }
        } else {
            result.truncate(200);
        }
    }

    // Ensure non-empty
    if result.is_empty() {
        result = format!("download_{}", chrono::Utc::now().timestamp_millis());
    }

    result
}

pub fn url_decode(s: &str) -> String {
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
        } else if c == '+' {
            result.push(' ');
        } else {
            result.push(c);
        }
    }
    result
}

pub fn render_template(template: &str, vars: &HashMap<String, String>) -> String {
    let mut result = template.to_string();
    for (key, value) in vars {
        let placeholder = format!("{{{}}}", key);
        result = result.replace(&placeholder, value);
    }
    // Apply filename cleaning to the result
    clean_filename(&result)
}

pub fn default_template() -> String {
    "{title}.{ext}".to_string()
}

/// Build a filename from a URL using smart defaults
pub fn filename_from_url(url: &str, content_type: Option<&str>) -> String {
    let url_clean = url.split('?').next().unwrap_or(url);
    let url_clean = url_clean.split('#').next().unwrap_or(url_clean);
    let basename = url_clean.rsplit(['/', '\\']).next().unwrap_or("download");

    if basename.contains('.') && !basename.starts_with('.') && basename.len() < 200 {
        return clean_filename(basename);
    }

    // No usable filename in URL; generate from content type or timestamp
    let ext = content_type.and_then(|ct| {
        if ct.contains("video/mp4") { Some("mp4") }
        else if ct.contains("video/webm") { Some("webm") }
        else if ct.contains("image/jpeg") { Some("jpg") }
        else if ct.contains("image/png") { Some("png") }
        else if ct.contains("audio/mpeg") { Some("mp3") }
        else if ct.contains("application/zip") { Some("zip") }
        else if ct.contains("application/pdf") { Some("pdf") }
        else { None }
    }).unwrap_or("bin");

    format!("download_{}.{}",
        chrono::Utc::now().timestamp_millis(), ext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_filename() {
        assert_eq!(clean_filename("hello<world>.txt"), "hello_world_.txt");
        assert_eq!(clean_filename("a/b/c.txt"), "c.txt");
        assert_eq!(clean_filename("file with spaces.mp4"), "file with spaces.mp4");
    }

    #[test]
    fn test_filename_from_url() {
        let name = filename_from_url("https://example.com/path/file.mp4", None);
        assert_eq!(name, "file.mp4");
    }
}
