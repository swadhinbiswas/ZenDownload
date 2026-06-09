use std::path::Path;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashRepresentation {
    pub id: String,
    pub bandwidth: u64,
    pub codecs: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: Option<f64>,
    pub segment_template: Option<String>,
    pub initialization: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashMetadata {
    pub title: String,
    pub duration: Option<f64>,
    pub min_buffer_time: Option<String>,
    pub video_representations: Vec<DashRepresentation>,
    pub audio_representations: Vec<DashRepresentation>,
    pub segment_duration: u32,
    pub total_segments: u32,
    pub base_url: String,
}

pub async fn probe_dash(url: &str, proxy_url: Option<String>) -> Result<DashMetadata, String> {
    let client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30));
    let client = if let Some(p) = proxy_url {
        client_builder.proxy(reqwest::Proxy::all(&p).map_err(|e| e.to_string())?).build().map_err(|e| e.to_string())?
    } else {
        client_builder.build().map_err(|e| e.to_string())?
    };

    let content = client.get(url).send().await
        .map_err(|e| format!("Failed to fetch DASH MPD: {}", e))?
        .text().await
        .map_err(|e| format!("Failed to read MPD body: {}", e))?;

    parse_mpd(&content, url)
}

fn parse_mpd(content: &str, base_url: &str) -> Result<DashMetadata, String> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_str(content);
    reader.config_mut().trim_text(true);

    let mut title = String::new();
    let mut duration: Option<f64> = None;
    let mut min_buffer_time: Option<String> = None;
    let mut video_reps = Vec::new();
    let mut audio_reps = Vec::new();
    let mut current_adaptationset_content_type: Option<String> = None;
    let mut current_representation: Option<DashRepresentation> = None;
    let mut segment_template: Option<String> = None;
    let mut segment_duration: u32 = 0;
    let mut total_segments: u32 = 0;

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let attrs = collect_attrs(&e);

                match name.as_str() {
                    "MPD" => {
                        if let Some(d) = attrs.get("mediaPresentationDuration") {
                            duration = parse_duration(d);
                        }
                        min_buffer_time = attrs.get("minBufferTime").cloned();
                    }
                    "AdaptationSet" => {
                        current_adaptationset_content_type = attrs.get("contentType").cloned()
                            .or_else(|| attrs.get("mimeType").cloned());
                    }
                    "Representation" => {
                        let id = attrs.get("id").cloned().unwrap_or_default();
                        let bandwidth = attrs.get("bandwidth")
                            .and_then(|v| v.parse().ok()).unwrap_or(0);
                        let codecs = attrs.get("codecs").cloned();
                        let width = attrs.get("width").and_then(|v| v.parse().ok());
                        let height = attrs.get("height").and_then(|v| v.parse().ok());
                        let frame_rate = attrs.get("frameRate").and_then(|v| v.parse().ok());

                        current_representation = Some(DashRepresentation {
                            id, bandwidth, codecs, width, height, frame_rate,
                            segment_template: None, initialization: None,
                        });
                    }
                    "SegmentTemplate" => {
                        let template = attrs.get("media").cloned();
                        let initialization = attrs.get("initialization").cloned();
                        let timescale = attrs.get("timescale").and_then(|v| v.parse().ok()).unwrap_or(1u32);
                        let duration_attr = attrs.get("duration").and_then(|v| v.parse().ok()).unwrap_or(0);
                        let start_number = attrs.get("startNumber").and_then(|v| v.parse().ok()).unwrap_or(1u32);

                        segment_template = template;
                        segment_duration = duration_attr;

                        if let Some(ref mut rep) = current_representation {
                            rep.segment_template = segment_template.clone();
                            rep.initialization = initialization.clone();
                        }

                        if let Some(dur) = duration {
                            // Calculate total segments: (duration * timescale) / segment_duration
                            let total_dur_units = (dur * timescale as f64) as u32;
                            if segment_duration > 0 {
                                total_segments = (total_dur_units / segment_duration) + start_number;
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "Representation" {
                    if let Some(rep) = current_representation.take() {
                        match current_adaptationset_content_type.as_deref() {
                            Some("video") => video_reps.push(rep),
                            Some("audio") => audio_reps.push(rep),
                            _ => {
                                if rep.width.is_some() || rep.height.is_some() {
                                    video_reps.push(rep);
                                } else {
                                    audio_reps.push(rep);
                                }
                            }
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("MPD parse error: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    title = Path::new(base_url).file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("dash_stream")
        .to_string();

    Ok(DashMetadata {
        title,
        duration,
        min_buffer_time,
        video_representations: video_reps,
        audio_representations: audio_reps,
        segment_duration,
        total_segments,
        base_url: base_url.to_string(),
    })
}

fn collect_attrs(e: &quick_xml::events::BytesStart) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for attr in e.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
        let val = String::from_utf8_lossy(&attr.value).to_string();
        map.insert(key, val);
    }
    map
}

fn parse_duration(s: &str) -> Option<f64> {
    // Format: PT1H2M3.456S
    let s = s.strip_prefix("PT")?;
    let mut total_seconds = 0.0f64;
    let mut current_num = String::new();
    for ch in s.chars() {
        match ch {
            'H' => { total_seconds += current_num.parse::<f64>().unwrap_or(0.0) * 3600.0; current_num.clear(); }
            'M' => { total_seconds += current_num.parse::<f64>().unwrap_or(0.0) * 60.0; current_num.clear(); }
            'S' => { total_seconds += current_num.parse::<f64>().unwrap_or(0.0); current_num.clear(); }
            _ => current_num.push(ch),
        }
    }
    Some(total_seconds)
}

pub async fn download_dash(
    _app: &AppHandle,
    metadata: &DashMetadata,
    output_path: &str,
    threads: usize,
) -> Result<String, String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    use tokio::sync::Semaphore;

    let video_rep = metadata.video_representations.iter()
        .max_by_key(|r| r.bandwidth)
        .ok_or("No video representation available")?;
    let audio_rep = metadata.audio_representations.iter()
        .max_by_key(|r| r.bandwidth);

    let segment_template = video_rep.segment_template.as_ref()
        .ok_or("No segment template in DASH manifest")?;
    let init_url = video_rep.initialization.as_ref();

    if let Some(parent) = Path::new(output_path).parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let sem = Arc::new(Semaphore::new(threads));
    let downloaded_bytes = Arc::new(AtomicU64::new(0));
    let total_segments = metadata.total_segments;

    let mut handles = Vec::new();
    for seg_num in 1..=total_segments {
        let sem = sem.clone();
        let client = client.clone();
        let downloaded_bytes = downloaded_bytes.clone();
        let url = resolve_segment_url(&metadata.base_url, segment_template, seg_num);
        if url.is_empty() { continue; }

        let handle = tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();
            if let Ok(resp) = client.get(&url).send().await {
                if resp.status().is_success() {
                    if let Ok(bytes) = resp.bytes().await {
                        downloaded_bytes.fetch_add(bytes.len() as u64, Ordering::Relaxed);
                    }
                }
            }
        });
        handles.push(handle);
    }

    for handle in handles {
        let _ = handle.await;
    }

    // Download init segment if present
    if let Some(init) = init_url {
        let init_url = resolve_segment_url(&metadata.base_url, init, 0);
        if !init_url.is_empty() {
            if let Ok(resp) = client.get(&init_url).send().await {
                if resp.status().is_success() {
                    let _ = resp.bytes().await;
                }
            }
        }
    }

    // Download audio segments if separate audio track
    if let Some(audio) = audio_rep {
        if let Some(audio_template) = &audio.segment_template {
            for seg_num in 1..=total_segments {
                let url = resolve_segment_url(&metadata.base_url, audio_template, seg_num);
                if !url.is_empty() {
                    let _ = client.get(&url).send().await;
                }
            }
        }
    }

    Ok(output_path.to_string())
}

fn resolve_segment_url(base_url: &str, template: &str, segment_number: u32) -> String {
    let url = template
        .replace("$RepresentationID$", "")
        .replace("$Number$", &segment_number.to_string())
        .replace("$Bandwidth$", "")
        .replace("$Time$", &segment_number.to_string());

    if url.starts_with("http://") || url.starts_with("https://") {
        return url;
    }
    if let Some(idx) = base_url.rfind('/') {
        format!("{}/{}", &base_url[..idx], url)
    } else {
        url
    }
}
