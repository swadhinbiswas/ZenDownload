# ZenDownload — Codebase Documentation

> **Audience:** AI agents, new contributors, and maintainers who need a deep
> understanding of the project layout, data flow, IPC contract, and where to
> make changes safely.

---

## 1. Project at a Glance

**ZenDownload** is a cross-platform desktop download manager built with:

| Layer        | Technology                                                  |
|--------------|-------------------------------------------------------------|
| Shell        | Tauri v2 (Rust + system webview)                            |
| Frontend     | React 19 + TypeScript + Vite 7                              |
| Styling      | Tailwind CSS v4 (`@theme inline` tokens in `src/index.css`)|
| State        | Zustand (3 stores: `download`, `settings`, `plugin`, `feed`)|
| Icons        | `lucide-react`                                              |
| Torrent      | `librqbit` 8.x                                              |
| HTTP         | `reqwest` 0.12 (HTTP/2, large windows, connection pooling)  |
| Media        | `yt-dlp` integration (probed + spawned per stream)          |
| Database     | SQLite via `sqlx` 0.8 (file: `zendownload.db` in app data)  |
| API server   | `axum` 0.7 + `tower-http` CORS (REST on port 9527, opt-in)  |
| WS server    | `tokio-tungstenite` 0.29 (browser extension bridge)         |

The product combines BitTorrent, multi-threaded HTTP, yt-dlp media extraction,
IPTV live TV, music downloads, TV/series aggregation, M3U/HLS/DASH streams, a
plugin system, scheduler, watch folder, debrid services, and a system tray —
all in a themeable dark-mode UI.

---

## 2. Top-Level Repository Layout

```
zendownload/
├── src/                          # React + TS frontend
├── src-tauri/                    # Rust backend (Tauri app)
├── extension/                    # Browser extension (MV3) for Chrome/Edge/Brave/Firefox
├── flatpak/                      # Flathub manifest + metainfo
├── docker/                       # Dockerfiles for CI builds
├── website/                      # Standalone marketing landing page
├── public/                       # Static assets served by Vite
├── dist/                         # Vite build output (consumed by Tauri)
├── scripts/                      # Build/icon helper shell scripts
├── patch_*.sh / patch_*.js       # Ad-hoc patch scripts kept for reference
├── com.zendownload.app.desktop   # Linux .desktop entry
├── index.html                    # Vite HTML entry
├── package.json                  # Frontend deps & npm scripts
├── tsconfig.json                 # TS config (strict-ish)
├── vite.config.ts                # Vite + Tailwind v4 + Tauri-aware dev server
├── tauri.conf.json (in src-tauri)# Window, tray, bundle, updater config
└── README.md / CHANGELOG.md / BUILDING.md / LICENSE
```

The `.taurignore`, `.gitignore`, and `components.json` (shadcn/ui registry)
also live at the root.

---

## 3. Frontend Architecture (`src/`)

### 3.1 Entry point & shell

* `index.html` — minimal shell with `<div id="root">`.
* `src/main.tsx` — React 19 root, renders `<App />` in `StrictMode`.
* `src/App.tsx` — **top-level orchestrator**:
  * Wires up global Zustand stores.
  * Subscribes to Tauri events:
    * `tray-action` (tray menu clicks) → handled by
      `services/notificationService.onTrayAction`.
    * `clipboard-url-detected` (OS clipboard monitor from Rust) → opens the
      Add-Download modal if `osClipboard` is enabled.
  * Mounts modals: `AddDownloadModal`, `SettingsModal`,
    `PerformanceDashboard`, `M3UImporterModal`, `QueueManagerModal`,
    `BatchImportModal`.
  * Routes between views (see §3.4).
  * Applies a 12-palette accent theme + font-size + radius + compact-mode +
    background-density + dark-mode by syncing CSS custom properties on
    `<html>`.
  * Renders a footer status bar (active count, completed count, total speed,
    `SpeedGraph`).
* `src/App.css` / `src/index.css` — Tailwind v4 with `@theme inline` tokens
  (CSS custom properties like `--color-indigo-500`, `--radius`, etc.).

### 3.2 Frontend folder map

```
src/
├── App.tsx
├── main.tsx
├── index.css
├── App.css
├── assets/                       # Bundled images/icons
├── components/
│   ├── downloads/
│   │   ├── DownloadList.tsx      # Main table, rows, progress bars
│   │   └── TorrentPeerMap.tsx    # Visual peer map for active torrents
│   ├── layout/
│   │   ├── Sidebar.tsx           # Category/status nav, tools, plugins
│   │   └── Toolbar.tsx           # Top bar: add, grabber, stream, music…
│   ├── modals/                   # Overlay dialogs (add, settings, queue…)
│   ├── pages/                    # Full-page views (one per `currentView`)
│   ├── plugins/                  # Built-in plugin renderers
│   │   ├── PluginPageRenderer.tsx # Switches on `component_type`
│   │   ├── RadioPlayer.tsx
│   │   ├── RssReader.tsx
│   │   └── CustomPage.tsx        # iframe / inline HTML
│   ├── settings/                 # Sections inside the Settings modal
│   ├── subscriptions/            # RSS/URL subscription list
│   └── ui/                       # Generic primitives (button, dialog, …)
├── stores/
│   ├── downloadStore.ts          # Downloads, selection, view, progress
│   ├── settingsStore.ts          # All app settings (persisted)
│   ├── pluginStore.ts            # UI plugin registry
│   └── feedStore.ts              # In-app activity feed
├── services/                     # Thin wrappers around Tauri invokes/events
├── hooks/
│   ├── useKeyboardShortcuts.ts   # Global hotkeys
│   └── useDownloadSounds.ts      # Plays sound on completion
├── i18n/                         # Static translation dictionaries
│   ├── en.ts de.ts es.ts fr.ts ja.ts pt.ts zh.ts
│   ├── index.ts
│   └── useTranslation.ts
├── lib/
│   └── utils.ts                  # `cn()` helper (clsx + tailwind-merge)
└── utils/
    └── flags.ts
```


### 3.3 Frontend state stores (Zustand)

All stores follow the pattern `create<T>((set, get) => ({...}))`. There is no
Redux, no context provider — components subscribe to slices with the
`useStore(state => state.field)` pattern.

#### `stores/downloadStore.ts` — the heart of the UI
* **Shape**: `Download[]`, `selectedIds: Set<string>`, `torrentStats: Map`,
  `speedHistory: Map<id, number[]>` (last 30 samples for sparkline),
  `filterCategory: string | null`, `currentView: ViewName`.
* **Actions**:
  * `setupListeners()` — idempotent; subscribes once to backend events:
    * `download-progress` → updates `downloaded` and `currentSpeed`,
      pushes into `speedHistory` (capped at 30).
    * `download-status` → updates status, fires OS notifications on
      `Completed` / `Error` (gated by `settingsStore.osNotifications`).
    * `download-size` → sets `total_size` when backend discovers it.
    * `download-filename` → updates `file_name` after resolution / redirect.
    * `torrent-stats` → updates `torrentStats` map.
    * `metadata-updated` → updates `title` / `resolution` / `thumbnail`.
  * `fetchDownloads()` — `invoke<Download[]>('get_downloads')`.
  * `addDownload(url, savePath, threads, category, extraMeta?)` — wraps
    `invoke('add_download', ...)` and refreshes the list.
  * `addTorrentFile(filePath, savePath)` — wraps
    `invoke('add_torrent_file', ...)`.
  * Bulk: `resumeSelected` / `pauseSelected` / `cancelSelected` /
    `deleteSelected`.
  * `reorderDownloads(orderedIds)` — local reorder with derived priorities.
  * `pauseAll` / `resumeAll` — used by tray menu and global hotkeys.
* **View routing**: `currentView` is a tagged union of 16 strings (downloads,
subscriptions, history, grabber, stream, music, playlist, adult, tv,
site_grabber, advanced, feed, plugins, plugin_store, plugin_page, speedtest).
The plugin store tracks which `currentPluginId` is active when
`currentView === 'plugin_page'`.

#### `stores/settingsStore.ts` — persistent app settings
* Backed by `@tauri-apps/plugin-store` (`settings.json` in app data dir).
* 60+ typed fields, all declared in `SettingsState` (see file for the full
  list — `launchOnStartup`, `osClipboard`, `maxConnections`, `speedLimit`,
  six `path*` download directories, proxy fields, `extensions` whitelist,
  `osNotifications`, `forceDarkMode`, `dhtTracker`, `streamQualityPreset`,
  `cloudMirroring*`, `debridApiKey`, `adultSitesEnabled`,
  `bandwidthProfile*`, `virustotal*`, `theme*` and more).
* `loadSettings()` — reads the store, applies tilde-expansion for path
  fields, syncs the OS-level autostart flag, then `set()` the entire object.
* `saveSettings(partial)` — partial update; persists to disk; for fields
  consumed by the Rust engine (`cloudMirroring*`, `language`,
  `autoCheckUpdates`, `smartSortingEnabled`, `avScanEnabled`, `debridApiKey`)
  it also calls `invoke('save_runtime_settings', { settings })` so the
  backend can act on them.
* Autostart toggling uses `enable` / `disable` from
  `@tauri-apps/plugin-autostart` and reverts UI state on failure.

#### `stores/pluginStore.ts` — UI plugin registry
* `uiPlugins: Plugin[]` — plugins with `plugin_type === 'ui'`.
* `currentPluginId: string | null` — which plugin page is open.
* `load()` — `invoke('load_plugins')` to populate.
* Sidebar consumes this store to dynamically inject entries with the
  icon/label from the plugin's `ui` manifest.

#### `stores/feedStore.ts` — in-app activity feed
* In-memory list of `FeedEvent` (start / complete / error / plugin fired /
  system update / metadata updated). `setupListeners()` subscribes to a
  backend `feed` event and pushes to the top of the list. The footer badge
  shows the unread count; `FeedPage` shows the timeline.

### 3.4 Services (`src/services/`)

Each service is a thin façade around a group of Tauri invokes/events:

| Service                       | Responsibility                                                      |
|-------------------------------|---------------------------------------------------------------------|
| `notificationService.ts`      | `send_notification`, `notifyDownloadComplete/Failed`, `onTrayAction`|
| `clipboardService.ts`         | OS clipboard monitor wiring                                         |
| `pluginService.ts`            | Plugin install / enable / disable / uninstall                       |
| `profileService.ts`           | Connection / bandwidth profile CRUD                                 |
| `scheduleService.ts`          | Cron-style scheduled download tasks                                 |
| `debridService.ts`            | Real-Debrid / AllDebrid / Premiumize wrappers                       |
| `mirrorService.ts`            | Mirror network admin                                                |
| `analyticsService.ts`         | Pulls analytics summary / recent stats                              |
| `healthService.ts`            | Engine health checks                                                |
| `apiServerService.ts`         | Enable/disable REST API server                                      |
| `iptvService.ts`              | IPTV channel browser + cache                                        |

### 3.5 Components by purpose

* **Modals** (`components/modals/`) — full-screen overlays rendered
  conditionally from `App.tsx`:
  * `AddDownloadModal` — paste URL, pick category/path/threads, optionally
    switch to `StreamPage` for video URLs.
  * `SettingsModal` — huge tabbed dialog; pulls section components from
    `components/settings/`.
  * `PerformanceDashboard` — live CPU/mem/disk, speed graph.
  * `QueueManagerModal` — drag-reorder with priority.
  * `BatchImportModal` — paste many URLs, assign category.
  * `M3UImporterModal`, `GrabberModal`, `StreamQualityPicker`,
    `MusicDownloaderModal`, `PlaylistDownloaderModal`,
    `AdultSitesDownloaderModal`, `DownloadPropertiesModal`.
* **Pages** (`components/pages/`) — full views selected by
  `downloadStore.currentView`:
  `GrabberPage`, `StreamPage`, `MusicPage`, `PlaylistPage`,
  `AdultSitePage`, `TVPage`, `SiteGrabberPage`, `AdvancedSettingsPage`,
  `FeedPage`, `PluginManagerPage`, `PluginStorePage`, `SpeedTestPage`.
* **UI primitives** (`components/ui/`) — `button`, `card`, `dialog`,
  `context-menu`, `select`, `progress`, `command` (cmdk), `badge`,
  `input`, `textarea`, `checkbox`, `label`, `table`,
  `input-group`, `DragDropZone` (drop a URL anywhere),
  `SpeedGraph`, `Sparkline`, `VirtualList` (windowed list),
  `FilePreview`, `LinkChecker`, `LinkPanel`.
* **Settings sections** (`components/settings/`) — broken out of
  `SettingsModal` to keep it readable: `ThemeSection`, `SystemSection`,
  `AdvancedSections`, `ConversionSection`, `BackupManager`,
  `BrowserExtensionSection`.
* **Hooks**:
  * `useKeyboardShortcuts.ts` — registers global hotkeys (e.g. `Ctrl+V` to
    paste clipboard URL).
  * `useDownloadSounds.ts` — plays a subtle sound on completion.

### 3.6 i18n

`src/i18n/<lang>.ts` exports a typed dictionary. `useTranslation()` is a
React hook that reads the active language from `settingsStore` and returns
`t(key)` plus a `lang` value. Adding a new language = adding one file +
updating `index.ts` + extending the language list in `SettingsModal`.


---

## 4. Backend Architecture (`src-tauri/`)

### 4.1 Crate layout

`Cargo.toml` declares `zendownload_lib` with `crate-type = ["staticlib",
"cdylib", "rlib"]`. Key dependencies: `tauri 2.10` (with `tray-icon`,
`image-png`, `protocol-asset` features), `tokio`, `reqwest`, `sqlx`,
`librqbit 8`, `librqbit-core 5`, `axum`, `tower-http` (CORS), `scraper`,
`serde`, `serde_json`, `uuid`, `chrono`, `keyring`, `arboard`,
`notify` + `notify-debouncer-mini`, `sysinfo`, `axum`, `tokio-tungstenite`,
`quick-xml`, `sha2`, `md-5`, `hex`, `rand`, `tauri-plugin-*`.

`src-tauri/src/main.rs` is a 6-line shell that calls
`zendownload_lib::run()` (with `windows_subsystem = "windows"` in release).

```
src-tauri/
├── src/
│   ├── main.rs                   # Entry point (windows_subsystem attr)
│   ├── lib.rs                    # ALL Tauri commands (1500+ lines)
│   ├── db.rs                     # SQLite pool init + schema + migrations
│   ├── engine/                   # The "DownloadEngine" and all subsystems
│   ├── browser/                  # WebSocket server + clipboard monitor
│   ├── grabber/
│   │   └── parser.rs             # BFS web crawler (Site Grabber)
│   └── utils/
│       ├── classifier.rs         # URL → category heuristics
│       ├── keychain.rs           # OS keyring wrapper
│       ├── metadata.rs           # Filename → category / cleaner
│       ├── speed_limiter.rs
│       └── mod.rs
├── Cargo.toml
├── tauri.conf.json
├── build.rs
├── icons/                        # Png + ico + icns bundle icons
└── capabilities/ (if present)    # Tauri v2 capability grants
```

### 4.2 `db.rs` — persistence layer

* Opens `zendownload.db` in `app_data_dir()` via `sqlx::sqlite::SqlitePoolOptions`
  with `max_connections(5)` and `mode=rwc` (auto-create).
* Schema created on first run:
  * `downloads` — the master table, columns mirror `db::DownloadRecord`:
    `id` (TEXT, UUID v4 PK), `url`, `file_name`, `save_path`, `category`,
    `total_size`, `downloaded`, `status`, `download_type` (`http` /
    `torrent` / `ytdlp` / `hls` / `dash` / `m3u`), `connections`,
    `speed_limit`, `priority`, `queue_id`, `checksum`, `checksum_type`,
    `extra_meta`, `error_msg`, `retry_count`, `thumbnail`, `title`,
    `resolution`, `created_at`, `started_at`, `completed_at`.
  * `segments` — per-byte-range HTTP segments (one row per chunk).
  * `mirrors` — alternative URLs for the same download (`mirror_url`).
  * `queues` — named queue slots (id, max_concurrent, speed_limit, schedule).
  * `credentials` — generic credential store (service / host / token_hint).
  * `settings` — generic key/value settings table.
  * `history` — mirrors `downloads` for finished items.
  * `subscriptions` — RSS/URL feeds.
  * `user_playlists` — user-added M3U playlists.
* Includes **self-healing migrations** that strip URL fragments (`#...`)
  that may have leaked from older releases into `save_path` / `file_name` /
  `url`. This is also enforced at the IPC boundary in `lib.rs` via
  `strip_url_fragment()` and `sanitize_save_path()`.

### 4.3 `engine/` — the orchestrator

`engine/mod.rs` declares 40+ submodules and exports a single struct,
`DownloadEngine`, which is the Tauri-managed state. Its `new()`:

1. Builds a `reqwest::Client` with aggressive performance settings:
   `pool_max_idle_per_host(64)`, 5-min idle timeout, 60s TCP keepalive,
   HTTP/2 adaptive window, `tcp_nodelay`, 10s connect timeout, 1h request
   timeout, 16 MB stream window, 32 MB connection window. Honors the
   `HTTPS_PROXY` / `https_proxy` env var.
2. Spawns a fleet of background workers (see §4.4).
3. Initializes a torrent engine (`librqbit`), watch folder, bandwidth
   limiter, schedule engine, profile manager, health monitor, debrid
   manager, clipboard-intel, plugin manager, mirror network, analytics
   engine.

#### `engine::DownloadEngine` fields

| Field                  | Type                          | Notes                                          |
|------------------------|-------------------------------|------------------------------------------------|
| `db`                   | `Pool<Sqlite>`                | Shared with the DB layer                       |
| `app`                  | `AppHandle`                   | For emitting events                            |
| `client`               | `reqwest::Client`             | Optimized HTTP client                          |
| `active_downloads`     | `HashMap<id, JoinHandle>`     | In-flight tokio tasks (for cancel)             |
| `max_concurrent`       | `Arc<Mutex<usize>>` (16)      | Per-process download slot cap                  |
| `torrent_engine`       | `Arc<RwLock<TorrentEngine>>`  | librqbit wrapper                               |
| `watch_folder_manager` | `Arc<WatchFolderManager>`     | `notify`-based folder watcher                  |
| `bandwidth_limiter`    | `Arc<BandwidthLimiter>`       | Token-bucket                                   |
| `schedule_engine`      | `Arc<ScheduleEngine>`         | Time-based rules                               |
| `profile_manager`      | `Arc<ProfileManager>`         | Connection / proxy profiles                    |
| `health_monitor`       | `Arc<HealthMonitor>`          | sysinfo + auto-recover                         |
| `debrid_manager`       | `Arc<DebridManager>`          | Real-Debrid / AllDebrid / Premiumize           |
| `clipboard_intel`      | `Arc<ClipboardIntel>`         | URL extraction from text                       |
| `plugin_manager`       | `Arc<PluginManager>`          | Hooks + UI manifests                           |
| `mirror_network`       | `Arc<MirrorNetwork>`          | Auto-failover to mirrors                       |
| `analytics`            | `Arc<AnalyticsEngine>`        | Rolling per-download stats                     |

#### `engine::DownloadEngine::add_download(...)` flow

This is the single most important function in the backend — read it
carefully before changing behavior:

1. **Web3 normalize** — if URL is a `web3://...` scheme, route through
   `web3::Web3Resolver::resolve_gateway`.
2. **Debrid intercept** — if URL matches a known premium host **and** the
   runtime settings have a `debridApiKey`, call `DebridEngine::unrestrict_link`
   and use the returned direct link.
3. **DRM guard** — `music::spotify::validate_no_drm` rejects DRM-protected
   Spotify URLs.
4. **Filename inference** — pull from path, then URL tail (URL-decoded), then
   magnet `dn=` parameter, then a `Torrent_<hash8>` fallback, then a
   `download_<timestamp>` placeholder.
5. **Auto-category** — if no category given, call
   `utils::metadata::guess_category(&filename)`.
6. **Type detection**:
   * Direct file if extension is in a known binary/document/media set,
     **or** if the URL has a last segment that looks like `name.ext` and is
     not a known webpage type.
   * Known stream host if host matches YouTube, Vimeo, Bilibili, Twitch,
     TikTok, Twitter, Facebook, adult sites, **or** the URL contains `m3u8`.
   * Magnet or `.torrent` → `download_type = "torrent"`.
   * Stream → `download_type = "ytdlp"`.
   * Default → `download_type = "http"` (native multi-threaded engine).
7. **DB insert** as `Pending` with the determined `download_type`.
8. **Background metadata fetch** for streams — spawns a tokio task that
   calls `stream::probe_stream_metadata` and emits `metadata-updated` with
   the resolved title, resolution, thumbnail.
9. **Queue promotion** is handled by `start_queue_poller()`, a 5-second
   loop that promotes queued items until `max_concurrent` is reached.

#### Submodule cheat-sheet (`engine/*.rs`)

| Module                | Role                                                                |
|-----------------------|---------------------------------------------------------------------|
| `http.rs`             | Multi-threaded HTTP engine (byte-range, segment table, resume)      |
| `torrent.rs`          | `librqbit` wrapper, magnet + .torrent handling, session persistence|
| `stream.rs`           | yt-dlp probe + spawn, playlist probe, adult site search             |
| `hls.rs`              | HLS manifest parser + segment downloader                            |
| `dash.rs`             | DASH manifest parser + segment downloader                           |
| `music.rs`            | YouTube/SoundCloud search, metadata embedding, Spotify resolve      |
| `hybrid.rs`           | Combines HTTP + torrent strategies                                  |
| `web3.rs`             | `web3://` → IPFS gateway                                            |
| `stealth.rs`          | User-Agent / TLS fingerprint tricks                                 |
| `runtime_settings.rs` | Reads `settings` table, exposes typed runtime config                |
| `completion.rs`       | Post-completion hooks (extract, convert, scan, cloud)               |
| `converter.rs`        | FFmpeg wrapper with 9 built-in presets                              |
| `checksum.rs`         | SHA256 / MD5 verify                                                 |
| `dedup.rs`            | Duplicate detection                                                 |
| `filename.rs`         | Filename templates / cleaner                                        |
| `protocols.rs`        | Custom protocol registration                                        |
| `retry.rs`            | Retry with exponential backoff                                      |
| `bandwidth.rs`        | Global token-bucket bandwidth limiter                               |
| `profiles.rs`         | Connection / proxy profiles                                         |
| `scheduler.rs`        | Cron-style scheduled download tasks                                 |
| `schedule.rs`         | Per-task time windows (queue-style)                                 |
| `watch_folder.rs`     | `notify` watcher for auto-add                                       |
| `mirror_network.rs`   | Auto-failover across mirrors                                        |
| `cloud/`              | Google Drive / Dropbox / S3 sync                                    |
| `sftp.rs`             | SFTP transfers                                                      |
| `debrid.rs`           | Real-Debrid / AllDebrid / Premiumize                                |
| `adult_sites.rs`      | Adult site list + DRM-free proxy search                             |
| `site_grabber.rs`     | BFS site crawler (delegates to `grabber::parser`)                   |
| `link_checker.rs`     | HEAD-based link validator                                           |
| `m3u.rs`              | M3U/M3U8 playlist import + IPTV aggregation                         |
| `iptv.rs`             | 11k+ iptv-org channel browser with country filter                   |
| `security.rs`         | URL allow/deny / domain block                                       |
| `settings_sync.rs`    | Sync settings across instances                                      |
| `native_messaging.rs` | Browser native messaging manifest generator                         |
| `browser/`            | Browser detection for cookie imports                                |
| `api_server.rs`       | axum-based REST API on port 9527 (opt-in)                            |
| `cli.rs`              | CLI for `list` / `add` / `pause` / `resume` / `cancel` / `delete`   |
| `network_monitor.rs`  | Detects reconnects and auto-resumes                                 |
| `health_monitor.rs`   | sysinfo + auto-recovery + watchdogs                                 |
| `diagnostics.rs`      | Speed test, ping, multi-server test, report generator               |
| `analytics.rs`        | Per-download rolling analytics (speed, ETA, throughput)             |
| `plugin_system.rs`    | Plugin loader, hooks, UI manifest                                   |
| `clipboard_intel.rs`  | URL extractor from text                                             |
| `automation.rs`       | Glue that wires the above into background workers                   |
| `updates.rs`          | Tauri updater wrapper                                               |
| `post_processor.rs`   | Archive auto-extract                                               |
| `protocols.rs`        | Custom URL handlers                                                 |

### 4.4 Background workers spawned at startup

In `engine::DownloadEngine::new()` and the `run()` setup block:

* `automation::start_automation_worker` — drives the scheduler, watch
  folder, and subscriptions.
* `scheduler::start_scheduler_worker` — periodic check for due tasks.
* `network_monitor::NetworkMonitor::start` — reconnect detection, auto-resume.
* `schedule::spawn_schedule_loop(schedule_engine)` — per-task windows.
* `health_monitor.clone().start()` — sysinfo polling + auto-recovery.
* `clipboard_intel.clone().start(app.clone())` — polls the OS clipboard
  (via `arboard`), emits `clipboard-url-detected` to the webview.
* `mirror_network.clone().start()` — periodic mirror health checks.
* `plugin_manager.clone().start(app.clone())` — discovers and hot-reloads
  plugins from the plugins dir.
* `analytics.clone().start(app.clone())` — rolling aggregation loop.
* `engine.start_queue_poller()` — every 5 s, promotes queued downloads to
  active until `max_concurrent` is hit.
* `browser::ws_server::start_ws_server(ws_handle)` — listens for the
  browser extension.
* `browser::clipboard::start_clipboard_monitor(app_handle)` — backup
  clipboard monitor (Rust-side, emits Tauri event).
* `engine::api_server::start_api_server` — only if
  `settings.api_server_enabled` (off by default; port `ZENDOWNLOAD_API_PORT`
  env or `settings.api_server_port`, default 9527).

### 4.5 `lib.rs` — the Tauri command surface

`lib.rs` is the single source of truth for all Tauri commands. It is
organized as:

1. Module declarations: `mod db; mod engine; mod grabber; mod utils; mod browser;`
2. ~130 `#[tauri::command]` functions (see §6 for the canonical list).
3. A few small helpers: `expand_tilde`, `sanitize_save_path`,
   `strip_url_fragment` — these normalize and validate every URL/path
   before it hits the engine.
4. `pub fn run()` — builds the Tauri app:
   * Registers all 6 plugins (`updater`, `dialog`, `notification`, `store`,
     `autostart`, `opener`).
   * `.setup(|app| { ... })`:
     * Forces the window icon from the embedded PNG.
     * Honors `--minimized` (autostart at boot, hidden to tray).
     * Spawns the WS server and clipboard monitor.
     * Builds the **system tray menu** (Show, Hide, Pause All, Resume All,
       Add New Download, Open Downloads Folder, Settings, About, Quit) and
       emits a `tray-action` event for each click.
     * In a blocking call: initializes the DB, creates a
       `DownloadEngine`, registers it via `app_handle.manage(engine)`,
       starts the queue poller, optionally starts the REST API server.
   * `.invoke_handler(tauri::generate_handler![...])` — registers every
     command (see §6).


---

## 5. IPC Contract (Frontend ↔ Backend)

### 5.1 Channel types

* **Commands** (frontend → backend, request/response): `invoke('cmd', args)`.
* **Events** (backend → frontend, fire-and-forget): `emit('event', payload)`,
  consumed by `listen('event', handler)`.

### 5.2 Backend → frontend events

| Event name                | Payload                                              | Emitted from                  |
|---------------------------|------------------------------------------------------|-------------------------------|
| `download-progress`       | `{ id, downloaded, speed }`                          | `engine::http::start_download`|
| `download-status`         | `{ id, status }`                                     | All engines + completion      |
| `download-size`           | `{ id, size }`                                       | HTTP / yt-dlp                 |
| `download-filename`       | `{ id, filename }`                                   | After redirect / yt-dlp probe |
| `torrent-stats`           | `{ id, stats: TorrentPeerStats }`                    | `engine::torrent`             |
| `metadata-updated`        | `{ id, title?, resolution?, thumbnail? }`            | `stream::probe_stream_metadata`|
| `clipboard-url-detected`  | `{ url, detected_type }`                             | `clipboard_intel` start()     |
| `tray-action`             | `string` (one of `pause_all`, `resume_all`, `add`, `open_folder`, `settings`, `about`, `show`, `hide`) | tray menu |
| `feed`                    | `FeedEvent`                                          | various                       |

### 5.3 Frontend → backend commands (full list)

The complete list lives in the `tauri::generate_handler![...]` macro at
the bottom of `src-tauri/src/lib.rs`. Grouped by area:

* **Core downloads**: `add_download`, `add_downloads_batch`, `get_downloads`,
  `resume_download`, `pause_download`, `cancel_download`, `delete_download`,
  `refresh_download_link`, `pause_all_downloads`, `resume_all_downloads`,
  `add_torrent_file`, `set_download_speed_limit`, `get_history`,
  `get_default_save_path`.
* **Media / streams**: `probe_stream_url`, `probe_playlist_url`,
  `probe_hls_playlist`, `probe_dash_manifest`, `download_hls_stream`,
  `download_dash_stream`, `search_music`, `fetch_collection_tracks`,
  `get_audio_formats`, `resolve_spotify_url`, `download_music`,
  `search_adult_site`, `fetch_iptv_channels`, `fetch_iptv_channels_chunked`,
  `get_cached_iptv_channels`, `get_cached_iptv_summary`, `clear_iptv_cache`.
* **Site tools**: `scrape_site_grabber`, `analyze_site`,
  `download_grabbed_files`, `capture_links_from_page`, `check_link`,
  `check_links_batch`, `parse_network_entries`, `detect_stream_from_url`.
* **Subscriptions**: `get_subscriptions`, `add_subscription`,
  `delete_subscription`, `run_subscription_now`, `set_subscription_enabled`.
* **Schedules / queues**: `add_scheduled_task`, `get_pending_scheduled_tasks`,
  `delete_scheduled_task`, `list_schedules`.
* **Watch folder / dedup / filenames**: `add_watch_folder`, `find_duplicates`,
  `clean_filename`, `render_filename_template`.
* **M3U / HLS / DASH / Playlists**: `import_m3u_playlist`, `parse_m3u_content`.
* **Converter / virus / backups**: `get_conversion_presets`,
  `get_compatible_presets`, `convert_file`, `virustotal_check`,
  `export_settings_backup`, `import_settings_backup`, `list_settings_backups`.
* **Speed / network**: `run_speed_test_download`, `run_speed_test_upload`,
  `ping_host`, `generate_diagnostics_report`, `run_full_speed_test`,
  `run_multi_server_test`, `get_speed_test_history`.
* **Native messaging**: `get_native_messaging_manifest`,
  `get_native_messaging_manifest_path`.
* **Notifications / autostart**: `send_notification`,
  `request_notification_permission`, `is_notification_permission_granted`,
  `enable_autostart`, `disable_autostart`, `is_autostart_enabled`.
* **Updates**: `check_updates`, `install_update`.
* **Settings**: `save_runtime_settings`.
* **Profiles / bandwidth / health / debrid / clipboard / plugins / mirrors /
  analytics**: `list_schedules`, profile CRUD, bandwidth rules,
  `get_health_status`, `get_health_history`, debrid CRUD,
  `enable_clipboard_monitor` / `disable_clipboard_monitor`,
  `list_plugins` / `install_plugin` / `enable_plugin` / `disable_plugin` /
  `uninstall_plugin` / `get_plugin_config` / `set_plugin_config`,
  mirror network admin, analytics getters.
* **Cloud / music / TV extras**: cloud mirroring ops, music search,
  TV scraping, etc.

> Whenever you add a new command you **must** add it to the
> `tauri::generate_handler![...]` list at the bottom of `lib.rs`, otherwise
> `invoke()` from the frontend will throw a "command not found" error.

### 5.4 Download status lifecycle

```
Pending → Queued → Downloading → (Paused ↔ Downloading) → Completed
                                      ↓
                                    Error / Cancelled
```

* `Pending` — row inserted, awaiting queue promotion.
* `Queued` — in queue, will be promoted by `start_queue_poller` once a
  slot is free.
* `Downloading` — actual transfer in progress.
* `Paused` — user-paused; can be resumed.
* `Completed` — `downloaded == total_size`, post-processing done.
* `Error` / `Cancelled` — terminal.

The frontend `Download.status` enum in `downloadStore.ts` mirrors this:
`'Pending' | 'Queued' | 'Downloading' | 'Paused' | 'Completed' | 'Error' | 'Needs Refresh' | 'Cancelled'`.

