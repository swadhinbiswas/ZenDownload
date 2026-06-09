# ZenDownload Browser Extension

Universal browser capture for ZenDownload. Works on Chrome, Edge, Brave, Firefox, and any Chromium-based browser.

## Features

- **Floating download button** - Appears on hover over any video/audio element
- **Link panel** - Slide-out panel showing all links on the current page, filterable by type
- **Sniffed file detection** - Automatically detects files matching common extensions (zip, exe, mp4, mp3, pdf, etc.) via webRequest
- **Right-click menu** - "Download with ZenDownload" on links, images, videos, audio
- **Page capture** - One-click capture all downloadable links on a page
- **Direct API integration** - Sends downloads to `http://localhost:9527` (ZenDownload's REST API)

## Install (Chrome / Edge / Brave)

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select this `extension/` folder

## Install (Firefox)

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `extension/manifest.json`

## Required

- ZenDownload app must be running
- API server must be enabled (default port 9527)

## How it works

```
Browser page  ──►  Content script detects media
       │
       ├─►  Floating button (hover over <video> / <audio>)
       ├─►  Link panel (all <a href> on page)
       └─►  webRequest sniffer (auto-detect downloads)

All detections  ──►  background.js
                            │
                            ▼
                   POST /api/downloads
                            │
                            ▼
                   ZenDownload queue
```

## Permissions

- `downloads` - intercept browser download events
- `tabs` - query active tab for context
- `webRequest` - sniff media requests
- `storage` - track sent count
- `contextMenus` - right-click menu
- `<all_urls>` - run on every site
