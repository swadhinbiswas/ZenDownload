#!/usr/bin/env bash
# Build Firefox extension from shared source
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$SCRIPT_DIR/../extension"
BUILD_DIR="$SCRIPT_DIR/../extension-firefox-build"

echo "Building Firefox extension..."

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy all extension files except Chrome manifest
cp -r "$EXT_DIR"/* "$BUILD_DIR/" 2>/dev/null || true
cp -r "$EXT_DIR/icons" "$BUILD_DIR/icons" 2>/dev/null || true

# Use Firefox manifest
cp "$EXT_DIR/manifest.firefox.json" "$BUILD_DIR/manifest.json"

# Remove Chrome-specific files
rm -f "$BUILD_DIR/manifest.chrome.json" "$BUILD_DIR/manifest.firefox.json" 2>/dev/null || true

echo "Firefox extension built at: $BUILD_DIR"
echo "Load it in Firefox: about:debugging#/runtime/this-firefox → Load Temporary Add-on"
echo ""
echo "To package: zip -r zen-firefox.zip firefox-extension-build/ -x '*.DS_Store'"
