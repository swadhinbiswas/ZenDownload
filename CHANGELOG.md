# Changelog

All notable changes to ZenDownload will be documented in this file.

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
