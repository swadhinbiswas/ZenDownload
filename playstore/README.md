# Publishing ZenDownload to the Play Store

This directory contains everything you need to publish ZenDownload to the Google Play Store.

## Files

| File | Purpose |
|---|---|
| `listing.json` | Full Play Console store listing metadata (descriptions, tags, asset paths) |
| `privacy-policy.md` | Privacy policy — must be hosted at a public URL and linked from Play Console |
| `release-notes.md` | Release notes for the latest version |
| `README.md` | This file — publishing workflow |

## Asset preparation

The Play Store requires PNG assets, not SVG. Convert them with `rsvg-convert` (or Inkscape):

```bash
# Install librsvg on Linux/macOS
sudo apt install librsvg2-bin      # Debian/Ubuntu
brew install librsvg               # macOS

# Convert each SVG to the required PNG size
rsvg-convert -w 512 -h 512  assets/playstore/icon-512.svg         > assets/playstore/icon-512.png
rsvg-convert -w 1024 -h 500 assets/playstore/feature-graphic.svg  > assets/playstore/feature-graphic.png

# Phone screenshots: 540 x 960 px (or similar 9:16), 2-8 images required
for i in 1 2 3 4 5 6 7 8; do
  rsvg-convert -w 540 -h 960 assets/playstore/screenshot-phone-$i.svg \
    > assets/playstore/screenshot-phone-$i.png
done

# Tablet screenshots: 1280 x 800 px (or similar 16:10), optional but recommended
rsvg-convert -w 1280 -h 800 assets/playstore/screenshot-tablet-1.svg > assets/playstore/screenshot-tablet-1.png
rsvg-convert -w 1280 -h 800 assets/playstore/screenshot-tablet-2.svg > assets/playstore/screenshot-tablet-2.png
```

### Required asset dimensions

| Asset | Size | Required |
|---|---|---|
| App icon | 512 x 512 | Yes |
| Feature graphic | 1024 x 500 | Yes |
| Phone screenshots | 540 x 960 (min 320 px on long side) | Min 2, max 8 |
| 7-inch tablet screenshots | 1024 x 600 (min 600 px on long side) | Optional |
| 10-inch tablet screenshots | 1280 x 800 (min 600 px on long side) | Optional |

## One-time setup

1. **Pay the $25 Play Console fee** and create a developer account at <https://play.google.com/console>.
2. **Create the app** in Play Console:
   - App name: `ZenDownload — Universal Download Manager`
   - Default language: English (United States)
   - App or Game: App
   - Free or Paid: Free
3. **Fill in the Store Listing** with values from `listing.json` (title, short description, full description).
4. **Upload all graphics** (icon, feature graphic, phone and tablet screenshots).
5. **Set up content rating** — fill the IARC questionnaire. ZenDownload is a download utility, so the expected answers:
   - Violence: No
   - Sexual content: No
   - Language: No
   - Controlled substances: No (or "Yes, references only" if you allow debrid)
   - Expected rating: PEGI 3 / Everyone
6. **Set up pricing & distribution** — Free, distribute to all countries you want.
7. **Set up app content**:
   - Privacy policy: upload `privacy-policy.md` somewhere (GitHub Pages works) and paste the URL
   - Ads: No
   - App access: All functionality available without special access
   - Data safety: declare no data collection
   - Government apps: No
   - Financial features: No
   - Health apps: No
8. **Pick the app category**: Productivity (or Tools).

## Building the signed AAB

1. **Generate a release keystore** (only once — keep it safe forever):

   ```bash
   keytool -genkey -v \
     -keystore ~/zendownload-release.keystore \
     -alias zendownload \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **Create `keystore.properties`** in `src-tauri/gen/android/` (NOT committed):

   ```properties
   storeFile=/home/you/zendownload-release.keystore
   storePassword=YOUR_STORE_PASSWORD
   keyAlias=zendownload
   keyPassword=YOUR_KEY_PASSWORD
   ```

3. **Build the signed AAB**:

   ```bash
   cd src-tauri/gen/android
   ./gradlew bundleRelease
   ```

   The output is at `app/build/outputs/bundle/release/app-release.aab`.

4. **Verify the AAB is signed**:

   ```bash
   jarsigner -verify -verbose app/build/outputs/bundle/release/app-release.aab
   ```

## Uploading to Play Console

1. Go to Play Console → your app → **Release** → **Production** (or Internal Testing for the first upload).
2. Click **Create new release**.
3. Upload `app-release.aab`.
4. Set the release name (e.g. "0.1.0") and paste release notes from `release-notes.md`.
5. Review and roll out.

## Enabling Play App Signing (strongly recommended)

When you upload your first AAB, Play Console will offer to manage your signing key. **Accept.** This way:

- Google holds the upload key (so you can reset it if lost)
- You keep your app signing key safe in Google's HSM
- Future AABs only need to be signed with the upload key

If you skip this, you must keep your keystore safe forever or lose the ability to update the app.

## Versioning

Bump versions in `src-tauri/gen/android/app/tauri.properties`:

```properties
tauri.android.versionName=0.2.0
tauri.android.versionCode=1001   # MUST be a higher integer than the previous
```

The `versionCode` must always increase. The `versionName` is what users see.

## Testing the build locally

Before uploading:

```bash
# Install the signed release APK on a connected device
adb install app/build/outputs/apk/release/app-arm64-v8a-release.apk

# Or install the debug build
cd src-tauri/gen/android
./gradlew installDebug
```

## Troubleshooting

**Build fails with "licenseFile" / "os error 3"** — already fixed in `tauri.conf.json`; ensure `licenseFile` is removed or set to a real path.

**"Namespace not specified"** — `namespace` is set to `com.zendownload.app` in `app/build.gradle.kts`. Don't change it unless you also change the Play Console listing.

**"ApplicationId is already in use"** — the namespace `com.zendownload.app` is reserved. If Play Console rejects it, you must have created it under a different account.

**AAB too large** — enable APK splits (already on) and ABI splits in Play Console → Device catalog → Managed availability.

**App crashes on launch** — verify `usesCleartextTraffic` is `false` for release builds (already correct).
