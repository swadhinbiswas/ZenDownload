#!/usr/bin/env bash
# Generate all icon variants from icon.svg
# Requires: rsvg-convert, ImageMagick (magick/convert)
set -e

cd "$(dirname "$0")/../src-tauri/icons"

echo "==> Generating PNG sizes from icon.svg"
for size in 16 32 48 64 128 256 512 1024; do
  rsvg-convert -w $size -h $size icon.svg -o "${size}x${size}.png"
done

# Tauri-specific names
cp 256x256.png 128x128@2x.png
cp 256x256.png icon.png
cp 512x512.png icon-512.png
cp 1024x1024.png icon-1024.png

# Windows Store logo variants
for size in 30 44 71 89 107 142 150 284 310; do
  rsvg-convert -w $size -h $size icon.svg -o "Square${size}x${size}Logo.png"
done
rsvg-convert -w 50 -h 50 icon.svg -o StoreLogo.png

# iOS variants
for size in 20 29 40 58 60 76 80 87 120 152 167 180 1024; do
  rsvg-convert -w $size -h $size icon.svg -o "ios/${size}x${size}.png" 2>/dev/null || true
done

# Linux hicolor
mkdir -p linux
for size in 16 32 48 64 72 96 128 256; do
  rsvg-convert -w $size -h $size icon.svg -o "linux/${size}x${size}.png"
done

echo "==> Generating Windows .ico"
magick 16x16.png 32x32.png 48x48.png 64x64.png 128x128.png 256x256.png icon.ico

echo "==> Generating macOS .icns"
python3 "$(dirname "$0")/build_icns.py" . icon.icns

echo "==> Done"
ls -la icon.ico icon.icns icon.png
