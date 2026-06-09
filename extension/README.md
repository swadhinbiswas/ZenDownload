# ZenDownload Browser Extension

Universal browser capture for ZenDownload. Works on Chrome, Edge, Brave, Firefox, and any Chromium-based browser.

## Features

- **Floating download button** — Appears on hover over any video/audio element
- **Link panel** — Slide-out panel showing all links on the current page, filterable by type
- **Sniffed file detection** — Automatically detects files matching common extensions via webRequest
- **Right-click menu** — "Download with ZenDownload" on links, images, videos, audio
- **Page capture** — One-click capture all downloadable links on a page
- **Options page** — Configure interception behavior, notifications, and sniffing
- **Dual communication** — HTTP REST API (default) with native messaging fallback

## Quick Install

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" → Select the `extension/` folder

## How it works

```
Browser page ──► Content script detects media
       │
       ├─► Floating button (hover <video>/<audio>)
       ├─► Link panel (all <a href> on page)
       └─► webRequest sniffer (auto-detect)
       │
       ▼
  background.js
       │
       ├─► Native messaging (com.zendownload.host)
       └─► HTTP POST → localhost:9527/api/downloads
                          │
                          ▼
                    ZenDownload queue
```

## Communication

The extension sends download URLs to ZenDownload via two paths:

| Path | Method | Port | Reliability |
|------|--------|------|-------------|
| **HTTP REST API** | POST /api/downloads | 9527 | Always available |
| **Native Messaging** | Native host protocol | — | Low-latency, direct |

Native messaging is preferred when available; the extension automatically falls back to HTTP.

## Native Messaging Setup

The native messaging host manifest is generated at runtime. To install it:

```bash
# Chrome (Linux) — requires root
sudo cp com.zendownload.host.json /etc/opt/chrome/native-messaging-hosts/

# Chrome (macOS)
cp com.zendownload.host.json ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/

# Chromium (Linux)
sudo cp com.zendownload.host.json /etc/chromium/native-messaging-hosts/
```

Get the manifest JSON from ZenDownload: `Settings → Advanced → Native Messaging Manifest`.

## Options

Right-click the extension icon → "Options" to configure:
- **Intercept downloads** — Auto-forward Chrome downloads to ZenDownload
- **Show notifications** — Toggle notification on file send
- **WebRequest sniffing** — Enable/disable automatic file detection

## Permissions

- `downloads` — Intercept browser download events
- `nativeMessaging` — Communicate with ZenDownload directly
- `tabs`, `activeTab` — Query active tab for context
- `webRequest` — Sniff network requests for file URLs
- `storage` — Persist settings and sent count
- `contextMenus` — Right-click menu integration
- `<all_urls>` — Detect downloadable content on any page
