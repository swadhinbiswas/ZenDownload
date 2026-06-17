#!/usr/bin/env bash
# Build the Android App Bundle (AAB) for Play Store.
#
# Prerequisites:
#   - Java 17+ (JDK)
#   - Android SDK with API 34 platform and build-tools 34.0.0+
#   - A keystore.properties file in src-tauri/gen/android/ (see playstore/README.md)
#
# Output:
#   src-tauri/gen/android/app/build/outputs/bundle/release/app-release.aab

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/src-tauri/gen/android"

if [ ! -f "$ANDROID_DIR/keystore.properties" ]; then
  echo "ERROR: keystore.properties not found in $ANDROID_DIR"
  echo "Copy $ANDROID_DIR/keystore.properties.example to keystore.properties and fill it in."
  echo "See playstore/README.md for instructions."
  exit 1
fi

echo "==> Building frontend bundle"
cd "$ROOT_DIR"
bun run build

echo "==> Building signed Android App Bundle"
cd "$ANDROID_DIR"
./gradlew bundleRelease

echo ""
echo "==> Done."
echo "AAB is at: $ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
echo ""
echo "Verify it's signed with:"
echo "  jarsigner -verify -verbose $ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
echo ""
echo "Next: upload to Play Console at https://play.google.com/console"
