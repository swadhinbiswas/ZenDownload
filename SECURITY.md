# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| Latest release | ✅ |
| Pre-release | ⚠️ Best effort |
| `main` branch | ⚠️ Development — may contain unstable changes |

## Reporting a Vulnerability

**Do not open a public issue.** Email security concerns to the maintainer:

- **Email:** `security@zendownload.app` *(or create a GitHub Security Advisory)*
- **General / Play Store support:** `support@zivlor.com`
- **GitHub:** [Report a vulnerability](https://github.com/swadhinbiswas/ZenDownload/security/advisories/new)

You can expect:

- **Acknowledgment** within 48 hours
- **Status update** within 5 business days
- **Resolution timeline** based on severity

### What to Include

- Steps to reproduce
- Affected version(s)
- Potential impact
- Suggested fix (if any)

## Security Best Practices for Users

1. **Browser cookies are sensitive** — the browser extension sends cookies to the desktop app for authenticated downloads. Cookies are transmitted locally and never leave your machine.
2. **API server** (Settings → Advanced → API Server) is **disabled by default**. Only enable if you need remote access, and use a strong password.
3. **Real-Debrid / Debrid API keys** are stored in the local SQLite database. The database file is only accessible to your OS user account.
4. **Plugin system** — only install plugins from trusted sources. Plugins run with the same privileges as the app.
5. **Build dependencies** — regularly update Rust crates and npm packages: `cargo update && bun update`

## Scope

- The desktop application (Rust/Tauri binary)
- The browser extension (Chrome/Firefox)
- The `zendown://` protocol handler
- The REST API server (when enabled)

**Out of scope:** third-party services (yt-dlp, ffmpeg, Real-Debrid, RSSHub instances, Google Drive integration).
