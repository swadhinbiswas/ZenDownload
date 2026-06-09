use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversionPreset {
    pub id: String,
    pub name: String,
    pub input_types: Vec<String>,
    pub output_ext: String,
    pub ffmpeg_args: Vec<String>,
    pub is_builtin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConvertProgress {
    pub download_id: String,
    pub status: String,
    pub progress: f64,
    pub output_path: Option<String>,
    pub error: Option<String>,
}

fn builtin_presets() -> Vec<ConversionPreset> {
    vec![
        ConversionPreset {
            id: "mp4_h264".into(),
            name: "MP4 (H.264)".into(),
            input_types: vec!["mkv", "avi", "webm", "flv", "mov", "ts", "mpg", "mpeg", "wmv", "3gp"].into_iter().map(String::from).collect(),
            output_ext: "mp4".into(),
            ffmpeg_args: vec!["-c:v", "libx264", "-crf", "23", "-preset", "medium", "-c:a", "aac", "-b:a", "192k"].into_iter().map(String::from).collect(),
            is_builtin: true,
        },
        ConversionPreset {
            id: "mp4_h265".into(),
            name: "MP4 (H.265/HEVC)".into(),
            input_types: vec!["mkv", "avi", "webm", "flv", "mov", "ts"].into_iter().map(String::from).collect(),
            output_ext: "mp4".into(),
            ffmpeg_args: vec!["-c:v", "libx265", "-crf", "28", "-preset", "medium", "-c:a", "aac", "-b:a", "192k"].into_iter().map(String::from).collect(),
            is_builtin: true,
        },
        ConversionPreset {
            id: "webm_vp9".into(),
            name: "WebM (VP9)".into(),
            input_types: vec!["mkv", "avi", "mp4", "mov", "ts"].into_iter().map(String::from).collect(),
            output_ext: "webm".into(),
            ffmpeg_args: vec!["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-c:a", "libopus", "-b:a", "128k"].into_iter().map(String::from).collect(),
            is_builtin: true,
        },
        ConversionPreset {
            id: "mp3_320".into(),
            name: "MP3 (320kbps)".into(),
            input_types: vec!["flac", "wav", "aac", "ogg", "m4a", "opus", "wma", "ape", "alac"].into_iter().map(String::from).collect(),
            output_ext: "mp3".into(),
            ffmpeg_args: vec!["-c:a", "libmp3lame", "-b:a", "320k", "-vn"].into_iter().map(String::from).collect(),
            is_builtin: true,
        },
        ConversionPreset {
            id: "mp3_192".into(),
            name: "MP3 (192kbps)".into(),
            input_types: vec!["flac", "wav", "aac", "ogg", "m4a", "opus", "wma"].into_iter().map(String::from).collect(),
            output_ext: "mp3".into(),
            ffmpeg_args: vec!["-c:a", "libmp3lame", "-b:a", "192k", "-vn"].into_iter().map(String::from).collect(),
            is_builtin: true,
        },
        ConversionPreset {
            id: "aac_256".into(),
            name: "AAC (256kbps)".into(),
            input_types: vec!["flac", "wav", "mp3", "ogg", "m4a", "opus", "wma"].into_iter().map(String::from).collect(),
            output_ext: "m4a".into(),
            ffmpeg_args: vec!["-c:a", "aac", "-b:a", "256k", "-vn"].into_iter().map(String::from).collect(),
            is_builtin: true,
        },
        ConversionPreset {
            id: "flac_lossless".into(),
            name: "FLAC (Lossless)".into(),
            input_types: vec!["wav", "mp3", "aac", "ogg", "m4a", "wma"].into_iter().map(String::from).collect(),
            output_ext: "flac".into(),
            ffmpeg_args: vec!["-c:a", "flac", "-vn"].into_iter().map(String::from).collect(),
            is_builtin: true,
        },
        ConversionPreset {
            id: "opus_128".into(),
            name: "Opus (128kbps)".into(),
            input_types: vec!["flac", "wav", "mp3", "aac", "ogg", "m4a", "wma"].into_iter().map(String::from).collect(),
            output_ext: "opus".into(),
            ffmpeg_args: vec!["-c:a", "libopus", "-b:a", "128k", "-vn"].into_iter().map(String::from).collect(),
            is_builtin: true,
        },
        ConversionPreset {
            id: "gif_from_video".into(),
            name: "GIF from Video".into(),
            input_types: vec!["mp4", "mkv", "webm", "avi", "mov", "flv"].into_iter().map(String::from).collect(),
            output_ext: "gif".into(),
            ffmpeg_args: vec!["-vf", "fps=10,scale=480:-1:flags=lanczos", "-loop", "0"].into_iter().map(String::from).collect(),
            is_builtin: true,
        },
    ]
}

pub fn get_all_presets() -> Vec<ConversionPreset> {
    builtin_presets()
}

pub fn get_preset_for_file(file_path: &str, preset_id: &str) -> Option<ConversionPreset> {
    let ext = Path::new(file_path)
        .extension()?
        .to_str()?
        .to_lowercase();

    let presets = builtin_presets();
    presets.into_iter().find(|p| {
        p.id == preset_id && p.input_types.contains(&ext)
    })
}

pub fn get_compatible_presets(file_path: &str) -> Vec<ConversionPreset> {
    let ext = Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    builtin_presets()
        .into_iter()
        .filter(|p| p.input_types.contains(&ext))
        .collect()
}

pub async fn convert_file(
    input_path: &str,
    preset_id: &str,
    download_id: &str,
) -> Result<ConvertProgress, String> {
    let preset = get_preset_for_file(input_path, preset_id)
        .ok_or_else(|| format!("No preset '{}' found for this file type", preset_id))?;

    let input = Path::new(input_path);
    if !input.exists() {
        return Err(format!("Input file not found: {}", input_path));
    }

    let output_path = input.with_extension(&preset.ffmpeg_args.last().unwrap_or(&String::new()));
    let output_path = input.with_file_name(format!(
        "{}.{}",
        input.file_stem().unwrap_or_default().to_string_lossy(),
        preset.output_ext
    ));

    // Find ffmpeg
    let ffmpeg_path = find_ffmpeg().await?;

    let mut cmd = tokio::process::Command::new(&ffmpeg_path);
    cmd.arg("-i").arg(input_path);
    for arg in &preset.ffmpeg_args {
        cmd.arg(arg);
    }
    cmd.arg("-y"); // overwrite output
    cmd.arg(&output_path);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let output = cmd.output().await.map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let short_err = stderr.lines().last().unwrap_or("Unknown ffmpeg error");
        return Ok(ConvertProgress {
            download_id: download_id.to_string(),
            status: "Failed".into(),
            progress: 0.0,
            output_path: None,
            error: Some(short_err.to_string()),
        });
    }

    Ok(ConvertProgress {
        download_id: download_id.to_string(),
        status: "Completed".into(),
        progress: 100.0,
        output_path: Some(output_path.to_string_lossy().to_string()),
        error: None,
    })
}

async fn find_ffmpeg() -> Result<String, String> {
    // Try common paths
    let candidates = if cfg!(target_os = "windows") {
        vec![
            "ffmpeg.exe".to_string(),
            "C:\\ffmpeg\\bin\\ffmpeg.exe".to_string(),
            dirs_fallback().map(|d| format!("{}/ffmpeg.exe", d)).unwrap_or_default(),
        ]
    } else {
        vec![
            "/usr/bin/ffmpeg".to_string(),
            "/usr/local/bin/ffmpeg".to_string(),
            "/opt/homebrew/bin/ffmpeg".to_string(),
            format!("{}/bin/ffmpeg", std::env::var("HOME").unwrap_or_default()),
        ]
    };

    for candidate in &candidates {
        if candidate.is_empty() { continue; }
        if tokio::process::Command::new(candidate)
            .arg("-version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await
            .is_ok()
        {
            return Ok(candidate.clone());
        }
    }

    // Try which/where
    let which_cmd = if cfg!(target_os = "windows") { "where" } else { "which" };
    if let Ok(output) = tokio::process::Command::new(which_cmd)
        .arg("ffmpeg")
        .output()
        .await
    {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Ok(path.lines().next().unwrap_or(&path).to_string());
        }
    }

    Err("ffmpeg not found. Install ffmpeg and ensure it's in your PATH.".into())
}

fn dirs_fallback() -> Option<String> {
    std::env::var("LOCALAPPDATA")
        .or_else(|_| std::env::var("APPDATA"))
        .ok()
}
