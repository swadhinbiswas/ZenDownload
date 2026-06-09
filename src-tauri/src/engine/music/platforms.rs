use super::*;
use tokio::process::Command;
use serde_json::Value;

/// Search across all supported platforms
pub async fn search_all_platforms(
    query: &str,
    platform: &MusicPlatform,
    app: &tauri::AppHandle,
) -> Result<MusicSearchResult, String> {
    match platform {
        MusicPlatform::YouTube | MusicPlatform::YouTubeMusic => {
            search_youtube(query, platform, app).await
        }
        MusicPlatform::SoundCloud => search_soundcloud(query, app).await,
        MusicPlatform::Bandcamp => search_bandcamp(query, app).await,
        MusicPlatform::Audiomack => search_audiomack(query, app).await,
        MusicPlatform::Vimeo => search_vimeo(query, app).await,
    }
}

async fn run_ytdlp_search(
    search_query: &str,
    extra_args: Vec<&str>,
    app: &tauri::AppHandle,
) -> Result<Vec<Value>, String> {
    let ytdlp_path = super::get_ytdlp_path(app).await?;

    let mut command = Command::new(&ytdlp_path);
    command.arg(search_query);
    command.arg("--dump-json");
    command.arg("--flat-playlist");
    command.arg("--encoding").arg("utf-8");
    command.arg("--no-check-certificates");
    command.arg("--geo-bypass");

    for arg in extra_args {
        command.arg(arg);
    }

    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        // Don't fail on empty results
        if err_msg.contains("No matching entries found") || err_msg.contains("Empty playlist") {
            return Ok(vec![]);
        }
        return Err(format!("yt-dlp search failed: {}", err_msg.lines().next().unwrap_or("unknown error")));
    }

    let json_text = String::from_utf8_lossy(&output.stdout);
    let mut results = Vec::new();

    for line in json_text.lines() {
        let line = line.trim();
        if line.starts_with('{') {
            if let Ok(v) = serde_json::from_str::<Value>(line) {
                results.push(v);
            }
        }
    }

    Ok(results)
}

/// Search YouTube / YouTube Music
async fn search_youtube(
    query: &str,
    platform: &MusicPlatform,
    app: &tauri::AppHandle,
) -> Result<MusicSearchResult, String> {
    let search_prefix = "ytsearch10";

    let search_query = format!("{}:{}", search_prefix, query);

    let results = run_ytdlp_search(
        &search_query,
        vec![
            "--match-filter",
            "duration <= 900 & duration >= 60",
            "--extractor-args",
            "youtube:player_client=default,-web,-web_safari",
        ],
        app,
    ).await?;

    let mut tracks = Vec::new();
    let mut collections = Vec::new();

    for parsed in results {
        let entry_type = parsed["_type"].as_str().unwrap_or("video");

        if entry_type == "playlist" || entry_type == "multi_video" {
            // It's an album/playlist
            let collection = parse_collection(&parsed, platform.as_str());
            if !collection.tracks.is_empty() {
                collections.push(collection);
            }
        } else {
            let track = super::metadata::parse_track(&parsed, platform.as_str());
            tracks.push(track);
        }
    }

    Ok(MusicSearchResult {
        tracks,
        collections,
        query: query.to_string(),
        platform: platform.display_name().to_string(),
    })
}

/// Search SoundCloud
async fn search_soundcloud(
    query: &str,
    app: &tauri::AppHandle,
) -> Result<MusicSearchResult, String> {
    let search_query = format!("scsearch10:{}", query);

    let results = run_ytdlp_search(
        &search_query,
        vec!["--match-filter", "duration <= 900 & duration >= 60"],
        app,
    ).await?;

    let mut tracks = Vec::new();

    for parsed in results {
        let track = super::metadata::parse_track(&parsed, "soundcloud");
        tracks.push(track);
    }

    Ok(MusicSearchResult {
        tracks,
        collections: vec![],
        query: query.to_string(),
        platform: "SoundCloud".to_string(),
    })
}

/// Search Bandcamp
async fn search_bandcamp(
    query: &str,
    app: &tauri::AppHandle,
) -> Result<MusicSearchResult, String> {
    let search_query = format!("bcsearch10:{}", query);

    let results = run_ytdlp_search(
        &search_query,
        vec!["--match-filter", "duration <= 1800 & duration >= 60"],
        app,
    ).await?;

    let mut tracks = Vec::new();
    let mut collections = Vec::new();

    for parsed in results {
        let entry_type = parsed["_type"].as_str().unwrap_or("video");

        if entry_type == "playlist" || parsed["entries"].is_array() {
            let collection = parse_collection(&parsed, "bandcamp");
            if !collection.tracks.is_empty() {
                collections.push(collection);
            }
        } else {
            let track = super::metadata::parse_track(&parsed, "bandcamp");
            tracks.push(track);
        }
    }

    Ok(MusicSearchResult {
        tracks,
        collections,
        query: query.to_string(),
        platform: "Bandcamp".to_string(),
    })
}

/// Search Audiomack
async fn search_audiomack(
    query: &str,
    app: &tauri::AppHandle,
) -> Result<MusicSearchResult, String> {
    let search_query = format!("amsearch10:{}", query);

    let results = run_ytdlp_search(
        &search_query,
        vec!["--match-filter", "duration <= 900 & duration >= 60"],
        app,
    ).await?;

    let mut tracks = Vec::new();

    for parsed in results {
        let track = super::metadata::parse_track(&parsed, "audiomack");
        tracks.push(track);
    }

    Ok(MusicSearchResult {
        tracks,
        collections: vec![],
        query: query.to_string(),
        platform: "Audiomack".to_string(),
    })
}

/// Search Vimeo
async fn search_vimeo(
    query: &str,
    app: &tauri::AppHandle,
) -> Result<MusicSearchResult, String> {
    let search_query = format!("vimeosearch10:{}", query);

    let results = run_ytdlp_search(
        &search_query,
        vec!["--match-filter", "duration <= 900 & duration >= 60"],
        app,
    ).await?;

    let mut tracks = Vec::new();

    for parsed in results {
        let track = super::metadata::parse_track(&parsed, "vimeo");
        tracks.push(track);
    }

    Ok(MusicSearchResult {
        tracks,
        collections: vec![],
        query: query.to_string(),
        platform: "Vimeo".to_string(),
    })
}

/// Fetch full album/playlist tracks
pub async fn fetch_collection_tracks(
    url: &str,
    app: &tauri::AppHandle,
) -> Result<MusicCollection, String> {
    let ytdlp_path = super::get_ytdlp_path(app).await?;

    let mut command = Command::new(&ytdlp_path);
    command.arg(url);
    command.arg("--dump-json");
    command.arg("--flat-playlist");
    command.arg("--encoding").arg("utf-8");
    command.arg("--no-check-certificates");

    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp failed: {}", err_msg));
    }

    let json_text = String::from_utf8_lossy(&output.stdout);

    // Find the first JSON object (the playlist metadata)
    let first_json = json_text
        .lines()
        .map(|l| l.trim())
        .find(|l| l.starts_with('{'))
        .unwrap_or("{}");

    let parsed: Value = serde_json::from_str(first_json)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let platform = if url.contains("bandcamp") {
        "bandcamp"
    } else if url.contains("soundcloud") {
        "soundcloud"
    } else {
        "youtube"
    };

    Ok(parse_collection(&parsed, platform))
}

fn parse_collection(parsed: &Value, platform: &str) -> MusicCollection {
    let id = parsed["id"].as_str().unwrap_or("").to_string();
    let title = parsed["title"].as_str().unwrap_or("Unknown Album").to_string();
    let artist = parsed["uploader"]
        .as_str()
        .or_else(|| parsed["artist"].as_str())
        .unwrap_or("Unknown Artist")
        .to_string();
    let thumbnail = parsed["thumbnail"].as_str().map(|s| s.to_string());
    let webpage_url = parsed["webpage_url"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let year = parsed["release_year"]
        .as_u64()
        .or_else(|| parsed["upload_date"].as_str().and_then(|d| d[..4].parse().ok()))
        .map(|y| y as u32);

    let collection_type = if title.to_lowercase().contains("playlist") {
        CollectionType::Playlist
    } else if title.to_lowercase().contains("ep") || parsed["album_type"].as_str() == Some("ep") {
        CollectionType::EP
    } else if parsed["track_count"].as_u64().unwrap_or(0) == 1
        || title.to_lowercase().contains("single")
    {
        CollectionType::Single
    } else {
        CollectionType::Album
    };

    let mut tracks = Vec::new();
    if let Some(entries) = parsed["entries"].as_array() {
        for (idx, entry) in entries.iter().enumerate() {
            let mut track = super::metadata::parse_track(entry, platform);
            track.track_number = Some((idx + 1) as u32);
            track.total_tracks = Some(entries.len() as u32);
            track.album = Some(title.clone());
            track.album_artist = Some(artist.clone());
            tracks.push(track);
        }
    }

    MusicCollection {
        id,
        title,
        artist,
        thumbnail,
        webpage_url,
        tracks,
        platform: platform.to_string(),
        collection_type,
        year,
    }
}
