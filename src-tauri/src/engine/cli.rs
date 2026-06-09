use sqlx::SqlitePool;

pub struct CliContext {
    pub db: SqlitePool,
}

impl CliContext {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    pub async fn run_command(&self, args: Vec<String>) -> Result<String, String> {
        if args.is_empty() {
            return Ok(self.help_text());
        }

        match args[0].as_str() {
            "list" | "ls" => self.list_downloads().await,
            "add" => {
                if args.len() < 2 {
                    Err("Usage: zendownload add <url> [save_path] [threads] [category]".to_string())
                } else {
                    let url = args[1].clone();
                    let save_path = args.get(2).cloned().unwrap_or_else(|| {
                        dirs::download_dir()
                            .map(|d| d.to_string_lossy().to_string())
                            .unwrap_or_else(|| ".".to_string())
                    });
                    let threads: usize = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(4);
                    let category = args.get(4).cloned();
                    self.add_download(&url, &save_path, threads, category).await
                }
            }
            "status" => {
                if args.len() < 2 {
                    Err("Usage: zendownload status <id>".to_string())
                } else {
                    self.download_status(&args[1]).await
                }
            }
            "pause" => {
                if args.len() < 2 {
                    Err("Usage: zendownload pause <id>".to_string())
                } else {
                    self.pause_download(&args[1]).await
                }
            }
            "resume" => {
                if args.len() < 2 {
                    Err("Usage: zendownload resume <id>".to_string())
                } else {
                    self.resume_download(&args[1]).await
                }
            }
            "cancel" => {
                if args.len() < 2 {
                    Err("Usage: zendownload cancel <id>".to_string())
                } else {
                    self.cancel_download(&args[1]).await
                }
            }
            "delete" | "rm" => {
                if args.len() < 2 {
                    Err("Usage: zendownload delete <id>".to_string())
                } else {
                    self.delete_download(&args[1]).await
                }
            }
            "stats" => self.show_stats().await,
            "help" | "--help" | "-h" => Ok(self.help_text()),
            _ => Err(format!("Unknown command: {}. Use 'zendownload help' for usage.", args[0])),
        }
    }

    async fn list_downloads(&self) -> Result<String, String> {
        let records = sqlx::query_as::<_, crate::db::DownloadRecord>(
            "SELECT * FROM downloads ORDER BY created_at DESC LIMIT 50"
        )
        .fetch_all(&self.db)
        .await
        .map_err(|e| e.to_string())?;

        if records.is_empty() {
            return Ok("No downloads.".to_string());
        }

        let mut output = String::new();
        output.push_str(&format!("{:<36} {:<40} {:<12} {:>10}\n", "ID", "FILE", "STATUS", "PROGRESS"));
        output.push_str(&"-".repeat(100));
        output.push('\n');

        for r in &records {
            let name = if r.file_name.is_empty() { "(pending)" } else { &r.file_name };
            let name_short = if name.len() > 38 { format!("{}...", &name[..35]) } else { name.to_string() };
            let total = r.total_size.unwrap_or(0);
            let progress = if total > 0 { format!("{:.1}%", r.downloaded as f64 / total as f64 * 100.0) } else { "-".to_string() };
            let id_short = &r.id[..r.id.len().min(8)];
            output.push_str(&format!("{:<36} {:<40} {:<12} {:>10}\n", id_short, name_short, r.status, progress));
        }

        Ok(output)
    }

    async fn add_download(&self, url: &str, save_path: &str, threads: usize, category: Option<String>) -> Result<String, String> {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO downloads (id, url, status, file_name, save_path, downloaded, total_size, created_at, category, download_type, connections, speed_limit, priority, extra_meta, retry_count) VALUES (?, ?, 'Queued', '', ?, 0, NULL, datetime('now'), ?, 'http', ?, 0, 1, NULL, 0)")
            .bind(&id)
            .bind(url)
            .bind(save_path)
            .bind(&category)
            .bind(threads as i64)
            .execute(&self.db)
            .await
            .map_err(|e| e.to_string())?;

        Ok(format!("Download added: {}", id))
    }

    async fn download_status(&self, id: &str) -> Result<String, String> {
        let record = sqlx::query_as::<_, crate::db::DownloadRecord>(
            "SELECT * FROM downloads WHERE id LIKE ?"
        )
        .bind(format!("{}%", id))
        .fetch_optional(&self.db)
        .await
        .map_err(|e| e.to_string())?;

        match record {
            Some(r) => {
                let total = r.total_size.unwrap_or(0);
                let progress = if total > 0 { format!("{:.1}%", r.downloaded as f64 / total as f64 * 100.0) } else { "unknown".to_string() };
                Ok(format!(
                    "ID:       {}\nURL:      {}\nFile:     {}\nStatus:   {}\nProgress: {} ({}/{})\nCategory: {}\nError:    {}",
                    r.id, r.url, if r.file_name.is_empty() { "-" } else { &r.file_name }, r.status, progress,
                    r.downloaded, total, r.category.as_deref().unwrap_or("-"), r.error_msg.as_deref().unwrap_or("-")
                ))
            }
            None => Err(format!("Download not found: {}", id)),
        }
    }

    async fn pause_download(&self, id: &str) -> Result<String, String> {
        sqlx::query("UPDATE downloads SET status = 'Paused' WHERE id LIKE ? AND status = 'Downloading'")
            .bind(format!("{}%", id))
            .execute(&self.db)
            .await
            .map_err(|e| e.to_string())?;
        Ok(format!("Paused download: {}", id))
    }

    async fn resume_download(&self, id: &str) -> Result<String, String> {
        sqlx::query("UPDATE downloads SET status = 'Queued' WHERE id LIKE ? AND status = 'Paused'")
            .bind(format!("{}%", id))
            .execute(&self.db)
            .await
            .map_err(|e| e.to_string())?;
        Ok(format!("Resumed download: {}", id))
    }

    async fn cancel_download(&self, id: &str) -> Result<String, String> {
        sqlx::query("UPDATE downloads SET status = 'Cancelled' WHERE id LIKE ? AND status IN ('Queued', 'Downloading')")
            .bind(format!("{}%", id))
            .execute(&self.db)
            .await
            .map_err(|e| e.to_string())?;
        Ok(format!("Cancelled download: {}", id))
    }

    async fn delete_download(&self, id: &str) -> Result<String, String> {
        sqlx::query("DELETE FROM downloads WHERE id LIKE ?")
            .bind(format!("{}%", id))
            .execute(&self.db)
            .await
            .map_err(|e| e.to_string())?;
        Ok(format!("Deleted download: {}", id))
    }

    async fn show_stats(&self) -> Result<String, String> {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM downloads")
            .fetch_one(&self.db).await.map_err(|e| e.to_string())?;
        let active: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM downloads WHERE status = 'Downloading'")
            .fetch_one(&self.db).await.map_err(|e| e.to_string())?;
        let completed: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM downloads WHERE status = 'Completed'")
            .fetch_one(&self.db).await.map_err(|e| e.to_string())?;
        let failed: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM downloads WHERE status = 'Error'")
            .fetch_one(&self.db).await.map_err(|e| e.to_string())?;

        Ok(format!(
            "Total:     {}\nActive:    {}\nCompleted: {}\nFailed:    {}",
            total, active, completed, failed
        ))
    }

    fn help_text(&self) -> String {
        r#"ZenDownload CLI

USAGE:
  zendownload <command> [args]

COMMANDS:
  list, ls                       List all downloads
  add <url> [path] [threads]     Add a new download
  status <id>                    Show download status
  pause <id>                     Pause a download
  resume <id>                    Resume a paused download
  cancel <id>                    Cancel a download
  delete, rm <id>                Delete a download
  stats                          Show download statistics
  help                           Show this help

EXAMPLES:
  zendownload add "https://example.com/file.zip"
  zendownload add "https://example.com/file.mp4" ~/Downloads 8 Video
  zendownload list
  zendownload status abc123
  zendownload pause abc123
"#.to_string()
    }
}
