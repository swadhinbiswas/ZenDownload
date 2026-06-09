use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PluginType {
    Extractor,
    PostProcessor,
    Webhook,
    Notifier,
    ProtocolHandler,
    Mirror,
    Ui,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PluginCategory {
    Media,
    Productivity,
    Downloader,
    Notification,
    Utility,
    Fun,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigOption {
    pub key: String,
    #[serde(rename = "type")]
    pub config_type: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub default: Option<serde_json::Value>,
    #[serde(default)]
    pub options: Option<Vec<ConfigOptionSelect>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigOptionSelect {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiManifest {
    pub sidebar_label: String,
    pub sidebar_icon: String,
    pub component_type: String,
    #[serde(default)]
    pub page_config: serde_json::Value,
    #[serde(default)]
    pub asset_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plugin {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    #[serde(default)]
    pub homepage: Option<String>,
    pub plugin_type: PluginType,
    pub enabled: bool,
    #[serde(default)]
    pub config: serde_json::Value,
    #[serde(default)]
    pub hooks: Vec<String>,
    pub installed_at: i64,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub ui: Option<UiManifest>,
    // New fields
    #[serde(default = "default_icon")]
    pub icon: String,
    #[serde(default = "default_category")]
    pub category: PluginCategory,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub min_version: Option<String>,
    #[serde(default)]
    pub screenshots: Vec<String>,
    #[serde(default)]
    pub config_schema: Vec<ConfigOption>,
    #[serde(default)]
    pub downloads: u64,
}

fn default_icon() -> String {
    "🧩".to_string()
}

fn default_category() -> PluginCategory {
    PluginCategory::Utility
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginHook {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogPlugin {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    #[serde(default)]
    pub homepage: Option<String>,
    pub plugin_type: PluginType,
    #[serde(default)]
    pub hooks: Vec<String>,
    #[serde(default)]
    pub downloads: u64,
    #[serde(default = "default_icon")]
    pub icon: String,
    #[serde(default = "default_category")]
    pub category: PluginCategory,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub config_schema: Vec<ConfigOption>,
    #[serde(default)]
    pub ui: Option<UiManifest>,
}

pub struct PluginManager {
    plugins: Arc<RwLock<HashMap<String, Plugin>>>,
    hooks: Arc<RwLock<HashMap<String, Vec<HookCallback>>>>,
    plugins_dir: Arc<RwLock<PathBuf>>,
    app: Arc<RwLock<Option<AppHandle>>>,
}

type HookCallback = Arc<dyn Fn(serde_json::Value) -> futures::future::BoxFuture<'static, serde_json::Value> + Send + Sync>;

impl Default for PluginManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PluginManager {
    pub fn new() -> Self {
        Self {
            plugins: Arc::new(RwLock::new(HashMap::new())),
            hooks: Arc::new(RwLock::new(HashMap::new())),
            plugins_dir: Arc::new(RwLock::new(PathBuf::new())),
            app: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn start(self: Arc<Self>, app: AppHandle) {
        *self.app.write().await = Some(app.clone());
        if let Ok(dir) = app.path().app_data_dir() {
            let plugins_dir = dir.join("plugins");
            let _ = std::fs::create_dir_all(&plugins_dir);
            *self.plugins_dir.write().await = plugins_dir.clone();
            self.clone().discover(plugins_dir).await;
        }
        self.clone().register_builtin_hooks().await;
    }

    async fn discover(self: Arc<Self>, dir: PathBuf) {
        let Ok(rd) = std::fs::read_dir(&dir) else { return; };
        for entry in rd.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(text) = std::fs::read_to_string(&path) {
                    if let Ok(plugin) = serde_json::from_str::<Plugin>(&text) {
                        let mut plugins = self.plugins.write().await;
                        plugins.insert(plugin.id.clone(), plugin);
                    }
                }
            }
        }
    }

    async fn register_builtin_hooks(self: Arc<Self>) {
        let mut hooks = self.hooks.write().await;
        hooks.entry("download.start".into()).or_insert_with(Vec::new);
        hooks.entry("download.complete".into()).or_insert_with(Vec::new);
        hooks.entry("download.error".into()).or_insert_with(Vec::new);
        hooks.entry("url.extract".into()).or_insert_with(Vec::new);
        hooks.entry("file.postprocess".into()).or_insert_with(Vec::new);
        hooks.entry("clipboard.detect".into()).or_insert_with(Vec::new);
    }

    pub async fn list(&self) -> Vec<Plugin> {
        self.plugins.read().await.values().cloned().collect()
    }

    pub async fn list_ui(&self) -> Vec<Plugin> {
        self.plugins.read().await.values()
            .filter(|p| p.ui.is_some())
            .cloned()
            .collect()
    }

    pub async fn install(&self, mut plugin: Plugin) -> Result<String, String> {
        if plugin.id.is_empty() {
            return Err("Plugin id required".into());
        }
        plugin.installed_at = chrono::Utc::now().timestamp();
        let dir = self.plugins_dir.read().await.clone();
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join(format!("{}.json", plugin.id));
        let json = serde_json::to_string_pretty(&plugin).map_err(|e| e.to_string())?;
        std::fs::write(&path, json).map_err(|e| e.to_string())?;
        plugin.path = Some(path.to_string_lossy().to_string());
        let id = plugin.id.clone();
        self.plugins.write().await.insert(id.clone(), plugin);
        Ok(id)
    }

    pub async fn uninstall(&self, id: &str) -> Result<(), String> {
        let plugin = self.plugins.read().await.get(id).cloned();
        if let Some(p) = plugin {
            if let Some(path) = p.path {
                let _ = std::fs::remove_file(path);
            }
            self.plugins.write().await.remove(id);
            Ok(())
        } else {
            Err("Plugin not found".into())
        }
    }

    pub async fn enable(&self, id: &str) -> Result<(), String> {
        let mut plugins = self.plugins.write().await;
        if let Some(p) = plugins.get_mut(id) {
            p.enabled = true;
            self.persist(p).await;
            Ok(())
        } else {
            Err("Plugin not found".into())
        }
    }

    pub async fn disable(&self, id: &str) -> Result<(), String> {
        let mut plugins = self.plugins.write().await;
        if let Some(p) = plugins.get_mut(id) {
            p.enabled = false;
            self.persist(p).await;
            Ok(())
        } else {
            Err("Plugin not found".into())
        }
    }

    pub async fn update_config(&self, id: &str, config: serde_json::Value) -> Result<(), String> {
        let mut plugins = self.plugins.write().await;
        if let Some(p) = plugins.get_mut(id) {
            p.config = config;
            self.persist(p).await;
            Ok(())
        } else {
            Err("Plugin not found".into())
        }
    }

    async fn persist(&self, plugin: &Plugin) {
        if let Some(path) = &plugin.path {
            if let Ok(json) = serde_json::to_string_pretty(plugin) {
                let _ = std::fs::write(path, json);
            }
        }
    }

    pub async fn get(&self, id: &str) -> Option<Plugin> {
        self.plugins.read().await.get(id).cloned()
    }

    pub async fn fire(&self, hook: &str, payload: serde_json::Value) -> Vec<serde_json::Value> {
        let plugins = self.plugins.read().await;
        let enabled: Vec<&Plugin> = plugins.values()
            .filter(|p| p.enabled && p.hooks.iter().any(|h| h == hook))
            .collect();
        let mut results = Vec::new();
        for plugin in enabled {
            if let Some(app) = self.app.read().await.as_ref() {
                let _ = app.emit("plugin-fired", serde_json::json!({
                    "plugin": plugin.id,
                    "hook": hook,
                    "payload": payload
                }));
            }
            results.push(serde_json::json!({"plugin": plugin.id, "ok": true}));
        }
        results
    }

    pub async fn list_hooks(&self) -> Vec<PluginHook> {
        vec![
            PluginHook { name: "download.start".into(), description: "Fired when a download begins".into() },
            PluginHook { name: "download.complete".into(), description: "Fired when a download finishes".into() },
            PluginHook { name: "download.error".into(), description: "Fired when a download fails".into() },
            PluginHook { name: "url.extract".into(), description: "Fired when a URL is processed for extraction".into() },
            PluginHook { name: "file.postprocess".into(), description: "Fired after a file is downloaded".into() },
            PluginHook { name: "clipboard.detect".into(), description: "Fired when clipboard detects a URL".into() },
        ]
    }

    pub async fn fetch_catalog(url: &str) -> Result<Vec<CatalogPlugin>, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client.get(url)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch catalog: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Catalog server returned HTTP {}", resp.status()));
        }

        let content_type = resp.headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !content_type.contains("json") && !content_type.contains("text") && !content_type.is_empty() {
            return Err(format!("Expected JSON but got Content-Type: {}", content_type));
        }

        let body = resp.text().await
            .map_err(|e| format!("Failed to read catalog response: {}", e))?;

        if body.trim().is_empty() {
            return Err("Catalog response is empty".to_string());
        }

        // Try direct array parse first
        if let Ok(catalog) = serde_json::from_str::<Vec<CatalogPlugin>>(&body) {
            return Ok(catalog);
        }

        // Try wrapped object: { "plugins": [...] }
        #[derive(Deserialize)]
        struct WrappedCatalog {
            plugins: Vec<CatalogPlugin>,
        }
        if let Ok(wrapped) = serde_json::from_str::<WrappedCatalog>(&body) {
            return Ok(wrapped.plugins);
        }

        // Try { "data": [...] }
        #[derive(Deserialize)]
        struct DataWrapped {
            data: Vec<CatalogPlugin>,
        }
        if let Ok(wrapped) = serde_json::from_str::<DataWrapped>(&body) {
            return Ok(wrapped.data);
        }

        // Try { "items": [...] }
        #[derive(Deserialize)]
        struct ItemsWrapped {
            items: Vec<CatalogPlugin>,
        }
        if let Ok(wrapped) = serde_json::from_str::<ItemsWrapped>(&body) {
            return Ok(wrapped.items);
        }

        let preview = if body.len() > 200 {
            format!("{}...", &body[..200])
        } else {
            body.clone()
        };
        Err(format!(
            "Invalid catalog format. Expected JSON array of plugins. Got: {}",
            preview
        ))
    }
}
