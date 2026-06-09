use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SniffedStream {
    pub url: String,
    pub stream_type: StreamType,
    pub quality: Option<String>,
    pub mime_type: Option<String>,
    pub title: Option<String>,
    pub duration: Option<f64>,
    pub site: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum StreamType {
    Hls,
    Dash,
    Mpd,
    M3u8,
    MpdManifest,
    VideoDirect,
    AudioDirect,
    Unknown,
}

impl StreamType {
    pub fn from_url(url: &str) -> Self {
        let lower = url.to_lowercase();
        if lower.contains(".m3u8") || lower.contains("manifest.m3u8") {
            StreamType::Hls
        } else if lower.contains(".mpd") || lower.contains("manifest.mpd") {
            StreamType::Dash
        } else if lower.contains("mime=video") || lower.contains("video/mp4") {
            StreamType::VideoDirect
        } else if lower.contains("mime=audio") || lower.contains("audio/") {
            StreamType::AudioDirect
        } else {
            StreamType::Unknown
        }
    }
}

/// Parse a network log entry from browser DevTools protocol
/// to detect video/audio streams.
pub fn parse_network_entry(entry: &NetworkEntry) -> Option<SniffedStream> {
    let url = &entry.url;
    let mime = entry.mime_type.as_deref();

    // Skip non-resource URLs
    if url.starts_with("data:") || url.starts_with("blob:") {
        return None;
    }

    let stream_type = StreamType::from_url(url);

    // Detect from MIME type
    let detected_type = match mime {
        Some("application/x-mpegURL") | Some("application/vnd.apple.mpegurl") => StreamType::Hls,
        Some("application/dash+xml") => StreamType::Dash,
        Some("video/mp4") | Some("video/webm") | Some("video/x-matroska") => StreamType::VideoDirect,
        Some("audio/mpeg") | Some("audio/mp3") | Some("audio/ogg") => StreamType::AudioDirect,
        _ => stream_type,
    };

    if detected_type == StreamType::Unknown {
        return None;
    }

    let quality = extract_quality_from_url(url);
    let site = extract_site_from_url(url);

    Some(SniffedStream {
        url: url.clone(),
        stream_type: detected_type,
        quality,
        mime_type: mime.map(|s| s.to_string()),
        title: None,
        duration: entry.duration,
        site,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkEntry {
    pub url: String,
    pub mime_type: Option<String>,
    pub resource_type: Option<String>,
    pub size: Option<i64>,
    pub duration: Option<f64>,
}

pub fn extract_quality_from_url(url: &str) -> Option<String> {
    let lower = url.to_lowercase();

    // Common quality indicators in URLs
    let qualities = [
        ("2160", "2160p (4K)"),
        ("1080", "1080p (FHD)"),
        ("720", "720p (HD)"),
        ("480", "480p (SD)"),
        ("360", "360p"),
        ("240", "240p"),
        ("144", "144p"),
    ];

    for (pattern, label) in &qualities {
        if lower.contains(pattern) {
            return Some(label.to_string());
        }
    }

    // Check for quality in segment parameters
    if lower.contains("hd") || lower.contains("high") {
        return Some("HD".to_string());
    }
    if lower.contains("sd") || lower.contains("low") {
        return Some("SD".to_string());
    }

    None
}

pub fn extract_site_from_url(url: &str) -> Option<String> {
    let lower = url.to_lowercase();
    let sites = [
        ("youtube.com", "YouTube"),
        ("googlevideo.com", "YouTube"),
        ("ytimg.com", "YouTube"),
        ("vimeo.com", "Vimeo"),
        ("vimeocdn.com", "Vimeo"),
        ("twitch.tv", "Twitch"),
        ("jwpcdn.com", "JW Player"),
        ("brightcove.com", "Brightcove"),
        ("cloudfront.net", "CloudFront"),
        ("akamaihd.net", "Akamai"),
        ("netflix.com", "Netflix"),
        ("hulu.com", "Hulu"),
        ("disneyplus.com", "Disney+"),
        ("amazon.com", "Amazon"),
        ("facebook.com", "Facebook"),
        ("instagram.com", "Instagram"),
        ("tiktok.com", "TikTok"),
        ("twitter.com", "Twitter"),
        ("x.com", "X"),
    ];

    for (domain, name) in &sites {
        if lower.contains(domain) {
            return Some(name.to_string());
        }
    }

    None
}

/// Merge duplicate streams (same URL, different quality hints).
pub fn merge_streams(streams: Vec<SniffedStream>) -> Vec<SniffedStream> {
    let mut merged: Vec<SniffedStream> = Vec::new();

    for stream in streams {
        if let Some(existing) = merged.iter_mut().find(|s| s.url == stream.url) {
            // Prefer higher quality info
            if stream.quality.is_some() && existing.quality.is_none() {
                existing.quality = stream.quality;
            }
            if stream.title.is_some() && existing.title.is_none() {
                existing.title = stream.title;
            }
            if stream.site.is_none() && stream.site.is_some() {
                existing.site = stream.site;
            }
        } else {
            merged.push(stream);
        }
    }

    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stream_type_from_url() {
        assert_eq!(StreamType::from_url("https://example.com/video.m3u8"), StreamType::Hls);
        assert_eq!(StreamType::from_url("https://example.com/manifest.mpd"), StreamType::Dash);
        assert_eq!(StreamType::from_url("https://example.com/video.mp4?token=abc"), StreamType::Unknown);
    }

    #[test]
    fn test_quality_extraction() {
        assert_eq!(extract_quality_from_url("https://cdn.example.com/1080p/video.m3u8"), Some("1080p (FHD)".to_string()));
        assert_eq!(extract_quality_from_url("https://cdn.example.com/720/video.mp4"), Some("720p (HD)".to_string()));
    }

    #[test]
    fn test_site_detection() {
        assert_eq!(extract_site_from_url("https://r4---sn-abc.googlevideo.com/videoplayback"), Some("YouTube".to_string()));
        assert_eq!(extract_site_from_url("https://v2.vimeocdn.com/video.mp4"), Some("Vimeo".to_string()));
    }
}
