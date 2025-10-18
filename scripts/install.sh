#!/usr/bin/env bash
set -euo pipefail

REPO="Amateur-God/StreamBooru"
PREFIX="/usr/local"
DEST_DIR="/opt/streambooru"
WRAPPER="${PREFIX}/bin/streambooru"

VERSION="${1:-}"
if [[ -z "${VERSION}" ]]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | sed -n 's/.*"tag_name": *"\(v[^"]*\)".*/\1/p')"
  [[ -n "${VERSION}" ]] || { echo "Could not determine latest release tag"; exit 1; }
fi
VER="${VERSION#v}"

echo "==> Installing StreamBooru ${VERSION} from ${REPO}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ASSET="streambooru-${VER}.tar.gz"
URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"

echo "==> Downloading: ${URL}"
curl -fL "${URL}" -o "${TMP}/app.tar.gz"

# Ensure runtime libs on Arch (best-effort)
if command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --needed --noconfirm alsa-lib nss gtk3 libxss libxtst || true
fi

echo "==> Unpacking tarball"
UNPACK="${TMP}/unpack"
mkdir -p "${UNPACK}"
tar -xzf "${TMP}/app.tar.gz" -C "${UNPACK}"

# Find the app directory (where Electron binary lives)
APP_SRC=""
for cand in \
  "$(find "${UNPACK}" -maxdepth 2 -type f -name streambooru -printf '%h\n' 2>/dev/null | head -n1)" \
  "$(find "${UNPACK}" -maxdepth 2 -type f -name StreamBooru -printf '%h\n' 2>/dev/null | head -n1)"; do
  if [ -n "${cand}" ] && [ -d "${cand}" ]; then
    APP_SRC="${cand}"
    break
  fi
done

# Fallbacks
if [ -z "${APP_SRC}" ]; then
  mapfile -t TOPS < <(find "${UNPACK}" -mindepth 1 -maxdepth 1 -type d)
  if [ "${#TOPS[@]}" -eq 1 ]; then
    APP_SRC="${TOPS[0]}"
  else
    APP_SRC="${UNPACK}"
  fi
fi

echo "==> Installing to ${DEST_DIR}"
sudo rm -rf "${DEST_DIR}"
sudo mkdir -p "${DEST_DIR}"
sudo rsync -a "${APP_SRC}/" "${DEST_DIR}/"

# Fix chrome-sandbox perms if present
if [[ -f "${DEST_DIR}/chrome-sandbox" ]]; then
  sudo chmod 4755 "${DEST_DIR}/chrome-sandbox" || true
fi

echo "==> Installing wrapper ${WRAPPER}"
sudo tee "${WRAPPER}" >/dev/null <<'EOF'
#!/bin/sh
set -e
APPDIR="/opt/streambooru"

# Try root and one-level subdirs; support both binary names
for dir in "$APPDIR" "$APPDIR"/*; do
  for name in streambooru StreamBooru; do
    if [ -x "$dir/$name" ]; then
      export ELECTRON_OZONE_PLATFORM_HINT="${ELECTRON_OZONE_PLATFORM_HINT:-auto}"
      exec "$dir/$name" ${STREAMBOORU_FLAGS:-} "$@"
    fi
  done
done

echo "StreamBooru binary not found under $APPDIR" >&2
exit 1
EOF
sudo chmod 755 "${WRAPPER}"

echo "==> Installed. Launch with: streambooru"
