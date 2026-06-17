#!/usr/bin/env bash
set -euo pipefail

# ┌─────────────────────────────────────────────────────────┐
# │         ZenDownload — Linux Installer                    │
# │         curl -fsSL https://install.zendownload.app | bash │
# └─────────────────────────────────────────────────────────┘

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"
DIM="\033[2m"

INSTALL_DIR="${HOME}/.local/share/zendownload"
BIN_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons/hicolor/128x128/apps"
GITHUB_REPO="swadhinbiswas/ZenDownload"
TMP_DIR="$(mktemp -d)"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

header() {
    echo -e "${BLUE}"
    echo " ╔══════════════════════════════════════════╗"
    echo " ║   ███████╗███████╗███╗   ██╗           ║"
    echo " ║   ╚══███╔╝██╔════╝████╗  ██║           ║"
    echo " ║     ███╔╝ █████╗  ██╔██╗ ██║           ║"
    echo " ║    ███╔╝  ██╔══╝  ██║╚██╗██║           ║"
    echo " ║   ███████╗███████╗██║ ╚████║           ║"
    echo " ║   ╚══════╝╚══════╝╚═╝  ╚═══╝           ║"
    echo " ║         Download Manager                 ║"
    echo " ╚══════════════════════════════════════════╝"
    echo -e "${RESET}"
}

spinner() {
    local pid=$1 msg=$2
    local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        i=$(( (i + 1) % ${#spin} ))
        printf "\r  ${CYAN}%s${RESET} %s" "${spin:$i:1}" "$msg"
        sleep 0.1
    done
    printf "\r  ${GREEN}✓${RESET} %s\n" "$msg"
}

check_deps() {
    local missing=()
    command -v curl >/dev/null 2>&1 || missing+=("curl")
    command -v tar >/dev/null 2>&1 || missing+=("tar")
    command -v xdg-open >/dev/null 2>&1 || missing+=("xdg-utils")

    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${RED}Missing dependencies:${RESET} ${missing[*]}"
        echo ""
        echo -e "Install them with:"
        echo -e "  ${YELLOW}sudo apt install ${missing[*]}${RESET}   ${DIM}# Ubuntu/Debian${RESET}"
        echo -e "  ${YELLOW}sudo dnf install ${missing[*]}${RESET}   ${DIM}# Fedora${RESET}"
        echo -e "  ${YELLOW}sudo pacman -S ${missing[*]}${RESET}   ${DIM}# Arch${RESET}"
        exit 1
    fi
}

detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "$ID"
    else
        echo "unknown"
    fi
}

install_system_deps() {
    local distro="$1"
    echo -e "\n${BOLD}Installing system dependencies...${RESET}\n"

    case "$distro" in
        ubuntu|debian|pop|linuxmint|elementary|zorin|kali|parrot)
            echo -e "  ${DIM}Detected Debian-based system${RESET}"
            sudo apt update -qq
            sudo apt install -y -qq \
                libwebkit2gtk-4.1-0 \
                libgtk-3-0 \
                libayatana-appindicator3-1 \
                libnotify4 \
                libavformat-dev \
                libavcodec-dev \
                libssl3 \
                ffmpeg \
                2>/dev/null || true
            ;;
        fedora|rhel|centos|rocky|almalinux|nobara)
            echo -e "  ${DIM}Detected RPM-based system${RESET}"
            sudo dnf install -y -q \
                webkit2gtk4.1 \
                gtk3 \
                libappindicator-gtk3 \
                libnotify \
                ffmpeg-free \
                2>/dev/null || true
            ;;
        arch|manjaro|endeavouros|garuda|cachyos)
            echo -e "  ${DIM}Detected Arch-based system${RESET}"
            sudo pacman -S --noconfirm --needed \
                webkit2gtk-4.1 \
                gtk3 \
                libappindicator-gtk3 \
                libnotify \
                ffmpeg \
                2>/dev/null || true
            ;;
        opensuse*|suse)
            echo -e "  ${DIM}Detected openSUSE system${RESET}"
            sudo zypper install -y \
                libwebkit2gtk-4_1-0 \
                libgtk-3-0 \
                libappindicator3-1 \
                libnotify4 \
                ffmpeg \
                2>/dev/null || true
            ;;
        nixos)
            echo -e "  ${DIM}Detected NixOS — adding to environment${RESET}"
            echo -e "  ${YELLOW}Run: nix-shell -p webkitgtk_4_1 gtk3 libayatana-appindicator libnotify ffmpeg${RESET}"
            ;;
        *)
            echo -e "  ${YELLOW}Unknown distro — skipping system dependencies.${RESET}"
            echo -e "  ${DIM}You may need to install: webkit2gtk-4.1, gtk3, libappindicator${RESET}"
            ;;
    esac
}

get_latest_release() {
    local api="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
    local tag
    tag=$(curl -fsSL "$api" 2>/dev/null | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
    echo "${tag:-v0.1.0}"
}

download_appimage() {
    local version="$1"
    local url="https://github.com/${GITHUB_REPO}/releases/download/${version}/ZenDownload-${version#v}-x86_64.AppImage"

    echo -e "\n${BOLD}Downloading ZenDownload ${version}...${RESET}"
    echo -e "  ${DIM}${url}${RESET}\n"

    mkdir -p "$INSTALL_DIR"

    if curl -fSL --progress-bar -o "${TMP_DIR}/ZenDownload.AppImage" "$url" 2>&1; then
        echo ""
    else
        echo -e "\n${RED}Download failed.${RESET}"
        echo -e "${YELLOW}You can build from source: https://github.com/${GITHUB_REPO}#build-from-source${RESET}"
        exit 1
    fi

    chmod +x "${TMP_DIR}/ZenDownload.AppImage"
    mv "${TMP_DIR}/ZenDownload.AppImage" "${INSTALL_DIR}/ZenDownload.AppImage"
    echo -e "  ${GREEN}✓${RESET} Downloaded to ${INSTALL_DIR}/ZenDownload.AppImage"
}

create_symlink() {
    mkdir -p "$BIN_DIR"
    local target="${INSTALL_DIR}/ZenDownload.AppImage"

    if [ -L "${BIN_DIR}/zendownload" ]; then
        rm "${BIN_DIR}/zendownload"
    fi
    ln -sf "$target" "${BIN_DIR}/zendownload"
    echo -e "  ${GREEN}✓${RESET} Linked ${BIN_DIR}/zendownload"

    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        echo -e "\n  ${YELLOW}⚠${RESET}  Add ${BIN_DIR} to your PATH:"
        echo -e "      echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc"
        echo -e "      source ~/.bashrc"
    fi
}

install_desktop_entry() {
    mkdir -p "$DESKTOP_DIR" "$ICON_DIR"

    # Download icon
    local icon_url="https://raw.githubusercontent.com/${GITHUB_REPO}/main/src-tauri/icons/128x128.png"
    curl -fsSL "$icon_url" -o "${ICON_DIR}/zendownload.png" 2>/dev/null || true

    cat > "${DESKTOP_DIR}/zendownload.desktop" << 'DESKTOP'
[Desktop Entry]
Name=ZenDownload
GenericName=Download Manager
Comment=Fast, modern, all-in-one download manager
Exec=zendownload %u
Icon=zendownload
Terminal=false
Type=Application
Categories=Network;FileTransfer;Download;
MimeType=application/x-bittorrent;magnet:;application/zip;application/x-rar-compressed;video/mp4;audio/mpeg;
StartupNotify=true
StartupWMClass=zendownload
Keywords=download;manager;torrent;video;audio;media;
Actions=new-download;show-window;

[Desktop Action new-download]
Name=New Download
Exec=zendownload --new

[Desktop Action show-window]
Name=Show Window
Exec=zendownload --show
DESKTOP

    chmod +x "${DESKTOP_DIR}/zendownload.desktop"
    echo -e "  ${GREEN}✓${RESET} Desktop entry installed"
    echo -e "  ${GREEN}✓${RESET} Application icon installed"
}

register_protocol() {
    mkdir -p "$DESKTOP_DIR"

    cat > "${DESKTOP_DIR}/zendownload-handler.desktop" << 'DESKTOP'
[Desktop Entry]
Name=ZenDownload Protocol Handler
Exec=zendownload %u
Type=Application
NoDisplay=true
StartupNotify=false
MimeType=x-scheme-handler/zendown;
DESKTOP

    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || xdg-mime default zendownload-handler.desktop x-scheme-handler/zendown 2>/dev/null || true
    echo -e "  ${GREEN}✓${RESET} Registered zendown:// protocol handler"
}

check_existing() {
    if [ -f "${INSTALL_DIR}/ZenDownload.AppImage" ]; then
        echo -e "\n  ${YELLOW}ZenDownload is already installed.${RESET}"
        echo -e "  ${DIM}Run ${BOLD}zendownload --help${RESET}${DIM} or re-run this script to update.${RESET}\n"
        read -rp "  Continue with reinstall? [y/N] " yn
        case $yn in
            [Yy]*) ;;
            *) exit 0 ;;
        esac
    fi
}

# ── Main ──────────────────────────────────────────────────

header
echo -e "${DIM}  One-line installer for Linux (x86_64)${RESET}\n"

check_existing
check_deps

DISTRO=$(detect_distro)
install_system_deps "$DISTRO"

VERSION=$(get_latest_release)
download_appimage "$VERSION"
create_symlink
install_desktop_entry
register_protocol

echo -e "\n${BOLD}${GREEN}✓ ZenDownload installed successfully!${RESET}\n"
echo -e "  Run it with: ${BOLD}zendownload${RESET}"
echo -e "  Or find it in your application launcher.\n"
echo -e "  ${DIM}Browser extension: https://github.com/${GITHUB_REPO}/tree/main/extension${RESET}"
echo -e "  ${DIM}Documentation:  https://github.com/${GITHUB_REPO}${RESET}\n"
