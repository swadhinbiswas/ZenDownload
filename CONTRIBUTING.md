# Contributing to ZenDownload

Thank you for your interest in contributing! This document outlines the process.

## Code of Conduct

Be respectful, constructive, and inclusive. Harassment and spam will not be tolerated.

## Getting Started

```bash
git clone https://github.com/swadhinbiswas/ZenDownload.git
cd zendownload

# Install Bun (https://bun.sh)
bun install

# Start dev environment
bun run tauri dev     # Full app with hot reload
bun run dev           # Frontend only
```

### Required Tools

- [Bun](https://bun.sh) or Node.js 18+
- [Rust](https://rustup.rs) (latest stable)
- Tauri v2 [system dependencies](https://v2.tauri.app/start/prerequisites/)
- `ffmpeg` (for media conversion)
- `yt-dlp` (for media extraction — auto-downloaded)

## Development Workflow

### 1. Pick an Issue
- Check [open issues](https://github.com/swadhinbiswas/ZenDownload/issues)
- Comment that you're working on it
- For new features, open a discussion first

### 2. Create a Branch
```bash
git checkout -b feat/my-feature      # feature
git checkout -b fix/my-fix           # bug fix
git checkout -b docs/my-change       # docs
```

### 3. Make Changes

**TypeScript (Frontend):**
- State: [Zustand](https://docs.pmnd.rs/zustand)
- Styling: [Tailwind CSS v4](https://tailwindcss.com/)
- Icons: [Lucide React](https://lucide.dev/icons/)
- UI primitives: shadcn/ui components in `src/components/ui/`

**Rust (Backend):**
- Download engine: `src-tauri/src/engine/mod.rs`
- Tauri commands: `src-tauri/src/lib.rs`
- Database: `src-tauri/src/db.rs`

### 4. Verify Before Committing

```bash
# Frontend type check (0 errors required)
bun run tsc --noEmit

# Rust compilation (0 errors required)
cd src-tauri && cargo check

# Format (recommended)
bunx prettier --write "src/**/*.{ts,tsx}"
cd src-tauri && cargo fmt
```

### 5. Commit

Write clear, conventional commit messages:

```
feat: add RSSHub route browser to subscriptions page
fix: prevent HTTP downloader from opening directories as files
docs: add install script for Linux
refactor: replace host-list URL routing with HEAD probe
```

Format: `type: description`

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `style`

### 6. Pull Request

1. Push your branch
2. Open a PR against `main`
3. Fill out the PR template
4. Link related issues with `Closes #123`

### PR Requirements

- [ ] TypeScript compiles: `bun run tsc --noEmit` — 0 errors
- [ ] Rust compiles: `cd src-tauri && cargo check` — 0 errors
- [ ] Code follows existing patterns and conventions
- [ ] No commented-out code or debug prints (use `tracing::debug!` for Rust)
- [ ] UI changes maintain dark theme consistency

## Project Structure

```
src/                          # React + TypeScript frontend
├── components/
│   ├── downloads/            # Download list, progress, context menus
│   ├── layout/               # Sidebar, toolbar, app shell
│   ├── modals/               # Add download, settings, performance
│   ├── pages/                # Grabber, TV, music, stream, plugins, feed
│   ├── plugins/              # Plugin page renderer, radio, RSS reader
│   ├── settings/             # Theme, system, connection settings
│   ├── subscriptions/        # RSS/YouTube subscription manager
│   └── ui/                   # shadcn/ui primitives (select, dialog, etc.)
├── stores/                   # Zustand stores
│   ├── downloadStore.ts      # Download state, events, progress
│   ├── settingsStore.ts      # All app settings with persistence
│   └── ...
└── services/                 # Notifications, translations

src-tauri/                    # Rust backend
└── src/
    ├── engine/
    │   ├── mod.rs            # DownloadEngine — orchestrator + routing
    │   ├── http.rs           # HTTP/HTTPS downloads (single + multi)
    │   ├── stream.rs         # yt-dlp integration, HLS, DASH
    │   ├── torrent.rs        # BitTorrent (librqbit)
    │   ├── automation.rs     # Subscriptions, RSS, scheduling
    │   ├── api_server.rs     # REST API (axum)
    │   └── ...
    ├── lib.rs                # Tauri command definitions
    └── main.rs               # Entry point

extension/                    # Browser extension (Chrome/Firefox)
├── background.js             # Service worker — download interception, API client
├── content.js                # Content script — floating button, media detection
├── content.css               # Injected styles
└── popup.html/js             # Popup UI
```

## Code Style

- **TypeScript**: Follow existing patterns. Use `const` over `let`. Prefer arrow functions.
- **React**: Functional components with hooks. Use `cn()` for conditional classes.
- **Rust**: Follow standard conventions. Use `?` for error propagation. Prefer `if let` over `match` for single patterns.
- **CSS**: Tailwind utility classes only in components. Custom tokens in `src/index.css`.

## Testing

```bash
# Rust tests
cd src-tauri && cargo test

# Frontend — no test suite yet (contributions welcome!)
```

## Documentation

- **README.md** — project overview, features, quick start
- **SECURITY.md** — vulnerability reporting and security practices
- **CONTRIBUTING.md** — this file
- **docs/PLUGIN_DEVELOPMENT.md** — plugin development guide

## Questions?

Open a [discussion](https://github.com/swadhinbiswas/ZenDownload/discussions) or comment on the relevant issue.
