#!/usr/bin/env bash
# Verify everything is in place to publish ZenDownload to the Play Store.
# Run before tagging a release.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

PASS=0
WARN=0
FAIL=0

ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; WARN=$((WARN+1)); }
fail() { printf "  \033[31m✗\033[0m %s\n" "$1"; FAIL=$((FAIL+1)); }
heading() { printf "\n\033[1;36m%s\033[0m\n" "$1"; }

heading "1. Android scaffold"
[ -f src-tauri/gen/android/app/build.gradle.kts ] && ok "build.gradle.kts present" || fail "build.gradle.kts missing"
[ -f src-tauri/gen/android/app/src/main/AndroidManifest.xml ] && ok "AndroidManifest.xml present" || fail "AndroidManifest.xml missing"
[ -f src-tauri/gen/android/app/src/main/java/com/zendownload/app/MainActivity.kt ] && ok "MainActivity.kt in com.zendownload.app package" || fail "MainActivity.kt in wrong package"
[ -f src-tauri/gen/android/gradlew ] && ok "gradlew present" || fail "gradlew missing"

heading "2. Namespace consistency"
DESKTOP_ID=$(grep '"identifier"' src-tauri/tauri.conf.json | sed 's/.*"identifier": *"\([^"]*\)".*/\1/')
ANDROID_ID=$(grep 'applicationId' src-tauri/gen/android/app/build.gradle.kts | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
ANDROID_NS=$(grep 'namespace' src-tauri/gen/android/app/build.gradle.kts | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
if [ "$DESKTOP_ID" = "$ANDROID_ID" ] && [ "$ANDROID_ID" = "$ANDROID_NS" ]; then
  ok "identifier consistent: $DESKTOP_ID"
else
  fail "identifier mismatch — desktop=$DESKTOP_ID android=$ANDROID_ID namespace=$ANDROID_NS"
fi

heading "3. AndroidManifest.xml"
MANIFEST=src-tauri/gen/android/app/src/main/AndroidManifest.xml
grep -q 'zendown' "$MANIFEST" && ok "zendown:// deep-link intent filter present" || fail "zendown:// intent filter missing"
grep -q 'magnet' "$MANIFEST" && ok "magnet: intent filter present" || fail "magnet: intent filter missing"
grep -q 'FOREGROUND_SERVICE' "$MANIFEST" && ok "FOREGROUND_SERVICE permission present" || fail "FOREGROUND_SERVICE permission missing"
grep -q 'POST_NOTIFICATIONS' "$MANIFEST" && ok "POST_NOTIFICATIONS permission present" || fail "POST_NOTIFICATIONS permission missing"
grep -q 'READ_MEDIA' "$MANIFEST" && ok "READ_MEDIA_* permissions present" || fail "READ_MEDIA_* permissions missing"
grep -q 'networkSecurityConfig' "$MANIFEST" && ok "networkSecurityConfig referenced" || fail "networkSecurityConfig missing"
grep -q 'dataExtractionRules' "$MANIFEST" && ok "dataExtractionRules referenced" || fail "dataExtractionRules missing"

heading "4. Resource files"
[ -f src-tauri/gen/android/app/src/main/res/xml/backup_rules.xml ] && ok "backup_rules.xml present" || fail "backup_rules.xml missing"
[ -f src-tauri/gen/android/app/src/main/res/xml/data_extraction_rules.xml ] && ok "data_extraction_rules.xml present" || fail "data_extraction_rules.xml missing"
[ -f src-tauri/gen/android/app/src/main/res/xml/network_security_config.xml ] && ok "network_security_config.xml present" || fail "network_security_config.xml missing"
grep -q 'ZenDownload' src-tauri/gen/android/app/src/main/res/values/strings.xml && ok "app_name is 'ZenDownload'" || fail "app_name not 'ZenDownload'"
grep -q 'Theme.Material3' src-tauri/gen/android/app/src/main/res/values/themes.xml && ok "Material 3 theme used" || fail "Material 3 theme missing"

heading "5. Play Store assets"
for f in icon-512.svg feature-graphic.svg screenshot-phone-1.svg screenshot-phone-2.svg screenshot-phone-3.svg screenshot-phone-4.svg; do
  [ -f "assets/playstore/$f" ] && ok "$f present" || fail "$f missing"
done
COUNT=$(ls assets/playstore/screenshot-phone-*.svg 2>/dev/null | wc -l)
[ "$COUNT" -ge 2 ] && ok "$COUNT phone screenshots" || fail "need at least 2 phone screenshots, have $COUNT"

heading "6. Play Store metadata"
[ -f playstore/listing.json ] && ok "listing.json present" || fail "listing.json missing"
[ -f playstore/privacy-policy.md ] && ok "privacy-policy.md present" || fail "privacy-policy.md missing"
[ -f playstore/release-notes.md ] && ok "release-notes.md present" || fail "release-notes.md missing"
[ -f playstore/README.md ] && ok "playstore/README.md present" || fail "playstore/README.md missing"

EMAIL=$(python3 -c "import json; d=json.load(open('playstore/listing.json')); print(d['app']['email'])" 2>/dev/null || echo "")
[ -n "$EMAIL" ] && ok "listing.json email set: $EMAIL" || fail "listing.json email missing"

heading "7. Build script"
[ -x scripts/build-android.sh ] && ok "scripts/build-android.sh is executable" || fail "scripts/build-android.sh not executable"
[ -f src-tauri/gen/android/keystore.properties.example ] && ok "keystore.properties.example present" || fail "keystore.properties.example missing"

heading "8. GitHub Actions"
[ -f .github/workflows/android.yml ] && ok "android.yml workflow present" || fail "android.yml workflow missing"
grep -q 'r0adkll/upload-google-play' .github/workflows/android.yml && ok "Play Store upload action configured" || fail "Play Store upload action missing"
grep -q 'r0adkll/upload-google-play' .github/workflows/android.yml && warn "make sure PLAY_STORE_SERVICE_ACCOUNT_JSON secret is set in GitHub"
[ -f .github/workflows/privacy.yml ] && ok "privacy.yml workflow present" || fail "privacy.yml workflow missing"

heading "9. Desktop config"
grep -q 'mobile' src-tauri/tauri.conf.json && ok "deep-link.mobile configured" || warn "deep-link.mobile missing in tauri.conf.json"
! grep -q '"licenseFile": ""' src-tauri/tauri.conf.json && ok "empty licenseFile removed (was breaking Windows MSI)" || fail "empty licenseFile still present"

heading "10. Main README"
grep -q 'Mobile (Android)' README.md && ok "README has Mobile section" || fail "README missing Mobile section"
grep -q 'Android' README.md && ok "Android badge in README" || fail "Android badge missing from README"

heading "Summary"
printf "  \033[32m%d passed\033[0m, \033[33m%d warnings\033[0m, \033[31m%d failures\033[0m\n" "$PASS" "$WARN" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  printf "\n  \033[31mFix the failures above before publishing.\033[0m\n"
  exit 1
fi

printf "\n  \033[32mReady to publish to Play Store.\033[0m\n"
printf "  Run: ./scripts/build-android.sh\n"
printf "  Or push a v* tag to trigger .github/workflows/android.yml\n"
