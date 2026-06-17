use super::*;
use sqlx::SqlitePool;

async fn test_db() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::query("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        .execute(&pool).await.unwrap();
    sqlx::query("CREATE TABLE IF NOT EXISTS downloads (id TEXT PRIMARY KEY, url TEXT, file_name TEXT, save_path TEXT, status TEXT, downloaded INTEGER DEFAULT 0, total_size INTEGER, category TEXT, download_type TEXT, connections INTEGER, speed_limit INTEGER, priority INTEGER, extra_meta TEXT, error_msg TEXT, retry_count INTEGER, thumbnail TEXT, title TEXT, resolution TEXT, created_at TEXT, completed_at TEXT, queue_id TEXT)")
        .execute(&pool).await.unwrap();
    pool
}

#[tokio::test]
async fn resolve_category_path_music() {
    let db = test_db().await;
    sqlx::query("INSERT INTO settings (key, value) VALUES ('pathMusic', '/home/user/Music')")
        .execute(&db).await.unwrap();
    let path = resolve_category_path(&db, Some("Music")).await;
    assert_eq!(path, "/home/user/Music");
}

#[tokio::test]
async fn resolve_category_path_default() {
    let db = test_db().await;
    let path = resolve_category_path(&db, Some("UnknownCategory")).await;
    assert!(!path.is_empty());
}

#[tokio::test]
async fn resolve_category_path_video() {
    let db = test_db().await;
    sqlx::query("INSERT INTO settings (key, value) VALUES ('pathVideo', '/home/user/Videos')")
        .execute(&db).await.unwrap();
    let path = resolve_category_path(&db, Some("Video")).await;
    assert_eq!(path, "/home/user/Videos");
}

#[tokio::test]
async fn resolve_category_path_case_insensitive() {
    let db = test_db().await;
    sqlx::query("INSERT INTO settings (key, value) VALUES ('pathMusic', '/tmp/music')")
        .execute(&db).await.unwrap();
    let path = resolve_category_path(&db, Some("music")).await;
    assert_eq!(path, "/tmp/music");
}

#[test]
fn normalize_save_path_http_with_directory() {
    let result = normalize_save_path("/home/user/Downloads", "myvideo.mp4", "http");
    assert_eq!(result, "/home/user/Downloads/myvideo.mp4");
}

#[test]
fn normalize_save_path_http_with_full_path() {
    let result = normalize_save_path("/home/user/Downloads/myvideo.mp4", "myvideo.mp4", "http");
    assert_eq!(result, "/home/user/Downloads/myvideo.mp4");
}

#[test]
fn normalize_save_path_ytdlp_keeps_directory() {
    let result = normalize_save_path("/home/user/Downloads", "whatever", "ytdlp");
    assert_eq!(result, "/home/user/Downloads");
}

#[test]
fn normalize_save_path_torrent_keeps_directory() {
    let result = normalize_save_path("/home/user/Downloads", "torrent_file", "torrent");
    assert_eq!(result, "/home/user/Downloads");
}

#[test]
fn normalize_save_path_empty_filename() {
    let result = normalize_save_path("/home/user/Downloads", "", "http");
    assert_eq!(result, "/home/user/Downloads");
}

#[test]
fn normalize_save_path_trailing_slash() {
    let result = normalize_save_path("/home/user/Downloads/", "video.mp4", "http");
    assert_eq!(result, "/home/user/Downloads/video.mp4");
}
