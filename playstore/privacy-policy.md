# Privacy Policy — ZenDownload

**Last updated:** 2026-06-17

ZenDownload ("we", "our", "the app") is an open-source download manager available for Windows, macOS, Linux, and Android. This policy explains what data the app handles.

## The short version

**Nothing leaves your device unless you explicitly download something.** There is no telemetry, no analytics, no account system, and no background reporting.

## Data we collect

**None.** We do not collect, store, transmit, or sell any personal data.

Specifically:

- No usage analytics
- No crash reporting
- No device fingerprinting
- No advertising identifiers
- No third-party trackers

## How the app works

When you add a download, ZenDownload makes a network request to the URL you provided (or to the relevant streaming service via yt-dlp). The app only talks to the internet for the things you ask it to do:

- **HTTP/HTTPS downloads** — direct connection to the file host
- **BitTorrent** — peer-to-peer connections to other torrent peers
- **yt-dlp extraction** — fetches the public streaming page you point it at
- **Cookie import** — only used locally to authenticate downloads you initiated

Cookies you import stay on your device. They are never sent anywhere except the websites they belong to.

## Permissions

The Android version requests the minimum permissions needed:

- **Internet** — to download files you requested
- **Notifications** — to alert you when downloads complete
- **Foreground service** — to keep active downloads alive when the app is in the background
- **Media access** (Android 13+) — to save downloaded media to your public folders if you choose
- **Storage** (Android 12 and below) — same as above on older Android versions

No permission is used for anything else.

## Open source

ZenDownload is MIT-licensed open-source software. You can read every line of code at <https://github.com/swadhinbiswas/ZenDownload>. If you find anything in this policy that doesn't match the code, the code is authoritative — please open an issue.

## Updates to this policy

If we ever change this policy (we don't plan to), we will update this page and bump the "Last updated" date above.

## Contact

If you have questions about this policy, open an issue on GitHub:
<https://github.com/swadhinbiswas/ZenDownload/issues>

Or email: support@zivlor.com
