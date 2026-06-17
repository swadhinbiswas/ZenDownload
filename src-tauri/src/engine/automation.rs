use serde::{Deserialize, Serialize};
use std::time::Duration;
use sqlx::SqlitePool;
use tokio::time::sleep;
use url::Url;
use chrono::Utc;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Subscription {
    pub id: i64,
    pub name: Option<String>,
    pub url: String,
    pub sub_type: String, // "rss", "youtube"
    pub enabled: i64,
    pub interval_minutes: i64,
    pub include_keywords: Option<String>,
    pub exclude_keywords: Option<String>,
    pub category: Option<String>,
    pub last_checked: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionInput {
    pub name: Option<String>,
    pub url: String,
    pub sub_type: String,
    pub enabled: Option<bool>,
    pub interval_minutes: Option<i64>,
    pub include_keywords: Option<String>,
    pub exclude_keywords: Option<String>,
    pub category: Option<String>,
}

#[derive(sqlx::FromRow)]
struct QueueSchedule {
    id: String,
    start_time: Option<String>,
    stop_time: Option<String>,
    days: Option<String>,
    active: i64,
}

pub async fn start_automation_worker(db: SqlitePool, app: tauri::AppHandle) {
    println!("Starting Automation Worker...");
    
    // Initial sleep so it doesn't run immediately on boot
    sleep(Duration::from_secs(30)).await;
    
    loop {
        println!("Automation worker polling subscriptions and schedules...");
        
        // 1. Process queue schedules
        check_queue_schedules(&db, &app).await;

        // 2. Process subscriptions
        let subs = sqlx::query_as::<_, Subscription>("SELECT id, name, url, sub_type, enabled, interval_minutes, include_keywords, exclude_keywords, category, last_checked, last_error FROM subscriptions WHERE enabled = 1")
            .fetch_all(&db)
            .await
            .unwrap_or_default();
            
        for sub in subs {
            match sub.sub_type.as_str() {
                "rss" | "rsshub" => {
                    if let Err(err) = check_rss_feed(&sub, &db, &app).await {
                        let _ = sqlx::query("UPDATE subscriptions SET last_error = ? WHERE id = ?")
                            .bind(err)
                            .bind(sub.id)
                            .execute(&db)
                            .await;
                    }
                }
                "youtube" => {
                    if let Err(err) = check_youtube_channel(&sub, &db, &app).await {
                        let _ = sqlx::query("UPDATE subscriptions SET last_error = ? WHERE id = ?")
                            .bind(err)
                            .bind(sub.id)
                            .execute(&db)
                            .await;
                    }
                }
                _ => {}
            }
            
            // Update last checked
            let now = chrono::Utc::now().to_rfc3339();
            let _ = sqlx::query("UPDATE subscriptions SET last_checked = ?, last_error = NULL WHERE id = ?")
                .bind(now)
                .bind(sub.id)
                .execute(&db)
                .await;
        }
        
        // Fall asleep first, then poll every minute and honor per-subscription intervals
        sleep(Duration::from_secs(60)).await;
    }
}

async fn check_queue_schedules(db: &SqlitePool, app: &tauri::AppHandle) {
    let queues = sqlx::query_as::<_, QueueSchedule>("SELECT id, start_time, stop_time, days, active FROM queues WHERE active = 1")
        .fetch_all(db)
        .await
        .unwrap_or_default();

    if queues.is_empty() { return; }

    let now = chrono::Local::now();
    let current_time = now.format("%H:%M").to_string();
    let current_day = now.format("%w").to_string(); // 0 is Sunday

    for q in queues {
        if let (Some(start), Some(stop)) = (&q.start_time, &q.stop_time) {
            // Check days
            let mut day_matches = true;
            if let Some(days) = &q.days {
                if !days.is_empty() {
                    day_matches = days.split(',').any(|d| d.trim() == current_day);
                }
            }

            if day_matches {
                let is_inside_window = if start <= stop {
                    current_time >= *start && current_time < *stop
                } else {
                    current_time >= *start || current_time < *stop
                };

                let state = app.state::<crate::engine::DownloadEngine>();
                
                if is_inside_window {
                    // Start/Resume all pending or paused downloads in this queue
                    let to_resume = sqlx::query_scalar::<_, String>("SELECT id FROM downloads WHERE queue_id = ? AND (status = 'Paused' OR status = 'Pending')")
                        .bind(&q.id)
                        .fetch_all(db)
                        .await
                        .unwrap_or_default();
                        
                    for dl_id in to_resume {
                        let _ = state.resume_download(dl_id).await;
                    }
                } else {
                    // Pause all downloading items in this queue
                    let to_pause = sqlx::query_scalar::<_, String>("SELECT id FROM downloads WHERE queue_id = ? AND status = 'Downloading'")
                        .bind(&q.id)
                        .fetch_all(db)
                        .await
                        .unwrap_or_default();
                        
                    for dl_id in to_pause {
                        let _ = state.pause_download(dl_id).await;
                    }
                }
            }
        }
    }
}

fn split_keywords(value: Option<&String>) -> Vec<String> {
    value
        .map(|s| {
            s.split(',')
                .map(|part| part.trim().to_lowercase())
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn matches_keywords(title: &str, include: &[String], exclude: &[String]) -> bool {
    let lower = title.to_lowercase();
    if !include.is_empty() && !include.iter().any(|k| lower.contains(k)) {
        return false;
    }
    !exclude.iter().any(|k| lower.contains(k))
}

fn canonicalize_url(url: &str) -> String {
    if let Ok(parsed) = Url::parse(url) {
        let mut normalized = parsed;
        normalized.set_fragment(None);
        normalized.to_string()
    } else {
        url.to_string()
    }
}

async fn already_downloaded(url: &str, db: &SqlitePool) -> bool {
    let url = canonicalize_url(url);
    let count = sqlx::query_scalar::<_, i32>("SELECT count(*) FROM downloads WHERE url = ? OR url LIKE ? || '/%' ")
        .bind(&url)
        .bind(&url)
        .fetch_one(db)
        .await
        .unwrap_or(0);
    count > 0
}

pub async fn check_rss_feed(sub: &Subscription, db: &SqlitePool, app: &tauri::AppHandle) -> Result<(), String> {
    println!("Checking RSS feed: {}", sub.url);
    let include = split_keywords(sub.include_keywords.as_ref());
    let exclude = split_keywords(sub.exclude_keywords.as_ref());

    let resp = reqwest::get(&sub.url).await.map_err(|e| e.to_string())?;
    let xml = resp.text().await.map_err(|e| e.to_string())?;
    if xml.is_empty() {
        return Ok(());
    }

    let title = sub.name.clone().unwrap_or_else(|| sub.url.clone());
    let parts: Vec<&str> = xml.split("<item>").collect();
    for item in parts.into_iter().skip(1) {
        let mut link = None;
        let mut item_title = None;

        if let Some(start) = item.find("<title>") {
            if let Some(end) = item[start..].find("</title>") {
                item_title = Some(item[start + 7..start + end].trim().to_string());
            }
        }

        if let Some(link_start) = item.find("<link>") {
            if let Some(link_end) = item[link_start..].find("</link>") {
                let extracted = item[link_start + 6 .. link_start + link_end].trim().to_string();
                if !extracted.is_empty() {
                    link = Some(extracted);
                }
            }
        }

        let link = match link {
            Some(v) => v,
            None => continue,
        };

        let match_title = item_title.as_deref().unwrap_or(&title);
        if !matches_keywords(match_title, &include, &exclude) {
            continue;
        }

        let normalized = canonicalize_url(&link);
        if !already_downloaded(&normalized, db).await {
            queue_if_new(&normalized, sub.category.as_deref().unwrap_or("General"), db, app).await;
        }
    }

    Ok(())
}

pub async fn check_youtube_channel(sub: &Subscription, db: &SqlitePool, app: &tauri::AppHandle) -> Result<(), String> {
    println!("Checking YouTube channel: {}", sub.url);
    let include = split_keywords(sub.include_keywords.as_ref());
    let exclude = split_keywords(sub.exclude_keywords.as_ref());
    let output = std::process::Command::new("yt-dlp")
        .arg("--flat-playlist")
        .arg("--print")
        .arg("%(title)s\t%(webpage_url)s")
        .arg("--playlist-end")
        .arg("25")
        .arg(&sub.url)
        .output();
    
    let out = output.map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }

        let mut parts = line.splitn(2, '\t');
        let item_title = parts.next().unwrap_or("").trim().to_string();
        let item_url = parts.next().unwrap_or("").trim().to_string();

        if item_url.is_empty() {
            continue;
        }

        if !matches_keywords(&item_title, &include, &exclude) {
            continue;
        }

        let normalized = canonicalize_url(&item_url);
        if !already_downloaded(&normalized, db).await {
            queue_if_new(&normalized, sub.category.as_deref().unwrap_or("Video"), db, app).await;
        }
    }

    Ok(())
}

pub async fn run_subscription_now(sub_id: i64, db: &SqlitePool, app: &tauri::AppHandle) -> Result<(), String> {
    let sub = sqlx::query_as::<_, Subscription>("SELECT id, name, url, sub_type, enabled, interval_minutes, include_keywords, exclude_keywords, category, last_checked, last_error FROM subscriptions WHERE id = ?")
        .bind(sub_id)
        .fetch_one(db)
        .await
        .map_err(|e| e.to_string())?;

    match sub.sub_type.as_str() {
        "rss" | "rsshub" => check_rss_feed(&sub, db, app).await?,
        "youtube" => check_youtube_channel(&sub, db, app).await?,
        _ => return Err("Unsupported subscription type".into()),
    }

    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE subscriptions SET last_checked = ?, last_error = NULL WHERE id = ?")
        .bind(now)
        .bind(sub.id)
        .execute(db)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn set_subscription_enabled(sub_id: i64, enabled: bool, db: &SqlitePool) -> Result<(), String> {
    sqlx::query("UPDATE subscriptions SET enabled = ? WHERE id = ?")
        .bind(if enabled { 1 } else { 0 })
        .bind(sub_id)
        .execute(db)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

async fn queue_if_new(url: &str, category: &str, db: &SqlitePool, app: &tauri::AppHandle) {
    let exists = sqlx::query_scalar::<_, i32>("SELECT count(*) FROM downloads WHERE url = ?")
        .bind(url)
        .fetch_one(db)
        .await
        .unwrap_or(0);
        
    if exists > 0 { return; }

    // Use the engine's add_download for proper routing, events, and queue management
    // Use category-specific path from settings
    let save_path = crate::engine::resolve_category_path(db, Some(category)).await;
    
    if let Some(engine) = app.try_state::<crate::engine::DownloadEngine>() {
        let engine = engine.inner().clone();
        let extra_meta = Some(serde_json::json!({
            "source": "subscription",
        }).to_string());
        if let Err(e) = engine.add_download(
            url.to_string(),
            save_path,
            8,
            Some(category.to_string()),
            extra_meta,
        ).await {
            eprintln!("Subscription queue failed: {}", e);
        }
    } else {
        // Fallback: raw SQL if engine not available (still uses category path)
        let save_path = crate::engine::resolve_category_path(db, Some(category)).await;
        let new_id = uuid::Uuid::new_v4().to_string();
        let _ = sqlx::query(
            "INSERT INTO downloads (id, url, file_name, save_path, category, status, download_type, connections, created_at)
             VALUES (?, ?, ?, ?, ?, 'Queued', 'http', 8, ?)"
        )
        .bind(&new_id).bind(url).bind("Subscription_Download").bind(&save_path)
        .bind(category).bind(chrono::Utc::now().to_rfc3339())
        .execute(db).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_keywords_include_match() {
        let include = vec!["mp4".to_string(), "video".to_string()];
        let exclude: Vec<String> = vec![];
        assert!(matches_keywords("cool video.mp4", &include, &exclude));
    }

    #[test]
    fn matches_keywords_include_no_match() {
        let include = vec!["pdf".to_string()];
        let exclude: Vec<String> = vec![];
        assert!(!matches_keywords("video.mp4", &include, &exclude));
    }

    #[test]
    fn matches_keywords_exclude_blocks() {
        let include: Vec<String> = vec![];
        let exclude = vec!["nsfw".to_string()];
        assert!(!matches_keywords("nsfw video.mp4", &include, &exclude));
    }

    #[test]
    fn matches_keywords_no_filter() {
        let include: Vec<String> = vec![];
        let exclude: Vec<String> = vec![];
        assert!(matches_keywords("anything", &include, &exclude));
    }

    #[test]
    fn split_keywords_handles_empty() {
        let result = split_keywords(None);
        assert!(result.is_empty());
    }

    #[test]
    fn split_keywords_comma_separated() {
        let input = "mp4, video, audio ".to_string();
        let result = split_keywords(Some(&input));
        assert_eq!(result, vec!["mp4", "video", "audio"]);
    }

    #[test]
    fn canonicalize_url_removes_fragment() {
        let result = canonicalize_url("https://example.com/video.mp4#section");
        assert_eq!(result, "https://example.com/video.mp4");
    }

    #[test]
    fn canonicalize_url_keeps_query() {
        let result = canonicalize_url("https://example.com/video.mp4?quality=hd");
        assert_eq!(result, "https://example.com/video.mp4?quality=hd");
    }

    #[test]
    fn canonicalize_url_keeps_clean_url() {
        let result = canonicalize_url("https://example.com/video.mp4");
        assert_eq!(result, "https://example.com/video.mp4");
    }
}
