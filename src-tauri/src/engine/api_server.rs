use axum::{
    extract::{Path, State},
    http::{HeaderValue, Method, StatusCode},
    response::IntoResponse,
    response::Json as AxumJson,
    routing::{get, post, delete},
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
pub struct ApiState {
    pub db: SqlitePool,
    pub api_key: Arc<RwLock<Option<String>>>,
}

#[derive(Deserialize)]
pub struct AddDownloadRequest {
    pub url: String,
    pub save_path: Option<String>,
    pub threads: Option<usize>,
    pub category: Option<String>,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub password: String,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
}

#[derive(Serialize)]
struct LoginResponse {
    success: bool,
    token: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
struct DownloadInfo {
    id: String,
    url: String,
    file_name: String,
    status: String,
    progress: f64,
    downloaded: i64,
    total_size: Option<i64>,
    speed: f64,
    category: Option<String>,
}

#[derive(Serialize)]
struct ApiResponse<T: Serialize> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

#[derive(Serialize)]
struct StatsInfo {
    total_downloads: i64,
    active_downloads: i64,
    completed_downloads: i64,
    failed_downloads: i64,
    total_size: i64,
    total_downloaded: i64,
}

#[derive(Serialize)]
struct SettingsResponse {
    settings: std::collections::HashMap<String, String>,
}

#[derive(Deserialize)]
struct SettingsUpdate {
    key: String,
    value: String,
}

pub fn create_router(state: ApiState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers(Any);

    Router::new()
        .route("/api/login", post(login_handler))
        .route("/api/downloads", get(list_downloads).post(add_download_handler))
        .route("/api/downloads/:id", get(get_download).delete(delete_download))
        .route("/api/downloads/:id/pause", post(pause_download))
        .route("/api/downloads/:id/resume", post(resume_download))
        .route("/api/downloads/:id/cancel", post(cancel_download))
        .route("/api/stats", get(get_stats))
        .route("/api/settings", get(get_settings).post(update_settings))
        .route("/api/health", get(health_check))
        .layer(cors)
        .with_state(state)
}

async fn health_check() -> AxumJson<HealthResponse> {
    AxumJson(HealthResponse { status: "ok".to_string() })
}

async fn login_handler(
    State(state): State<ApiState>,
    AxumJson(payload): AxumJson<LoginRequest>,
) -> AxumJson<LoginResponse> {
    let stored_password = sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'apiPassword'")
        .fetch_one(&state.db)
        .await
        .unwrap_or_default();

    if payload.password == stored_password && !stored_password.is_empty() {
        let token = uuid::Uuid::new_v4().to_string();
        *state.api_key.write().await = Some(token.clone());
        AxumJson(LoginResponse {
            success: true,
            token: Some(token),
            error: None,
        })
    } else {
        AxumJson(LoginResponse {
            success: false,
            token: None,
            error: Some("Invalid password".to_string()),
        })
    }
}

async fn list_downloads(
    State(state): State<ApiState>,
) -> Result<AxumJson<ApiResponse<Vec<DownloadInfo>>>, StatusCode> {
    let records = sqlx::query_as::<_, crate::db::DownloadRecord>(
        "SELECT * FROM downloads ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let downloads: Vec<DownloadInfo> = records.iter().map(|r| {
        let total = r.total_size.unwrap_or(0);
        let progress = if total > 0 { (r.downloaded as f64 / total as f64) * 100.0 } else { 0.0 };
        DownloadInfo {
            id: r.id.clone(),
            url: r.url.clone(),
            file_name: r.file_name.clone(),
            status: r.status.clone(),
            progress,
            downloaded: r.downloaded,
            total_size: r.total_size,
            speed: 0.0,
            category: r.category.clone(),
        }
    }).collect();

    Ok(AxumJson(ApiResponse {
        success: true,
        data: Some(downloads),
        error: None,
    }))
}

async fn add_download_handler(
    State(state): State<ApiState>,
    AxumJson(payload): AxumJson<AddDownloadRequest>,
) -> Result<AxumJson<ApiResponse<String>>, StatusCode> {
    let id = uuid::Uuid::new_v4().to_string();
    let save_path = payload.save_path.unwrap_or_else(|| {
        dirs::download_dir()
            .map(|d| d.to_string_lossy().to_string())
            .unwrap_or_else(|| ".".to_string())
    });

    sqlx::query("INSERT INTO downloads (id, url, file_name, save_path, status, downloaded, total_size, created_at, category, download_type, connections, speed_limit, priority, extra_meta, retry_count) VALUES (?, ?, '', ?, 'Queued', 0, NULL, datetime('now'), ?, 'http', ?, 0, 1, NULL, 0)")
        .bind(&id)
        .bind(&payload.url)
        .bind(&save_path)
        .bind(&payload.category)
        .bind(payload.threads.unwrap_or(4) as i64)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(AxumJson(ApiResponse {
        success: true,
        data: Some(id),
        error: None,
    }))
}

async fn get_download(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<AxumJson<ApiResponse<DownloadInfo>>, StatusCode> {
    let record = sqlx::query_as::<_, crate::db::DownloadRecord>(
        "SELECT * FROM downloads WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match record {
        Some(r) => {
            let total = r.total_size.unwrap_or(0);
            let progress = if total > 0 { (r.downloaded as f64 / total as f64) * 100.0 } else { 0.0 };
            Ok(AxumJson(ApiResponse {
                success: true,
                data: Some(DownloadInfo {
                    id: r.id,
                    url: r.url,
                    file_name: r.file_name,
                    status: r.status,
                    progress,
                    downloaded: r.downloaded,
                    total_size: r.total_size,
                    speed: 0.0,
                    category: r.category,
                }),
                error: None,
            }))
        }
        None => Ok(AxumJson(ApiResponse {
            success: false,
            data: None,
            error: Some("Download not found".to_string()),
        })),
    }
}

async fn delete_download(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<AxumJson<ApiResponse<()>>, StatusCode> {
    sqlx::query("DELETE FROM downloads WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(AxumJson(ApiResponse { success: true, data: None, error: None }))
}

async fn pause_download(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<AxumJson<ApiResponse<()>>, StatusCode> {
    sqlx::query("UPDATE downloads SET status = 'Paused' WHERE id = ? AND status = 'Downloading'")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(AxumJson(ApiResponse { success: true, data: None, error: None }))
}

async fn resume_download(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<AxumJson<ApiResponse<()>>, StatusCode> {
    sqlx::query("UPDATE downloads SET status = 'Queued' WHERE id = ? AND status = 'Paused'")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(AxumJson(ApiResponse { success: true, data: None, error: None }))
}

async fn cancel_download(
    State(state): State<ApiState>,
    Path(id): Path<String>,
) -> Result<AxumJson<ApiResponse<()>>, StatusCode> {
    sqlx::query("UPDATE downloads SET status = 'Cancelled' WHERE id = ? AND status IN ('Queued', 'Downloading')")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(AxumJson(ApiResponse { success: true, data: None, error: None }))
}

async fn get_stats(
    State(state): State<ApiState>,
) -> Result<AxumJson<ApiResponse<StatsInfo>>, StatusCode> {
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM downloads")
        .fetch_one(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let active: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM downloads WHERE status = 'Downloading'")
        .fetch_one(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let completed: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM downloads WHERE status = 'Completed'")
        .fetch_one(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let failed: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM downloads WHERE status = 'Error'")
        .fetch_one(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let total_size: Option<i64> = sqlx::query_scalar("SELECT SUM(total_size) FROM downloads")
        .fetch_one(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let total_downloaded: Option<i64> = sqlx::query_scalar("SELECT SUM(downloaded) FROM downloads")
        .fetch_one(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(AxumJson(ApiResponse {
        success: true,
        data: Some(StatsInfo {
            total_downloads: total,
            active_downloads: active,
            completed_downloads: completed,
            failed_downloads: failed,
            total_size: total_size.unwrap_or(0),
            total_downloaded: total_downloaded.unwrap_or(0),
        }),
        error: None,
    }))
}

async fn get_settings(
    State(state): State<ApiState>,
) -> Result<AxumJson<ApiResponse<SettingsResponse>>, StatusCode> {
    let rows = sqlx::query_as::<_, (String, String)>("SELECT key, value FROM settings")
        .fetch_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut map = std::collections::HashMap::new();
    for (key, value) in rows {
        map.insert(key, value);
    }

    Ok(AxumJson(ApiResponse {
        success: true,
        data: Some(SettingsResponse { settings: map }),
        error: None,
    }))
}

async fn update_settings(
    State(state): State<ApiState>,
    AxumJson(payload): AxumJson<SettingsUpdate>,
) -> Result<AxumJson<ApiResponse<()>>, StatusCode> {
    sqlx::query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(&payload.key)
        .bind(&payload.value)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(AxumJson(ApiResponse { success: true, data: None, error: None }))
}

pub async fn start_api_server(db: SqlitePool, port: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let state = ApiState {
        db,
        api_key: Arc::new(RwLock::new(None)),
    };

    let router = create_router(state);
    let addr = format!("0.0.0.0:{}", port);
    println!("REST API server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, router).await?;

    Ok(())
}
