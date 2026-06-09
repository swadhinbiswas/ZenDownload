# ZenDownload

> A modern, all-in-one download manager with torrent support, media streaming, AI-powered URL detection, and a plugin system.

ZenDownload is a cross-platform download manager built with Tauri v2 and React. It combines BitTorrent, HTTP/HTTPS downloads, media streaming, music download, TV show aggregation, and debrid services into a single unified interface — all with a beautiful, themeable dark-mode UI.

## Screenshots

<!-- TODO: Replace with actual screenshots -->
| Download Manager | Torrent Streaming | TV Series Browser |
|---|---|---|
| ![Downloads](assets/screenshots/downloads.png) | ![Stream](assets/screenshots/stream.png) | ![TV](assets/screenshots/tv.png) |
| **Plugin Store** | **Music Downloader** | **Speed Test** |
| ![Plugins](assets/screenshots/plugins.png) | ![Music](assets/screenshots/music.png) | ![Speed](assets/screenshots/speedtest.png) |

## Features

### Core
- **Multi-protocol downloads** — HTTP/HTTPS, BitTorrent, and magnetic links
- **Torrent engine** — DHT, PEX, magnet resolution, multi-tracker, streaming
- **Media streaming** — Stream video/audio while downloading (yt-dlp integration)
- **Music downloader** — Search and download from YouTube/SoundCloud with metadata embedding
- **TV series browser** — Browse, filter, and download TV episodes by category/country
- **Clipboard detection** — Auto-detect URLs from clipboard with smart categorization
- **Debrid service integration** — Real-Debrid, AllDebrid, Premiumize

### User Interface
- **Dark theme** with 12 accent colors (indigo, blue, purple, pink, red, orange, amber, emerald, teal, cyan, slate, zinc)
- **Adjustable corner roundness** — from square (0px) to fully pill-shaped (9999px)
- **Font size presets** — small (13px), default (14px), large (16px)
- **Background density** — default, glass (frosted blur), transparent (minimal)
- **Compact mode** — reduced padding for high-density layouts
- **Activity feed** — real-time chronological event log
- **Speed test** — built-in multi-server speed test with live graph

### Downloads
- **Queue scheduling** — priority-based download ordering
- **Batch import** — paste multiple URLs at once
- **Category organization** — auto-sort by Video, Music, Documents, Compressed, Programs
- **Segment-level download** — multi-threaded HTTP with resume support
- **Bandwidth profiles** — time-based speed limits (e.g., throttle at night)
- **Watch folders** — auto-add downloads from monitored directories
- **Smart sorting** — automatic category assignment based on URL/file type
- **File preview** — view text files and archives without extracting

### Plugin System
- **Hook system** — plugins fire on `download.start`, `download.complete`, `download.error`, `url.extract`, `file.postprocess`, `clipboard.detect`
- **UI plugins** — plugins can register sidebar entries and render custom pages
- **Built-in component types** — radio player, RSS reader, custom iframe/HTML
- **Plugin Store** — discover and install plugins from within the app
- **TypeScript SDK** — write plugins as JSON manifests with optional frontend assets

### Advanced
- **Proxy support** — HTTP/HTTPS/SOCKS5 with authentication
- **Cookie import** — extract cookies from Chrome, Firefox, Edge, Opera, Brave
- **File type filtering** — whitelist/blacklist by extension
- **Cloud mirroring** — sync downloads to Google Drive
- **Virus scanning** — VirusTotal integration for auto-scanning completed downloads
- **Scheduler** — automatic downloads at configured times
- **Settings backup & restore**
- **Multi-language** — internationalization support
- **Subscription management** — RSS and URL subscriptions for auto-downloads
- **Link checker** — verify URL availability before download

## Quick Start

### Download (Coming Soon)
Prebuilt binaries for Windows, macOS, and Linux will be available from the [Releases](https://github.com/swadhinbiswas/ZenDownload/releases) page.

### Build from Source

#### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [Bun](https://bun.sh/) or npm
- [Rust](https://www.rust-lang.org/) (latest stable)
- Platform dependencies for Tauri v2 ([guide](https://v2.tauri.app/start/prerequisites/))

#### Clone & Build
```bash
git clone https://github.com/swadhinbiswas/ZenDownload.git
cd zendownload
bun install
bun run tauri dev     # Development mode with hot-reload
bun run tauri build   # Production build
```

#### Platform-specific Dependencies

**Ubuntu/Debian:**
```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  libavformat-dev libavcodec-dev libavdevice-dev libavfilter-dev \
  libavutil-dev libswresample-dev libswscale-dev
```

**Fedora:**
```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel
```

**Arch Linux:**
```bash
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl appindicator-gtk3 librsvg
```

**macOS:** Xcode Command Line Tools (`xcode-select --install`)

**Windows:** WebView2 is pre-installed on Windows 10 (1803+) and Windows 11.

## Architecture

```
zendownload/
├── src/                          # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── downloads/            # Download list, progress bars, torrent peers
│   │   ├── layout/               # Sidebar, toolbar, app shell
│   │   ├── modals/               # Add download, settings, performance dashboard
│   │   ├── pages/                # TV, music, stream, grabber, plugins, feed, speed test
│   │   ├── plugins/              # Plugin page renderer, radio player, RSS reader, custom page
│   │   ├── settings/             # Theme, system, conversion, backup sections
│   │   ├── subscriptions/        # RSS/subscription management
│   │   └── ui/                   # Reusable components (select, dialog, file preview)
│   ├── stores/                   # Zustand state stores
│   │   ├── downloadStore.ts      # Downloads, progress, filter state
│   │   ├── settingsStore.ts      # All app settings with persistence
│   │   ├── pluginStore.ts        # UI plugin registry
│   │   └── feedStore.ts          # Activity feed events
│   ├── services/                 # Notification service, translation
│   └── lib/                      # Utilities (formatBytes, etc.)
├── src-tauri/                    # Backend (Rust)
│   └── src/
│       ├── engine/
│       │   ├── mod.rs            # DownloadEngine orchestrator
│       │   ├── torrent.rs        # BitTorrent via librqbit
│       │   ├── http.rs           # HTTP/HTTPS downloads (single + multi-threaded)
│       │   ├── stream.rs         # yt-dlp media streaming
│       │   ├── music.rs          # Music search/download with metadata
│       │   ├── tv.rs             # TV series scraping and downloading
│       │   ├── db.rs             # SQLite database layer
│       │   ├── plugin_system.rs  # Plugin manager, hooks, UI manifest
│       │   ├── scheduler.rs      # Time-based download scheduling
│       │   ├── bandwidth.rs      # Global bandwidth limiting
│       │   ├── diagnostics.rs    # Speed test, system diagnostics
│       │   ├── analytics.rs      # Performance analytics tracking
│       │   └── ...
│       ├── lib.rs                # Tauri command definitions
│       └── main.rs               # Entry point
└── website/                      # Landing page (standalone HTML)
```

### Technology Stack

| Layer | Technology |
|---|---|
| Desktop Shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript + Vite 7 |
| State | Zustand |
| Styling | Tailwind CSS v4 |
| Icons | Lucide React |
| Torrent | librqbit 8.x |
| HTTP Client | reqwest 0.12 (HTTP/2) |
| Media | yt-dlp |
| Database | SQLite (sqlx 0.8) |
| API Server | axum 0.7 |

## Plugin Development Guide

See [docs/PLUGIN_DEVELOPMENT.md](docs/PLUGIN_DEVELOPMENT.md) for the complete plugin development guide.

### Quick Start

Plugins are JSON manifests placed in the app data `plugins/` directory or installed via the Plugin Store.

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "What the plugin does",
  "plugin_type": "webhook",
  "enabled": true,
  "hooks": ["download.complete"],
  "config": {},
  "config_schema": [],
  "icon": "📦",
  "category": "notification",
  "tags": ["example"]
}
```

### Plugin Types

| Type | Purpose |
|---|---|
| `extractor` | Custom URL parsing/extraction |
| `postprocessor` | Post-download actions (extract, scan, convert) |
| `webhook` | Send events to external services |
| `notifier` | Custom notifications (toast, sound, Discord RPC) |
| `protocolhandler` | Custom protocol:// handling |
| `mirror` | Alternative mirror detection |
| `ui` | Register sidebar entries + pages |

### Hooks

| Hook | Fires When |
|---|---|
| `download.start` | A new download begins |
| `download.complete` | A download finishes |
| `download.error` | A download fails |
| `url.extract` | URL processing for extraction |
| `file.postprocess` | After file is downloaded |
| `clipboard.detect` | Clipboard URL detection |

### UI Component Types

| `component_type` | Description |
|---|---|
| `radio` | Internet radio player |
| `rss` | RSS feed reader |
| `custom` | Render HTML or iframe |
| `speed_test` | Network speed test |
| `media_player` | In-app media player |
| `torrent_search` | Torrent search UI |
| `link_checker` | Batch URL checker |
| `download_scheduler` | Visual scheduler |
| `calculator` | Calculator |
| `notes` | Notes editor |
| `password_gen` | Password generator |
| `color_picker` | Color picker |
| `timer` | Pomodoro timer |

### Publishing

1. Fork [swadhinbiswas/ZenDownload](https://github.com/swadhinbiswas/ZenDownload)
2. Add your plugin to `catalog.json`
3. Open a pull request
4. Once merged, it appears in the Plugin Store

## Configuration

Settings are persisted in a JSON store at the app data directory. Key configuration categories:

- **General** — download paths, launch on startup, language
- **Connection** — max connections, speed limits, proxy, DHT tracker
- **Downloads** — file type filters, categories, queue, auto-prioritize
- **File Types** — extension whitelist/blacklist per category
- **Cookies** — browser cookie import for authenticated downloads
- **Proxy** — HTTP/HTTPS/SOCKS5 proxy with auth
- **Notifications** — OS notifications for download events
- **Theme** — accent color, font size, corner roundness, compact mode, background density
- **Security** — VirusTotal API, adult content filtering
- **Automation** — scheduler, watch folder, subscriptions
- **Backup** — auto-backup and restore of settings

## Development

```bash
# Start development environment (hot-reload frontend + Rust)
bun run tauri dev

# Run only the frontend dev server
bun run dev

# Run Rust tests
cd src-tauri && cargo test

# Run frontend type check
bun run tsc --noEmit

# Build for production
bun run tauri build
```

### Release Build

```bash
bun run tauri build
```

The compiled binary will be in `src-tauri/target/release/`. On Linux, you'll also get a `.deb` or `.AppImage` depending on your system.

## Performance Notes

- **Max concurrent downloads:** 8 (configurable at engine level)
- **Connections per download:** 8 (HTTP multi-threaded)
- **Torrent write buffer:** 32 MB
- **HTTP client:** HTTP2 with adaptive window, connection pooling (32 idle connections per host)
- **Speed calculation:** Accurate bits-to-bytes conversion (verified against librqbit's speed struct)

## FAQ

**Q: Why are my download speeds lower than my internet speed?**  
A: Several factors: number of concurrent downloads (max 8), per-download connection count (default 8), server-side rate limiting, and whether the file has enough peers/torrent seeders. Use the built-in Speed Test (Sidebar → Speed Test) to measure your actual connection capacity.

**Q: Can I use this with my Real-Debrid account?**  
A: Yes. Go to Advanced Settings and enter your API key. ZenDownload supports Real-Debrid, AllDebrid, and Premiumize.

**Q: Does it support magnet links?**  
A: Yes. Paste a magnet link in the Add Download dialog, and the engine will resolve it via DHT/trackers and begin downloading.

**Q: How do I build a custom plugin?**  
A: See the [Plugin Development Guide](#plugin-development-guide) section above. Write a JSON manifest and place it in the plugins directory, or submit it to the Plugin Store catalog.

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes with clear messages
4. Ensure TypeScript and Rust compile without errors
5. Submit a pull request

Code style follows the existing patterns. For UI changes, use Tailwind CSS v4 with the custom `@theme inline` tokens. All Rust code should compile with `cargo check --all-features`.

## License

MIT
