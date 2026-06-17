# Changelog

All notable changes to ZenDownload will be documented in this file.

## [Unreleased]

### Added
- **Android (Play Store) release** — full Tauri 2 Android scaffold under `src-tauri/gen/android/`
  - Standardized namespace to `com.zendownload.app` (was `com.zen.download`)
  - Signed AAB build pipeline (`scripts/build-android.sh` + GitHub Actions workflow)
  - ABI splits for `arm64-v8a`, `armeabi-v7a`, `x86_64` + universal APK fallback
  - Release build enables R8/ProGuard + resource shrinking
- **Play Store metadata** under `playstore/`:
  - `listing.json` — full Play Console store-listing metadata
  - `privacy-policy.md` — privacy policy (no data collection)
  - `release-notes.md` — release notes for 0.1.0
  - `README.md` — step-by-step publishing guide
- **Play Store SVG assets** under `assets/playstore/`:
  - 512×512 app icon
  - 1024×500 feature graphic
  - 8 phone screenshots (540×960) covering Downloads, Torrents, Music, Speed Test, Plugins, Appearance, Add-Download, hero
  - 2 tablet screenshots (1280×800) covering Downloads and Music
- **`zendown://` and `magnet:` deep-link intent filters** in `AndroidManifest.xml`
- **Battery-optimisation exemption** request (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) — opt-in at runtime
- **Foreground service** permissions so downloads survive when the app is backgrounded
- **Adaptive launcher icon** + Material 3 dark theme using brand colors
- **Backup rules** (`backup_rules.xml`, `data_extraction_rules.xml`) covering the SQLite DB and shared-prefs
- **Network security config** with HTTPS-only base config
- **GitHub Actions** workflows:
  - `android.yml` — builds signed AAB on every push, uploads to Play Store internal track on `v*` tags
  - `privacy.yml` — publishes `playstore/privacy-policy.md` to GitHub Pages
- **README** — new `## Mobile (Android)` section with build command and screenshot strip
- **Build script** `scripts/build-android.sh` — one-command signed AAB build

### Changed
- `tauri.conf.json` — added `plugins.deep-link.mobile` so the `zendown://` deep link works on Android too
- Android theme switched from default Material to brand-tinted Material 3 dark
- App label normalised from `zendownload` to `ZenDownload`

### Fixed
- **Windows MSI bundling** — removed empty `"licenseFile": ""` from `tauri.conf.json` which caused `os error 3` during WIX bundling
- README rewritten with a professional hero banner, 25 inline feature icons, and 7 polished app screenshots

## [0.1.0] - 2026-06-07

### Added
- Multi-threaded HTTP/FTP download engine (up to 64 parallel connections)
- Adaptive chunk sizing and zone-based scheduling
- Robust chunk-level resume with exponential backoff
- Torrent engine with full session persistence (librqbit)
- Magnet link and .torrent file support
- Video stream extraction via yt-dlp (1000+ sites)
- HLS / DASH stream downloader with direct manifest parsing
- Live TV streaming with 11,000+ IPTV channels from iptv-org
- Batch URL Import with category assignment
- Site Grabber (BFS web crawler with file-type filtering)
- Link Checker (HTTP HEAD, file size, type detection)
- Format Converter (FFmpeg-based, 9 built-in presets)
- Auto-extract archives (ZIP, RAR, 7z, tar.gz)
- Watch folder for automatic URL detection
- Scheduler for time-based downloads
- Video stream sniffer for browser integration
- REST API server (axum, port 9527)
- CLI with list/add/pause/resume/cancel/delete/stats
- WebSocket server for browser extension
- Clipboard monitoring
- System tray with pause/resume all, downloads folder quick access
- Desktop notifications (cross-platform)
- Auto-start on boot (macOS LaunchAgent, Linux .desktop, Windows registry)
- Close-to-tray (background running)
- Browser extension (Chrome/Edge/Brave/Firefox, Manifest V3)
- Custom themes (font size, border radius, compact mode)
- Performance dashboard
- Multi-language support (i18n scaffolded)
- Backup/restore settings
- Cloud mirroring (Dropbox, Google Drive, S3) - via saved settings
- Cookie management for authenticated downloads
- Proxy support (HTTP, SOCKS5)
- Smart Queue with priorities
- Subscription support (RSS feeds)
- Download history
- VirusTotal integration
- Speed limit per download
- Keyboard shortcuts
- Speed graph and sparkline
- Download thumbnails via yt-dlp

### Security
- All Tauri commands properly typed
- CORS configured for local API server
- HTTPS-only checks for sensitive operations

### Platform Support
- Windows 10/11 (x64, ARM64)
- macOS 10.15+ (Intel, Apple Silicon)
- Linux (Debian, Ubuntu, Fedora, Arch)
  - .deb packages
  - .rpm packages
  - .AppImage (portable)
  - Flatpak (Flathub)
- Browser extension (Chrome, Edge, Brave, Firefox)
