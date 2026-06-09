use super::*;
use serde_json::Value;

/// Parse a single track from yt-dlp JSON output
pub fn parse_track(parsed: &Value, platform: &str) -> MusicTrack {
    let id = parsed["id"].as_str().unwrap_or("").to_string();
    let raw_title = parsed["title"]
        .as_str()
        .unwrap_or("Unknown Title")
        .to_string();

    // Try to extract artist and clean title
    let (artist, title) = extract_artist_title(&raw_title, parsed);

    let album = parsed["album"]
        .as_str()
        .or_else(|| parsed["playlist"].as_str())
        .map(|s| s.to_string());

    let album_artist = parsed["album_artist"]
        .as_str()
        .or_else(|| parsed["artist"].as_str())
        .map(|s| s.to_string());

    let track_number = parsed["track_number"]
        .as_u64()
        .or_else(|| parsed["track"].as_u64())
        .map(|n| n as u32);

    let total_tracks = parsed["n_entries"]
        .as_u64()
        .or_else(|| parsed["playlist_count"].as_u64())
        .map(|n| n as u32);

    let disc_number = parsed["disc_number"].as_u64().map(|n| n as u32);

    let year = parsed["release_year"]
        .as_u64()
        .or_else(|| {
            parsed["upload_date"]
                .as_str()
                .and_then(|d| d[..4].parse().ok())
        })
        .map(|y| y as u32);

    let genre = parsed["genre"].as_str().map(|s| s.to_string());

    let duration = parsed["duration"].as_f64();

    // Thumbnail: prefer highest quality
    let thumbnail = if let Some(thumbnails) = parsed["thumbnails"].as_array() {
        thumbnails
            .iter()
            .filter(|t| t["url"].as_str().is_some())
            .max_by_key(|t| t["height"].as_u64().unwrap_or(0))
            .and_then(|t| t["url"].as_str().map(|s| s.to_string()))
    } else {
        parsed["thumbnail"].as_str().map(|s| s.to_string())
    };

    let webpage_url = parsed["webpage_url"]
        .as_str()
        .or_else(|| parsed["url"].as_str())
        .unwrap_or("")
        .to_string();

    let uploader = parsed["uploader"]
        .as_str()
        .or_else(|| parsed["channel"].as_str())
        .unwrap_or("Unknown")
        .to_string();

    // Quality note based on available formats
    let quality_note = extract_quality_note(parsed);

    MusicTrack {
        id,
        title,
        artist,
        album,
        album_artist,
        track_number,
        total_tracks,
        disc_number,
        year,
        genre,
        duration,
        thumbnail,
        webpage_url,
        uploader,
        platform: platform.to_string(),
        quality_note,
    }
}

/// Extract artist and clean title from raw yt-dlp title
fn extract_artist_title(raw_title: &str, parsed: &Value) -> (String, String) {
    // 1. Use explicit artist field if available
    if let Some(artist) = parsed["artist"].as_str() {
        let title = parsed["track"].as_str().unwrap_or(raw_title).to_string();
        return (artist.to_string(), title);
    }

    // 2. Try "Artist - Title" format (most common)
    if let Some(sep_pos) = raw_title.find(" - ") {
        let artist = raw_title[..sep_pos].trim().to_string();
        let title = raw_title[sep_pos + 3..].trim().to_string();

        // Clean up common prefixes
        let artist = artist
            .trim_start_matches("Topic - ")
            .trim_start_matches("Official - ")
            .trim_start_matches("VEVO - ")
            .to_string();

        let title = clean_title(&title);
        return (artist, title);
    }

    // 3. Try "Artist: Title" format
    if let Some(sep_pos) = raw_title.find(": ") {
        let artist = raw_title[..sep_pos].trim().to_string();
        let title = raw_title[sep_pos + 2..].trim().to_string();
        let title = clean_title(&title);
        return (artist, title);
    }

    // 4. Try "Artist | Title" format
    if let Some(sep_pos) = raw_title.find(" | ") {
        let artist = raw_title[..sep_pos].trim().to_string();
        let title = raw_title[sep_pos + 3..].trim().to_string();
        let title = clean_title(&title);
        return (artist, title);
    }

    // 5. Fallback: use uploader as artist
    let artist = parsed["uploader"]
        .as_str()
        .unwrap_or("Unknown Artist")
        .to_string();
    let title = clean_title(raw_title);

    (artist, title)
}

/// Clean up title by removing common suffixes/prefixes
fn clean_title(title: &str) -> String {
    let mut cleaned = title.to_string();

    // Remove common suffixes (case-insensitive)
    let suffixes = [
        " (Official Video)",
        " (Official Music Video)",
        " (Lyric Video)",
        " (Lyrics)",
        " (Audio)",
        " (Official Audio)",
        " (Visualizer)",
        " [Official Video]",
        " [Official Music Video]",
        " [Lyric Video]",
        " [Lyrics]",
        " [Audio]",
        " [Official Audio]",
        " (HD)",
        " (HQ)",
        " (4K)",
        " (1080p)",
        " (720p)",
    ];

    for suffix in &suffixes {
        if cleaned.to_lowercase().ends_with(&suffix.to_lowercase()) {
            let end = cleaned.len() - suffix.len();
            cleaned = cleaned[..end].trim().to_string();
        }
    }

    // Remove "ft. Artist" and "feat. Artist" - keep them in title actually
    // But clean up excess whitespace
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Extract quality information from available formats
fn extract_quality_note(parsed: &Value) -> Option<String> {
    if let Some(formats) = parsed["formats"].as_array() {
        let mut best_audio: Option<(u64, &str)> = None;

        for fmt in formats {
            let abr = fmt["abr"].as_u64().unwrap_or(0);
            let acodec = fmt["acodec"].as_str().unwrap_or("none");

            if acodec != "none" && abr > best_audio.map(|(b, _)| b).unwrap_or(0) {
                best_audio = Some((abr, acodec));
            }
        }

        if let Some((abr, codec)) = best_audio {
            let codec_short = if codec.contains("opus") {
                "Opus"
            } else if codec.contains("aac") {
                "AAC"
            } else if codec.contains("mp3") || codec.contains("mp4a") {
                "AAC"
            } else if codec.contains("vorbis") {
                "Vorbis"
            } else {
                codec
            };
            return Some(format!("{} {}kbps", codec_short, abr));
        }
    }

    // Fallback: use abr from track info
    parsed["abr"].as_u64().map(|abr| format!("{}kbps", abr))
}
