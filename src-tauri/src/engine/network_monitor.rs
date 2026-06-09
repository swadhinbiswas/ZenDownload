use std::time::Duration;
use tokio::sync::RwLock;
use std::sync::Arc;

pub struct NetworkMonitor {
    was_online: Arc<RwLock<bool>>,
    db: sqlx::Pool<sqlx::Sqlite>,
}

impl NetworkMonitor {
    pub fn new(db: sqlx::Pool<sqlx::Sqlite>) -> Self {
        Self {
            was_online: Arc::new(RwLock::new(true)),
            db,
        }
    }

    /// Start monitoring network connectivity. When connection is restored,
    /// auto-resume paused downloads that were paused due to network issues.
    pub async fn start(&self) {
        let was_online = self.was_online.clone();
        let db = self.db.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(5));
            loop {
                interval.tick().await;

                let is_online = check_connectivity().await;
                let mut was_online_guard = was_online.write().await;

                // Detect transition from offline to online
                if is_online && !*was_online_guard {
                    println!("[network] Connection restored — auto-resuming downloads");
                    auto_resume_after_reconnect(&db).await;
                }

                *was_online_guard = is_online;
            }
        });
    }
}

async fn check_connectivity() -> bool {
    // Try connecting to a reliable server
    let urls = [
        "https://1.1.1.1",
        "https://dns.google",
        "https://connectivitycheck.gstatic.com/generate_204",
    ];

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap_or_default();

    for url in &urls {
        if client.head(*url).send().await.is_ok() {
            return true;
        }
    }
    false
}

async fn auto_resume_after_reconnect(db: &sqlx::Pool<sqlx::Sqlite>) {
    // Resume downloads that were paused and have retry count < max
    let result = sqlx::query(
        "UPDATE downloads SET status = 'Queued' WHERE status = 'Paused' AND retry_count < 5"
    )
    .execute(db)
    .await;

    match result {
        Ok(info) => {
            let rows = info.rows_affected();
            if rows > 0 {
                println!("[network] Auto-resumed {} downloads", rows);
            }
        }
        Err(e) => {
            eprintln!("[network] Failed to auto-resume: {}", e);
        }
    }
}
