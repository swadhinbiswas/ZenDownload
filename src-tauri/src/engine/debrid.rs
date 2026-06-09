use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Deserialize, Debug)]
struct RealDebridUnrestrictResponse {
    pub id: String,
    pub filename: String,
    pub download: String,
    pub error: Option<String>,
}

pub struct DebridEngine {
    api_key: String,
}

impl DebridEngine {
    pub fn new(api_key: String) -> Self {
        Self { api_key }
    }

    /// Checks if a URL belongs to a known premium file host supported by typical Debrid services.
    pub fn is_premium_host(url: &str) -> bool {
        let hosts = [
            "rapidgator.net", "uploaded.net", "1fichier.com", "uptobox.com",
            "turbobit.net", "mega.nz", "nitroflare.com", "filefactory.com",
            "keep2share.cc", "mediafire.com", "4shared.com", "wetransfer.com",
        ];
        hosts.iter().any(|host| url.contains(host))
    }

    pub async fn unrestrict_link(&self, url: &str) -> Result<String, String> {
        if self.api_key.is_empty() {
            return Err("Debrid API key is missing".to_string());
        }
        let client = Client::new();
        let res = client.post("https://api.real-debrid.com/rest/1.0/unrestrict/link")
            .bearer_auth(&self.api_key)
            .form(&[("link", url)])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("Real-Debrid API error: {}", res.status()));
        }
        let body: RealDebridUnrestrictResponse = res.json().await.map_err(|e| e.to_string())?;
        if let Some(err) = body.error {
            return Err(format!("Real-Debrid failed: {}", err));
        }
        Ok(body.download)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum DebridProvider {
    RealDebrid,
    AllDebrid,
    Premiumize,
    DebridLink,
    Offcloud,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebridAccount {
    pub id: String,
    pub provider: DebridProvider,
    pub api_key: String,
    pub enabled: bool,
    pub priority: u32,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebridStatus {
    pub id: String,
    pub provider: DebridProvider,
    pub valid: bool,
    pub user: Option<String>,
    pub premium_until: Option<String>,
    pub traffic_left_gb: Option<f64>,
    pub last_checked: i64,
    pub error: Option<String>,
}

pub struct DebridManager {
    accounts: Arc<RwLock<HashMap<String, DebridAccount>>>,
    status: Arc<RwLock<HashMap<String, DebridStatus>>>,
    client: reqwest::Client,
}

impl Default for DebridManager {
    fn default() -> Self {
        Self::new()
    }
}

impl DebridManager {
    pub fn new() -> Self {
        Self {
            accounts: Arc::new(RwLock::new(HashMap::new())),
            status: Arc::new(RwLock::new(HashMap::new())),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent("ZenDownload/1.0")
                .build()
                .unwrap_or_default(),
        }
    }

    pub async fn list_accounts(&self) -> Vec<DebridAccount> {
        let mut v: Vec<DebridAccount> = self.accounts.read().await.values().cloned().collect();
        v.sort_by_key(|a| a.priority);
        v
    }

    pub async fn upsert_account(&self, mut account: DebridAccount) -> Result<String, String> {
        if account.api_key.trim().is_empty() {
            return Err("API key cannot be empty".into());
        }
        if account.id.is_empty() {
            account.id = uuid::Uuid::new_v4().to_string();
        }
        let id = account.id.clone();
        self.accounts.write().await.insert(id.clone(), account);
        Ok(id)
    }

    pub async fn delete_account(&self, id: &str) -> Result<(), String> {
        self.accounts.write().await.remove(id);
        self.status.write().await.remove(id);
        Ok(())
    }

    pub async fn verify_account(&self, id: &str) -> Result<DebridStatus, String> {
        let account = self.accounts.read().await.get(id).cloned()
            .ok_or_else(|| "Account not found".to_string())?;
        let status = match account.provider {
            DebridProvider::RealDebrid => self.verify_real_debrid(&account).await,
            DebridProvider::AllDebrid => self.verify_all_debrid(&account).await,
            DebridProvider::Premiumize => self.verify_premiumize(&account).await,
            DebridProvider::DebridLink => self.verify_debrid_link(&account).await,
            DebridProvider::Offcloud => Ok(DebridStatus {
                id: id.to_string(),
                provider: account.provider.clone(),
                valid: true,
                user: None,
                premium_until: None,
                traffic_left_gb: None,
                last_checked: chrono::Utc::now().timestamp(),
                error: Some("Offcloud verification not yet implemented".into()),
            }),
        };
        let final_status = match status {
            Ok(mut s) => { s.id = id.to_string(); s }
            Err(e) => DebridStatus {
                id: id.to_string(),
                provider: account.provider.clone(),
                valid: false,
                user: None,
                premium_until: None,
                traffic_left_gb: None,
                last_checked: chrono::Utc::now().timestamp(),
                error: Some(e),
            },
        };
        self.status.write().await.insert(id.to_string(), final_status.clone());
        if final_status.valid { Ok(final_status) } else { Err(final_status.error.unwrap_or_default()) }
    }

    async fn verify_real_debrid(&self, account: &DebridAccount) -> Result<DebridStatus, String> {
        let res = self.client.get("https://api.real-debrid.com/rest/1.0/user")
            .bearer_auth(&account.api_key)
            .send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("HTTP {}", res.status()));
        }
        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        Ok(DebridStatus {
            id: account.id.clone(),
            provider: DebridProvider::RealDebrid,
            valid: true,
            user: body.get("username").and_then(|v| v.as_str()).map(String::from),
            premium_until: body.get("expiration").and_then(|v| v.as_str()).map(String::from),
            traffic_left_gb: None,
            last_checked: chrono::Utc::now().timestamp(),
            error: None,
        })
    }

    async fn verify_all_debrid(&self, account: &DebridAccount) -> Result<DebridStatus, String> {
        let res = self.client.get("https://api.alldebrid.com/v4/user")
            .query(&[("agent", "ZenDownload"), ("apikey", &account.api_key)])
            .send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("HTTP {}", res.status()));
        }
        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let user = body.get("data").and_then(|d| d.get("user")).and_then(|u| u.get("username")).and_then(|v| v.as_str()).map(String::from);
        let is_premium = body.get("data").and_then(|d| d.get("user")).and_then(|u| u.get("isPremium")).and_then(|v| v.as_bool()).unwrap_or(false);
        Ok(DebridStatus {
            id: account.id.clone(),
            provider: DebridProvider::AllDebrid,
            valid: true,
            user,
            premium_until: if is_premium { Some("active".into()) } else { None },
            traffic_left_gb: None,
            last_checked: chrono::Utc::now().timestamp(),
            error: None,
        })
    }

    async fn verify_premiumize(&self, account: &DebridAccount) -> Result<DebridStatus, String> {
        let res = self.client.get("https://www.premiumize.me/api/account/info")
            .query(&[("apikey", &account.api_key)])
            .send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("HTTP {}", res.status()));
        }
        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let user = body.get("customer_id").and_then(|v| v.as_str()).map(String::from);
        Ok(DebridStatus {
            id: account.id.clone(),
            provider: DebridProvider::Premiumize,
            valid: true,
            user,
            premium_until: None,
            traffic_left_gb: None,
            last_checked: chrono::Utc::now().timestamp(),
            error: None,
        })
    }

    async fn verify_debrid_link(&self, account: &DebridAccount) -> Result<DebridStatus, String> {
        let res = self.client.get("https://debrid-link.com/api/v2/account/info")
            .bearer_auth(&account.api_key)
            .send().await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("HTTP {}", res.status()));
        }
        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let user = body.get("value").and_then(|v| v.get("username")).and_then(|u| u.as_str()).map(String::from);
        Ok(DebridStatus {
            id: account.id.clone(),
            provider: DebridProvider::DebridLink,
            valid: true,
            user,
            premium_until: None,
            traffic_left_gb: None,
            last_checked: chrono::Utc::now().timestamp(),
            error: None,
        })
    }

    pub async fn list_statuses(&self) -> Vec<DebridStatus> {
        self.status.read().await.values().cloned().collect()
    }

    pub async fn unrestrict(&self, url: &str) -> Result<String, String> {
        let accounts = self.list_accounts().await;
        let enabled: Vec<DebridAccount> = accounts.into_iter().filter(|a| a.enabled).collect();
        if enabled.is_empty() {
            return Err("No debrid accounts configured".into());
        }
        for account in enabled {
            let result = match account.provider {
                DebridProvider::RealDebrid => {
                    DebridEngine::new(account.api_key).unrestrict_link(url).await
                }
                DebridProvider::AllDebrid => self.unrestrict_all_debrid(&account, url).await,
                DebridProvider::Premiumize => self.unrestrict_premiumize(&account, url).await,
                DebridProvider::DebridLink => self.unrestrict_debrid_link(&account, url).await,
                DebridProvider::Offcloud => continue,
            };
            if let Ok(direct) = result {
                return Ok(direct);
            }
        }
        Err("All debrid providers failed".into())
    }

    async fn unrestrict_all_debrid(&self, account: &DebridAccount, url: &str) -> Result<String, String> {
        let res = self.client.get("https://api.alldebrid.com/v4/link/unlock")
            .query(&[("agent", "ZenDownload"), ("apikey", &account.api_key), ("link", url)])
            .send().await.map_err(|e| e.to_string())?;
        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        body.get("data").and_then(|d| d.get("link")).and_then(|l| l.as_str())
            .map(String::from)
            .ok_or_else(|| "No link in response".to_string())
    }

    async fn unrestrict_premiumize(&self, account: &DebridAccount, url: &str) -> Result<String, String> {
        let res = self.client.get("https://www.premiumize.me/api/transfer/directdl")
            .query(&[("apikey", account.api_key.as_str()), ("src", url)])
            .send().await.map_err(|e| e.to_string())?;
        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        body.get("content").and_then(|c| c.get(0)).and_then(|c| c.get("link")).and_then(|l| l.as_str())
            .map(String::from)
            .ok_or_else(|| "No link in response".to_string())
    }

    async fn unrestrict_debrid_link(&self, account: &DebridAccount, url: &str) -> Result<String, String> {
        let res = self.client.post("https://debrid-link.com/api/v2/downloader/add")
            .bearer_auth(&account.api_key)
            .json(&serde_json::json!({"url": url}))
            .send().await.map_err(|e| e.to_string())?;
        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        body.get("value").and_then(|v| v.get("downloadUrl")).and_then(|l| l.as_str())
            .map(String::from)
            .ok_or_else(|| "No link in response".to_string())
    }
}
