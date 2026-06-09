use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<u32>,
    pub overview: Option<String>,
    pub poster_url: Option<String>,
    pub background_url: Option<String>,
}

pub fn guess_category(filename: &str) -> String {
    let ext = std::path::Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
        
    match ext.as_str() {
        "mp4" | "mkv" | "avi" | "webm" | "flv" | "mov" => "Video".to_string(),
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" => "Music".to_string(),
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" => "Compressed".to_string(),
        "exe" | "msi" | "apk" | "dmg" | "iso" | "appimage" => "Programs".to_string(),
        "pdf" | "doc" | "docx" | "txt" | "md" | "xls" | "xlsx" | "ppt" | "pptx" | "epub" => "Documents".to_string(),
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "bmp" => "Images".to_string(),
        _ => "General".to_string()
    }
}

// In a real application, you might want to call TMDB API for Videos
// or MusicBrainz for Audio. We will stub these out for now.
pub async fn fetch_metadata(filename: &str, category: &str) -> Option<MediaMetadata> {
    if category == "Video" {
        // Stub: In reality, call TMDB API here using reqwest
        // e.g., reqwest::get(format!("https://api.themoviedb.org/3/search/movie?query={}", clean_title))
        let clean_title = filename
            .replace(".mp4", "")
            .replace(".mkv", "")
            .replace(".", " ")
            .replace("_", " ");
            
        Some(MediaMetadata {
            title: Some(clean_title),
            artist: None,
            album: None,
            year: None,
            overview: Some("Automatically categorized video file.".to_string()),
            poster_url: None, // Could be a TMDB image URL
            background_url: None,
        })
    } else if category == "Music" {
        // Stub: In reality, call Spotify API or MusicBrainz here
        let clean_title = filename
            .replace(".mp3", "")
            .replace(".flac", "");
            
        Some(MediaMetadata {
            title: Some(clean_title),
            artist: Some("Unknown Artist".to_string()),
            album: None,
            year: None,
            overview: None,
            poster_url: None,
            background_url: None,
        })
    } else {
        None
    }
}
