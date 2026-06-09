#!/usr/bin/env bash
# Build ZenDownload for current platform
# Usage: ./scripts/build.sh [target]
# Targets: linux, deb, appimage, windows, macos, dmg
set -e

cd "$(dirname "$0")/.."

target="${1:-current}"

case "$target" in
  current|linux)
    echo "==> Building for Linux (deb + AppImage)"
    bun run tauri build --bundles deb,appimage
    ;;
  deb)
    echo "==> Building .deb package"
    bun run tauri build --bundles deb
    ;;
  appimage)
    echo "==> Building AppImage"
    bun run tauri build --bundles appimage
    ;;
  windows|win)
    echo "==> Building for Windows (msi + nsis)"
    bun run tauri build --bundles msi,nsis
    ;;
  macos|mac)
    echo "==> Building for macOS (dmg + app)"
    bun run tauri build --bundles dmg,app
    ;;
  dmg)
    echo "==> Building macOS .dmg"
    bun run tauri build --bundles dmg
    ;;
  all)
    echo "==> Building for all configured targets"
    bun run tauri build
    ;;
  *)
    echo "Unknown target: $target"
    echo "Usage: $0 [linux|deb|appimage|windows|macos|dmg|all]"
    exit 1
    ;;
esac

echo "==> Build complete"
ls -la src-tauri/target/release/bundle/ 2>/dev/null || true
