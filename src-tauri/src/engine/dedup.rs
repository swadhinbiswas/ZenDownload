use sqlx::SqlitePool;
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize)]
pub struct DuplicateMatch {
    pub id: String,
    pub file_name: String,
    pub save_path: String,
    pub size: i64,
    pub match_type: String, // "exact", "name_size", "name"
}

pub async fn find_duplicates(
    pool: &SqlitePool,
    file_name: &str,
    size: i64,
) -> Result<Vec<DuplicateMatch>, String> {
    let mut results = Vec::new();

    // Exact match: same name AND same size
    let exact: Vec<(String, String, String, i64)> = sqlx::query_as(
        "SELECT id, file_name, save_path, total_size FROM downloads \
         WHERE file_name = ? AND total_size = ? AND status = 'Completed'"
    )
    .bind(file_name)
    .bind(size)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    for row in exact {
        results.push(DuplicateMatch {
            id: row.0,
            file_name: row.1,
            save_path: row.2,
            size: row.3,
            match_type: "exact".to_string(),
        });
    }

    if !results.is_empty() {
        return Ok(results);
    }

    // Name + size match (different filename, same content)
    let name_size: Vec<(String, String, String, i64)> = sqlx::query_as(
        "SELECT id, file_name, save_path, total_size FROM downloads \
         WHERE total_size = ? AND status = 'Completed' LIMIT 5"
    )
    .bind(size)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    for row in name_size {
        results.push(DuplicateMatch {
            id: row.0,
            file_name: row.1,
            save_path: row.2,
            size: row.3,
            match_type: "name_size".to_string(),
        });
    }

    if !results.is_empty() {
        return Ok(results);
    }

    // Name match only
    let name: Vec<(String, String, String, i64)> = sqlx::query_as(
        "SELECT id, file_name, save_path, total_size FROM downloads \
         WHERE file_name = ? AND status = 'Completed' LIMIT 5"
    )
    .bind(file_name)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    for row in name {
        results.push(DuplicateMatch {
            id: row.0,
            file_name: row.1,
            save_path: row.2,
            size: row.3,
            match_type: "name".to_string(),
        });
    }

    Ok(results)
}

pub async fn is_local_duplicate(file_path: &str) -> Result<Option<String>, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Ok(None);
    }
    let metadata = tokio::fs::metadata(path).await
        .map_err(|e| format!("Failed to read metadata: {}", e))?;
    let size = metadata.len() as i64;
    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    Ok(Some(format!("{}:{}", file_name, size)))
}
