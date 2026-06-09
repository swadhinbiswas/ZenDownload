# Building ZenDownload

Detailed instructions for building ZenDownload from source on all platforms.

## Quick Reference

```bash
# Install dependencies (one-time)
bun install

# Development
bun run tauri dev

# Production build (current platform)
bun run tauri build

# Build specific format
bun run tauri build --bundles deb
bun run tauri build --bundles appimage
bun run tauri build --bundles msi,nsis
bun run tauri build --bundles app,dmg
```

The build outputs are in `src-tauri/target/release/bundle/`.

---

## Linux

### Prerequisites

Ubuntu 22.04+ / Debian 12+ / Fedora 36+ / Arch (current)

```bash
# Ubuntu / Debian
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libnotify-dev \
  libssl-dev \
  libsqlite3-dev \
  patchelf \
  build-essential \
  curl wget file

# Fedora
sudo dnf install -y \
  webkit2gtk4.1-devel \
  gtk3-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  openssl-devel \
  sqlite-devel \
  patchelf

# Arch
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  gtk3 \
  libappindicator-gtk3 \
  librsvg \
  openssl \
  sqlite \
  patchelf
```

### Install Rust & Bun
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
curl -fsSL https://bun.sh/install | bash
```

### Build
```bash
git clone https://github.com/zendownload/zendownload.git
cd zendownload
bun install
bun run tauri build --bundles deb,appimage
```

### Output
- `src-tauri/target/release/bundle/deb/ZenDownload_0.1.0_amd64.deb`
- `src-tauri/target/release/bundle/appimage/ZenDownload_0.1.0_x86_64.AppImage`

### Install
```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/ZenDownload_0.1.0_amd64.deb
sudo apt-get install -f
zendownload
```

### Flatpak
```bash
sudo apt-get install -y flatpak flatpak-builder
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install -y flathub org.freedesktop.Platform//23.08 org.freedesktop.Sdk//23.08

# Build
cd flatpak
flatpak-builder --repo=repo --force-clean build-dir com.zendownload.app.json
flatpak build-bundle repo ZenDownload-0.1.0.flatpak com.zendownload.app
flatpak install ZenDownload-0.1.0.flatpak
```

### Cross-compile to ARM64
```bash
rustup target add aarch64-unknown-linux-gnu
sudo apt-get install -y gcc-aarch64-linux-gnu
bun run tauri build --target aarch64-unknown-linux-gnu --bundles deb
```

---

## macOS

### Prerequisites
- Xcode Command Line Tools: `xcode-select --install`
- Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Bun: `curl -fsSL https://bun.sh/install | bash`

### Build
```bash
git clone https://github.com/zendownload/zendownload.git
cd zendownload
bun install
bun run tauri build --bundles app,dmg
```

### Output
- `src-tauri/target/release/bundle/macos/ZenDownload.app`
- `src-tauri/target/release/bundle/dmg/ZenDownload_0.1.0_aarch64.dmg`

### Universal Binary (both architectures)
```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
bun run tauri build --target universal-apple-darwin --bundles app,dmg
```

### Code Signing & Notarization
```bash
# Set environment variables
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="TEAMID"

# Build with signing
bun run tauri build --bundles app,dmg

# Notarize
xcrun notarytool submit ZenDownload.dmg \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait
xcrun stapler staple ZenDownload.dmg
```

---

## Windows

### Prerequisites
- **Visual Studio Build Tools 2022** with "Desktop development with C++" workload
- **WebView2 Runtime** (pre-installed on Windows 10+)
- **Rust**: `winget install Rustlang.Rustup` or download from rustup.rs
- **Bun**: `winget install Oven-sh.Bun` or download from bun.sh
- **NSIS** (for installer): `winget install NSIS.NSIS`
- **WiX Toolset 3.x** (for MSI): `winget install WiXToolset.WiXToolset`

### Build
```cmd
git clone https://github.com/zendownload/zendownload.git
cd zendownload
bun install
bun run tauri build --bundles msi,nsis
```

### Output
- `src-tauri\target\release\bundle\msi\ZenDownload_0.1.0_x64_en-US.msi`
- `src-tauri\target\release\bundle\nsis\ZenDownload_0.1.0_x64-setup.exe`

### Code Signing
```cmd
# Using signtool (part of Windows SDK)
signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 ^
  /a /f path\to\cert.pfx /p password ^
  src-tauri\target\release\zendownload.exe
```

### ARM64 Build
```cmd
rustup target add aarch64-pc-windows-msvc
bun run tauri build --target aarch64-pc-windows-msvc --bundles msi,nsis
```

---

## Reproducible Builds (Docker)

For consistent Linux builds across machines:

```bash
docker build -t zendownload-build -f docker/Dockerfile.build .
docker run --rm -v $(pwd):/build zendownload-build bash -c \
  "cd /build && bun install && bun run tauri build --bundles deb,appimage"
```

The output bundles will be in `src-tauri/target/release/bundle/`.

---

## Release Process

1. Update version in `package.json` and `src-tauri/Cargo.toml`
2. Update version in `src-tauri/tauri.conf.json`
3. Update version in `flatpak/com.zendownload.app.metainfo.xml`
4. Commit and tag: `git tag v0.2.0`
5. Push tag: `git push origin v0.2.0`
6. GitHub Actions automatically:
   - Builds all platforms
   - Generates SHA256SUMS
   - Creates GitHub release with all binaries
   - Submits update to Flathub repo
   - Generates Tauri updater metadata

---

## Troubleshooting

### Linux: "libgtk-3.so.0 not found"
Install the GTK 3 development packages (see Linux prerequisites above).

### macOS: "code object is not signed at all"
You need to sign the app. Use `codesign --deep --force --sign "Developer ID Application: Your Name" ZenDownload.app`.

### Windows: "MSVC link.exe not found"
Install Visual Studio Build Tools with the "Desktop development with C++" workload.

### Build fails on missing icon files
Run `scripts/build-icons.sh` to regenerate all icon variants from `src-tauri/icons/icon.svg`.

### Tauri version mismatch
Tauri 2.x is required. Check with `cargo install tauri-cli --version "^2"`.
