pub mod platforms;
pub mod metadata;
pub mod spotify;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Supported music platforms
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MusicPlatform {
    #[serde(rename = "youtube")]
    YouTube,
    #[serde(rename = "youtube_music")]
    YouTubeMusic,
    #[serde(rename = "soundcloud")]
    SoundCloud,
    #[serde(rename = "bandcamp")]
    Bandcamp,
    #[serde(rename = "audiomack")]
    Audiomack,
    #[serde(rename = "vimeo")]
    Vimeo,
}

impl MusicPlatform {
    pub fn as_str(&self) -> &'static str {
        match self {
            MusicPlatform::YouTube => "youtube",
            MusicPlatform::YouTubeMusic => "youtube_music",
            MusicPlatform::SoundCloud => "soundcloud",
            MusicPlatform::Bandcamp => "bandcamp",
            MusicPlatform::Audiomack => "audiomack",
            MusicPlatform::Vimeo => "vimeo",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            MusicPlatform::YouTube => "YouTube",
            MusicPlatform::YouTubeMusic => "YouTube Music",
            MusicPlatform::SoundCloud => "SoundCloud",
            MusicPlatform::Bandcamp => "Bandcamp",
            MusicPlatform::Audiomack => "Audiomack",
            MusicPlatform::Vimeo => "Vimeo",
        }
    }
}

/// Rich music track metadata
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct MusicTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub total_tracks: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub webpage_url: String,
    pub uploader: String,
    pub platform: String,
    pub quality_note: Option<String>,
}

/// Album or playlist collection
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MusicCollection {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub thumbnail: Option<String>,
    pub webpage_url: String,
    pub tracks: Vec<MusicTrack>,
    pub platform: String,
    pub collection_type: CollectionType,
    pub year: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum CollectionType {
    #[serde(rename = "album")]
    Album,
    #[serde(rename = "playlist")]
    Playlist,
    #[serde(rename = "ep")]
    EP,
    #[serde(rename = "single")]
    Single,
}

/// Search results wrapper
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MusicSearchResult {
    pub tracks: Vec<MusicTrack>,
    pub collections: Vec<MusicCollection>,
    pub query: String,
    pub platform: String,
}

/// Audio format and quality options
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioFormat {
    pub id: String,
    pub name: String,
    pub description: String,
    pub yt_dlp_format: String,
    pub yt_dlp_quality: String,
}

impl AudioFormat {
    pub fn all() -> Vec<AudioFormat> {
        vec![
            AudioFormat {
                id: "best".to_string(),
                name: "Best Available".to_string(),
                description: "Highest quality source audio".to_string(),
                yt_dlp_format: "bestaudio/best".to_string(),
                yt_dlp_quality: "0".to_string(),
            },
            AudioFormat {
                id: "flac".to_string(),
                name: "FLAC Lossless".to_string(),
                description: "Uncompressed CD-quality (Bandcamp only)".to_string(),
                yt_dlp_format: "bestaudio/best".to_string(),
                yt_dlp_quality: "0".to_string(),
            },
            AudioFormat {
                id: "opus".to_string(),
                name: "Opus 251".to_string(),
                description: "~160kbps, best efficiency".to_string(),
                yt_dlp_format: "251/bestaudio[abr>=160]/bestaudio/best".to_string(),
                yt_dlp_quality: "0".to_string(),
            },
            AudioFormat {
                id: "m4a".to_string(),
                name: "M4A 256".to_string(),
                description: "256kbps AAC (YouTube Music quality)".to_string(),
                yt_dlp_format: "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best".to_string(),
                yt_dlp_quality: "0".to_string(),
            },
            AudioFormat {
                id: "mp3_320".to_string(),
                name: "MP3 320".to_string(),
                description: "320kbps MP3".to_string(),
                yt_dlp_format: "bestaudio/best".to_string(),
                yt_dlp_quality: "320K".to_string(),
            },
            AudioFormat {
                id: "mp3_256".to_string(),
                name: "MP3 256".to_string(),
                description: "256kbps MP3".to_string(),
                yt_dlp_format: "bestaudio/best".to_string(),
                yt_dlp_quality: "256K".to_string(),
            },
            AudioFormat {
                id: "mp3_192".to_string(),
                name: "MP3 192".to_string(),
                description: "192kbps MP3".to_string(),
                yt_dlp_format: "bestaudio/best".to_string(),
                yt_dlp_quality: "192K".to_string(),
            },
            AudioFormat {
                id: "mp3_128".to_string(),
                name: "MP3 128".to_string(),
                description: "128kbps MP3".to_string(),
                yt_dlp_format: "bestaudio/best".to_string(),
                yt_dlp_quality: "128K".to_string(),
            },
            AudioFormat {
                id: "wav".to_string(),
                name: "WAV".to_string(),
                description: "Uncompressed PCM".to_string(),
                yt_dlp_format: "bestaudio/best".to_string(),
                yt_dlp_quality: "0".to_string(),
            },
        ]
    }

    pub fn by_id(id: &str) -> Option<AudioFormat> {
        Self::all().into_iter().find(|f| f.id == id)
    }
}

/// Download options for music
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MusicDownloadOptions {
    pub format_id: String,
    pub embed_thumbnail: bool,
    pub embed_metadata: bool,
    pub browser_for_cookies: Option<String>,
    pub cookies_path: Option<String>,
    pub proxy_url: Option<String>,
    pub write_lyrics: bool,
    pub add_metadata: bool,
    pub parse_metadata: bool,
}

impl Default for MusicDownloadOptions {
    fn default() -> Self {
        Self {
            format_id: "best".to_string(),
            embed_thumbnail: true,
            embed_metadata: true,
            browser_for_cookies: None,
            cookies_path: None,
            proxy_url: None,
            write_lyrics: false,
            add_metadata: true,
            parse_metadata: true,
        }
    }
}

pub async fn get_ytdlp_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    crate::engine::stream::get_ytdlp_path(app).await
}

/// Public search API used by lib.rs
pub async fn search_music(
    query: &str,
    source: &str,
    app: &tauri::AppHandle,
) -> Result<MusicSearchResult, String> {
    let platform = match source {
        "youtube" => MusicPlatform::YouTube,
        "youtube_music" => MusicPlatform::YouTubeMusic,
        "soundcloud" => MusicPlatform::SoundCloud,
        "bandcamp" => MusicPlatform::Bandcamp,
        "audiomack" => MusicPlatform::Audiomack,
        "vimeo" => MusicPlatform::Vimeo,
        _ => MusicPlatform::YouTube,
    };
    platforms::search_all_platforms(query, &platform, app).await
}

/// Public download API used by lib.rs
pub async fn download_music(
    url: String,
    save_dir: String,
    options: MusicDownloadOptions,
    engine: &crate::engine::DownloadEngine,
) -> Result<String, String> {
    let audio_format = AudioFormat::by_id(&options.format_id)
        .or_else(|| AudioFormat::by_id("best"))
        .ok_or("Invalid audio format ID")?;

    // Map format_id to yt-dlp audio format string
    let yt_audio_format = match options.format_id.as_str() {
        "flac" => "flac",
        "opus" => "opus",
        "m4a" => "m4a",
        "mp3_320" | "mp3_256" | "mp3_192" | "mp3_128" => "mp3",
        "wav" => "wav",
        "aac" => "aac",
        _ => "best",
    };

    let extra_meta = serde_json::json!({
        "format": audio_format.yt_dlp_format,
        "audioExtract": true,
        "audioFormat": yt_audio_format,
        "audioQuality": audio_format.yt_dlp_quality,
        "browserForCookies": options.browser_for_cookies,
        "cookiesPath": options.cookies_path,
        "proxyUrl": options.proxy_url,
        "embedThumbnail": options.embed_thumbnail,
        "embedMetadata": options.embed_metadata,
        "embedSubs": false,
        "embedChapters": false,
        "addMetadata": options.add_metadata,
        "parseMetadata": options.parse_metadata,
    });

    let template = format!("{}/%(title)s.%(ext)s", save_dir.trim_end_matches('/'));

    engine.add_download(
        url,
        template,
        4,
        Some("Music".to_string()),
        Some(extra_meta.to_string()),
    ).await
}
