use reqwest;
use serde::{Deserialize, Serialize};

/// Spotify track/album/playlist metadata from public embed/oEmbed API
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpotifyTrackInfo {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration_ms: Option<u64>,
    pub thumbnail: Option<String>,
    pub uri: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpotifyPlaylistInfo {
    pub id: String,
    pub title: String,
    pub owner: String,
    pub track_count: Option<u32>,
    pub thumbnail: Option<String>,
    pub uri: String,
}

/// Check if a URL is a Spotify link
pub fn is_spotify_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("open.spotify.com") || lower.contains("spotify.com")
}

/// Extract Spotify ID and type from URL
/// Supports:
/// - https://open.spotify.com/track/1q6pMQBRILzkz0g4rKEXdM
/// - https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv
/// - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
/// - spotify:track:1q6pMQBRILzkz0g4rKEXdM
pub fn parse_spotify_url(url: &str) -> Option<(&'static str, String)> {
    let trimmed = url.trim();
    let lower = trimmed.to_lowercase();

    // Handle Spotify URI format: spotify:track:ID
    if lower.starts_with("spotify:") {
        let parts: Vec<&str> = lower.split(':').collect();
        if parts.len() >= 3 && !parts[2].is_empty() {
            let item_type = match parts[1] {
                "track" => "track",
                "album" => "album",
                "playlist" => "playlist",
                _ => return None,
            };
            return Some((item_type, parts[2].to_string()));
        }
        return None;
    }

    // Handle HTTP URL format - normalize by removing trailing slashes first
    let normalized = if lower.ends_with('/') {
        &trimmed[..trimmed.len()-1]
    } else {
        trimmed
    };

    // Use regex-like pattern matching for robust extraction
    if let Some(pos) = lower.find("/track/") {
        let after = &normalized[pos + 7..]; // skip "/track/"
        let id = after.split('?').next()?.split('/').next()?;
        if !id.is_empty() {
            return Some(("track", id.to_string()));
        }
    }

    if let Some(pos) = lower.find("/album/") {
        let after = &normalized[pos + 7..]; // skip "/album/"
        let id = after.split('?').next()?.split('/').next()?;
        if !id.is_empty() {
            return Some(("album", id.to_string()));
        }
    }

    if let Some(pos) = lower.find("/playlist/") {
        let after = &normalized[pos + 10..]; // skip "/playlist/"
        let id = after.split('?').next()?.split('/').next()?;
        if !id.is_empty() {
            return Some(("playlist", id.to_string()));
        }
    }

    None
}

/// Fetch track metadata from Spotify's public oEmbed API (no auth required)
pub async fn fetch_track_info(track_id: &str) -> Result<SpotifyTrackInfo, String> {
    let url = format!("https://open.spotify.com/oembed?url=https://open.spotify.com/track/{}", track_id);

    let client = reqwest::Client::new();
    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Spotify metadata: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Spotify API returned HTTP {}", response.status()));
    }

    let data: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse Spotify response: {}", e))?;

    let title = data["title"].as_str().unwrap_or("Unknown Track").to_string();
    let author_name = data["author_name"].as_str().unwrap_or("Unknown Artist").to_string();
    let thumbnail = data["thumbnail_url"].as_str().map(|s| s.to_string());

    Ok(SpotifyTrackInfo {
        id: track_id.to_string(),
        title,
        artist: author_name,
        album: None,
        duration_ms: None,
        thumbnail,
        uri: format!("spotify:track:{}", track_id),
    })
}

/// Fetch album/playlist metadata from Spotify's public oEmbed API
pub async fn fetch_collection_info(item_type: &str, item_id: &str) -> Result<SpotifyPlaylistInfo, String> {
    let url = format!(
        "https://open.spotify.com/oembed?url=https://open.spotify.com/{}/{}",
        item_type, item_id
    );

    let client = reqwest::Client::new();
    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Spotify metadata: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Spotify API returned HTTP {}", response.status()));
    }

    let data: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse Spotify response: {}", e))?;

    let title = data["title"].as_str().unwrap_or("Unknown Collection").to_string();
    let author_name = data["author_name"].as_str().unwrap_or("Unknown Artist").to_string();
    let thumbnail = data["thumbnail_url"].as_str().map(|s| s.to_string());

    Ok(SpotifyPlaylistInfo {
        id: item_id.to_string(),
        title,
        owner: author_name,
        track_count: None,
        thumbnail,
        uri: format!("spotify:{}:{}", item_type, item_id),
    })
}

/// Convert Spotify URL to search query for YouTube Music
pub fn spotify_to_search_query(track_info: &SpotifyTrackInfo) -> String {
    format!("{} {}", track_info.artist, track_info.title)
}

/// Validate and reject DRM-protected URLs
pub fn validate_no_drm(url: &str) -> Result<(), String> {
    let lower = url.to_lowercase();

    // Spotify
    if is_spotify_url(url) {
        return Err(
            "Spotify uses DRM encryption that cannot be bypassed.\n\n\
            Try one of these alternatives:\n\
            • Use the Music Downloader to search for this track on YouTube Music\n\
            • Paste the Spotify link in the Music Downloader's Spotify Converter tab\n\
            • Purchase/download from Bandcamp (supports artists directly)".to_string()
        );
    }

    // Other known DRM platforms
    if lower.contains("apple.music") || lower.contains("music.apple.com") {
        return Err("Apple Music uses DRM encryption and cannot be downloaded. Try YouTube Music or Bandcamp instead.".to_string());
    }

    if lower.contains("tidal.com") {
        return Err("Tidal uses DRM encryption and cannot be downloaded. Try YouTube Music or Bandcamp instead.".to_string());
    }

    if lower.contains("deezer.com") {
        return Err("Deezer uses DRM encryption and cannot be downloaded. Try YouTube Music or Bandcamp instead.".to_string());
    }

    if lower.contains("amazon.com/music") || lower.contains("music.amazon") {
        return Err("Amazon Music uses DRM encryption and cannot be downloaded. Try YouTube Music or Bandcamp instead.".to_string());
    }

    if lower.contains("netflix.com") {
        return Err("Netflix uses DRM encryption and cannot be downloaded.".to_string());
    }

    if lower.contains("disneyplus.com") || lower.contains("disney.plus") {
        return Err("Disney+ uses DRM encryption and cannot be downloaded.".to_string());
    }

    if lower.contains("primevideo.com") || lower.contains("amazon.com/gp/video") {
        return Err("Amazon Prime Video uses DRM encryption and cannot be downloaded.".to_string());
    }

    if lower.contains("hulu.com") || lower.contains("hulu.watch") {
        return Err("Hulu uses DRM encryption and cannot be downloaded.".to_string());
    }

    if lower.contains("hbomax.com") || lower.contains("max.com") {
        return Err("HBO Max uses DRM encryption and cannot be downloaded.".to_string());
    }

    Ok(())
}
