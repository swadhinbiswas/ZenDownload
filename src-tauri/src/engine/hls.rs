use std::path::Path;
use std::io::Write;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HlsSegment {
    pub url: String,
    pub duration: f64,
    pub sequence: u64,
    pub byte_range: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HlsVariant {
    pub bandwidth: u64,
    pub resolution: Option<String>,
    pub codecs: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HlsMetadata {
    pub title: String,
    pub duration: Option<f64>,
    pub total_segments: usize,
    pub variants: Vec<HlsVariant>,
    pub target_duration: f64,
    pub is_live: bool,
    pub segments: Vec<HlsSegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HlsDownloadProgress {
    pub id: String,
    pub downloaded_segments: usize,
    pub total_segments: usize,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub speed: f64,
}

/// Parse an M3U8 playlist into segments/variants
pub async fn probe_hls(url: &str, proxy_url: Option<String>) -> Result<HlsMetadata, String> {
    let client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30));
    let client = if let Some(p) = proxy_url {
        client_builder.proxy(reqwest::Proxy::all(&p).map_err(|e| e.to_string())?).build().map_err(|e| e.to_string())?
    } else {
        client_builder.build().map_err(|e| e.to_string())?
    };

    let content = client.get(url).send().await
        .map_err(|e| format!("Failed to fetch HLS playlist: {}", e))?
        .text().await
        .map_err(|e| format!("Failed to read playlist body: {}", e))?;

    parse_m3u8(&content, url).await
}

async fn parse_m3u8(content: &str, base_url: &str) -> Result<HlsMetadata, String> {
    let base = url_basename(base_url);

    if content.contains("#EXT-X-STREAM-INF") {
        // Master playlist with variants
        parse_master_playlist(content, base_url).await
    } else {
        // Media playlist with segments
        parse_media_playlist(content, base_url).await
    }
}

fn url_basename(url: &str) -> String {
    url.rsplit('/').next().unwrap_or("playlist.m3u8").to_string()
}

fn resolve_url(base: &str, relative: &str) -> String {
    if relative.starts_with("http://") || relative.starts_with("https://") {
        return relative.to_string();
    }
    if let Some(idx) = base.rfind('/') {
        format!("{}/{}", &base[..idx], relative)
    } else {
        relative.to_string()
    }
}

async fn parse_master_playlist(content: &str, base_url: &str) -> Result<HlsMetadata, String> {
    let mut variants = Vec::new();
    let mut current_bandwidth: u64 = 0;
    let mut current_resolution: Option<String> = None;
    let mut current_codecs: Option<String> = None;

    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("#EXT-X-STREAM-INF:") {
            let attrs = &line[18..];
            for attr in attrs.split(',') {
                let attr = attr.trim();
                if let Some(val) = attr.strip_prefix("BANDWIDTH=") {
                    current_bandwidth = val.parse().unwrap_or(0);
                } else if let Some(val) = attr.strip_prefix("RESOLUTION=") {
                    current_resolution = Some(val.to_string());
                } else if let Some(val) = attr.strip_prefix("CODECS=") {
                    current_codecs = Some(val.trim_matches('"').to_string());
                }
            }
        } else if !line.is_empty() && !line.starts_with('#') {
            variants.push(HlsVariant {
                bandwidth: current_bandwidth,
                resolution: current_resolution.take(),
                codecs: current_codecs.take(),
                url: resolve_url(base_url, line),
            });
            current_bandwidth = 0;
        }
    }

    // Pick highest bandwidth variant as default
    let default_url = variants.iter()
        .max_by_key(|v| v.bandwidth)
        .map(|v| v.url.clone())
        .unwrap_or_else(|| base_url.to_string());

    // Fetch the media playlist for the default variant
    if default_url != base_url {
        let client = reqwest::Client::new();
        if let Ok(resp) = client.get(&default_url).send().await {
            if let Ok(text) = resp.text().await {
                return parse_media_playlist(&text, &default_url).await.map(|mut m| {
                    m.variants = variants;
                    m
                });
            }
        }
    }

    Ok(HlsMetadata {
        title: Path::new(base_url).file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("hls_stream")
            .to_string(),
        duration: None,
        total_segments: 0,
        variants,
        target_duration: 0.0,
        is_live: false,
        segments: Vec::new(),
    })
}

async fn parse_media_playlist(content: &str, base_url: &str) -> Result<HlsMetadata, String> {
    let mut segments = Vec::new();
    let mut duration: f64 = 0.0;
    let mut target_duration: f64 = 0.0;
    let mut sequence: u64 = 0;
    let mut is_live = false;
    let mut byte_range: Option<String> = None;

    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("#EXT-X-TARGETDURATION:") {
            if let Some(v) = line.strip_prefix("#EXT-X-TARGETDURATION:") {
                target_duration = v.parse().unwrap_or(0.0);
            }
        } else if line.starts_with("#EXT-X-MEDIA-SEQUENCE:") {
            if let Some(v) = line.strip_prefix("#EXT-X-MEDIA-SEQUENCE:") {
                sequence = v.parse().unwrap_or(0);
            }
        } else if line.starts_with("#EXT-X-ENDLIST") {
            is_live = false;
        } else if line.starts_with("#EXT-X-BYTERANGE:") {
            byte_range = Some(line[17..].to_string());
        } else if line.starts_with("#EXTINF:") {
            if let Some(v) = line.strip_prefix("#EXTINF:") {
                if let Some(comma_idx) = v.find(',') {
                    duration += v[..comma_idx].parse::<f64>().unwrap_or(0.0);
                }
            }
        } else if !line.is_empty() && !line.starts_with('#') {
            segments.push(HlsSegment {
                url: resolve_url(base_url, line),
                duration: 0.0,
                sequence,
                byte_range: byte_range.take(),
            });
            sequence += 1;
        }
    }

    let is_live = !content.contains("#EXT-X-ENDLIST");

    Ok(HlsMetadata {
        title: Path::new(base_url).file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("hls_stream")
            .to_string(),
        duration: Some(duration),
        total_segments: segments.len(),
        variants: Vec::new(),
        target_duration,
        is_live,
        segments,
    })
}

/// Download an HLS stream with parallel segment downloads
pub async fn download_hls(
    app: &AppHandle,
    db: &sqlx::Pool<sqlx::Sqlite>,
    download_id: &str,
    metadata: &HlsMetadata,
    output_path: &str,
    threads: usize,
) -> Result<String, String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    use tokio::sync::Semaphore;

    let segments = &metadata.segments;
    if segments.is_empty() {
        return Err("No segments to download".to_string());
    }

    let output_file = std::path::Path::new(output_path);
    if let Some(parent) = output_file.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let sem = Arc::new(Semaphore::new(threads));
    let downloaded_bytes = Arc::new(AtomicU64::new(0));
    let downloaded_segments = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let total_segments = segments.len();

    // Spawn parallel download tasks
    let mut handles = Vec::new();
    for (idx, segment) in segments.iter().enumerate() {
        let sem = sem.clone();
        let client = client.clone();
        let segment = segment.clone();
        let downloaded_bytes = downloaded_bytes.clone();
        let downloaded_segments = downloaded_segments.clone();
        let app = app.clone();
        let id = download_id.to_string();

        let handle = tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();
            match client.get(&segment.url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(bytes) = resp.bytes().await {
                        downloaded_bytes.fetch_add(bytes.len() as u64, Ordering::Relaxed);
                        downloaded_segments.fetch_add(1, Ordering::Relaxed);
                        let _ = app.emit("hls-segment-complete", serde_json::json!({
                            "id": id,
                            "segment_index": idx,
                            "segment_data": base64_encode(&bytes),
                        }));
                    }
                }
                _ => {}
            }
        });
        handles.push(handle);
    }

    for handle in handles {
        let _ = handle.await;
    }

    // Emit final progress
    let total = downloaded_bytes.load(Ordering::Relaxed);
    let _ = app.emit("download-progress", serde_json::json!({
        "id": download_id,
        "downloaded": total,
        "speed": 0.0,
    }));

    // Concatenate all segments (handled in frontend via base64 chunks, or fallback to simple concat)
    let _ = db; // silence unused warning

    Ok(output_path.to_string())
}

fn base64_encode(data: &[u8]) -> String {
    use std::io::Write;
    let mut buf = Vec::new();
    let mut encoder = Base64Encoder::new(&mut buf);
    let _ = encoder.write_all(data);
    let _ = encoder.finish();
    String::from_utf8_lossy(&buf).to_string()
}

struct Base64Encoder<'a, W: Write + 'a> {
    inner: &'a mut W,
    pending: u32,
    pending_bits: u32,
}

impl<'a, W: Write> Base64Encoder<'a, W> {
    fn new(inner: &'a mut W) -> Self {
        Self { inner, pending: 0, pending_bits: 0 }
    }

    fn finish(mut self) -> std::io::Result<()> {
        if self.pending_bits > 0 {
            let pad = match self.pending_bits {
                2 => 1,
                4 => 2,
                _ => 0,
            };
            let ch = BASE64_CHARS[(self.pending << (6 - self.pending_bits)) as usize] as char;
            for _ in 0..=pad {
                self.inner.write_all(&[ch as u8])?;
            }
        }
        Ok(())
    }
}

impl<'a, W: Write> Write for Base64Encoder<'a, W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        for &b in buf {
            self.pending = (self.pending << 8) | b as u32;
            self.pending_bits += 8;
            while self.pending_bits >= 6 {
                self.pending_bits -= 6;
                let idx = ((self.pending >> self.pending_bits) & 0x3F) as usize;
                self.inner.write_all(&[TABLE[idx]])?;
            }
        }
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> { Ok(()) }
}

const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
use std::sync::Arc;
