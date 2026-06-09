use std::process::Command;
use tokio::fs;

#[derive(Debug)]
pub enum PostProcessAction {
    ConvertToMp4,
    ExtractAudio,
    ExtractArchive,
    None,
}

pub async fn run_post_processing(
    file_path: &str,
    action: PostProcessAction,
) -> Result<String, String> {
    match action {
        PostProcessAction::None => Ok(file_path.to_string()),
        PostProcessAction::ConvertToMp4 => {
            let path = std::path::Path::new(file_path);
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            
            if ext.to_lowercase() == "mp4" {
                return Ok(file_path.to_string());
            }

            let new_path = path.with_extension("mp4");
            let new_path_str = new_path.to_string_lossy().to_string();

            // Use ffmpeg to convert
            let output = Command::new("ffmpeg")
                .arg("-y") // Overwrite output
                .arg("-i")
                .arg(file_path)
                .arg("-c:v")
                .arg("copy") // Try to copy video codec first
                .arg("-c:a")
                .arg("aac")  // Convert audio to aac for better mp4 compatibility
                .arg(&new_path_str)
                .output()
                .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("ffmpeg conversion failed: {}", stderr));
            }

            // Optionally delete old file
            let _ = fs::remove_file(file_path).await;

            Ok(new_path_str)
        },
        PostProcessAction::ExtractAudio => {
            let path = std::path::Path::new(file_path);
            let new_path = path.with_extension("mp3");
            let new_path_str = new_path.to_string_lossy().to_string();

            let output = Command::new("ffmpeg")
                .arg("-y")
                .arg("-i")
                .arg(file_path)
                .arg("-vn") // No video
                .arg("-acodec")
                .arg("libmp3lame")
                .arg("-q:a")
                .arg("2") // High quality VBR
                .arg(&new_path_str)
                .output()
                .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("ffmpeg audio extraction failed: {}", stderr));
            }

            // Optionally delete old file
            let _ = fs::remove_file(file_path).await;

            Ok(new_path_str)
        },
        PostProcessAction::ExtractArchive => {
            let path = std::path::Path::new(file_path);
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            
            let parent_dir = path.parent().unwrap_or(std::path::Path::new("."));
            let file_stem = path.file_stem().unwrap_or(std::ffi::OsStr::new("extracted"));
            let extract_dir = parent_dir.join(file_stem);
            
            if !extract_dir.exists() {
                fs::create_dir_all(&extract_dir).await.map_err(|e| e.to_string())?;
            }

            let extract_dir_str = extract_dir.to_string_lossy().to_string();

            let success = if ext == "zip" {
                #[cfg(windows)]
                {
                    let output = Command::new("powershell")
                        .args(["-Command", &format!("Expand-Archive -Path '{}' -DestinationPath '{}' -Force", file_path, extract_dir_str)])
                        .output()
                        .map_err(|e| e.to_string())?;
                    output.status.success()
                }
                #[cfg(not(windows))]
                {
                    let output = Command::new("unzip")
                        .arg("-o")
                        .arg(file_path)
                        .arg("-d")
                        .arg(&extract_dir_str)
                        .output()
                        .map_err(|e| e.to_string())?;
                    output.status.success()
                }
            } else if ext == "7z" {
                let output = Command::new("7z")
                    .arg("x")
                    .arg(file_path)
                    .arg(format!("-o{}", extract_dir_str))
                    .arg("-y") // Overwrite without asking
                    .output()
                    .map_err(|e| e.to_string())?;
                output.status.success()
            } else if ext == "rar" {
                let output = Command::new("unrar")
                    .arg("x")
                    .arg("-o+") // Overwrite
                    .arg("-y") // Assume yes
                    .arg(file_path)
                    .arg(&extract_dir_str)
                    .output()
                    .map_err(|e| e.to_string())?;
                if !output.status.success() {
                    // Fallback: try 7z for rar files
                    let output = Command::new("7z")
                        .arg("x")
                        .arg(file_path)
                        .arg(format!("-o{}", extract_dir_str))
                        .arg("-y")
                        .output()
                        .map_err(|e| e.to_string())?;
                    output.status.success()
                } else {
                    true
                }
            } else if ext == "tar" || ext == "gz" || ext == "tgz" || ext == "bz2" || ext == "xz" {
                let output = Command::new("tar")
                    .arg("-xf")
                    .arg(file_path)
                    .arg("-C")
                    .arg(&extract_dir_str)
                    .output()
                    .map_err(|e| e.to_string())?;
                output.status.success()
            } else {
                return Err(format!("Unsupported archive format: {}", ext));
            };

            if success {
                let _ = fs::remove_file(file_path).await;
                Ok(extract_dir_str)
            } else {
                Err("Archive extraction failed".to_string())
            }
        }
    }
}
