#!/usr/bin/env bash
# StreamBooru universal installer for Linux
# - Chooses best format: .deb → .flatpak → .tar.gz
# - Creates launcher and CLI on tar.gz fallback
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Amateur-God/StreamBooru/HEAD/scripts/install.sh | bash
# Options:
#   STREAMBOORU_VERSION=0.3.0   # install a specific version tag (without leading v)
#   STREAMBOORU_REPO=owner/repo # install from a fork

set -euo pipefail

REPO="${STREAMBOORU_REPO:-Amateur-God/StreamBooru}"
APP_NAME="StreamBooru"
APP_ID="io.streambooru.StreamBooru"
BIN_NAME="streambooru"

API="https://api.github.com/repos/${REPO}/releases"
TMP_DIR="$(mktemp -d)"
SUDO="$(command -v sudo || true)"

cleanup() { rm -rf "$TMP_DIR" || true; }
trap cleanup EXIT

msg() { printf "\033[1;34m==>\033[0m %s\n" "$*"; }
err() { printf "\033[1;31mERROR:\033[0m %s\n" "$*" >&2; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { err "Missing required command: $1"; return 1; }
}

os_id_like() {
  # Return ID/ID_LIKE from /etc/os-release
  if [ -r /etc/os-release ]; then
    . /etc/os-release
    echo "${ID_LIKE:-$ID}"
  fi
}

get_release_json() {
  local url
  if [ -n "${STREAMBOORU_VERSION:-}" ]; then
    # tag vX.Y.Z
    url="${API}/tags/v${STREAMBOORU_VERSION}"
  else
    url="${API}/latest"
  fi
  curl -fsSL "$url"
}

pick_asset_url() {
  # Parse JSON to pick asset by pattern (deb/flatpak/tar.gz)
  # Prefer jq if available; otherwise use grep/sed.
  local json="$1" pattern="$2"
  if command -v jq >/dev/null 2>&1; then
    echo "$json" | jq -r --arg pat "$pattern" '.assets[]?.browser_download_url | select(test($pat))' | head -n1
  else
    # naive grep for url lines containing pattern
    echo "$json" | sed -nE "s|.*\"browser_download_url\"\\s*:\\s*\"([^\"]*${pattern}[^\"]*)\".*|\\1|p" | head -n1
  fi
}

install_deps_if_needed() {
  # Attempt to install common Electron runtime deps for tar.gz fallback
  local os_like; os_like="$(os_id_like || true)"
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update
    $SUDO apt-get install -y libgtk-3-0 libnss3 libasound2 libxss1 libxtst6 ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y gtk3 nss alsa-lib libXScrnSaver libXtst ca-certificates
  elif command -v pacman >/dev/null 2>&1; then
    $SUDO pacman -Sy --needed --noconfirm gtk3 nss alsa-lib libxss libxtst ca-certificates
  elif command -v zypper >/dev/null 2>&1; then
    $SUDO zypper install -y gtk3-data mozilla-nss libasound2 libXss1 libXtst6 ca-certificates
  else
    msg "Skipping dependency install (unknown package manager). If the app fails to start, install GTK3, NSS, ALSA, libXss, libXtst."
  fi
}

install_deb() {
  local url="$1"
  local file="$TMP_DIR/${APP_NAME}.deb"
  msg "Downloading .deb: $url"
  curl -fL "$url" -o "$file"
  if command -v apt >/dev/null 2>&1; then
    $SUDO apt install -y "$file" || { $SUDO apt -f install -y && $SUDO apt install -y "$file"; }
  else
    need_cmd dpkg
    $SUDO dpkg -i "$file" || $SUDO apt-get -f install -y
  fi
  msg "Installed .deb package."
}

install_flatpak_bundle() {
  local url="$1"
  local file="$TMP_DIR/${APP_NAME}.flatpak"
  need_cmd flatpak
  msg "Downloading .flatpak: $url"
  curl -fL "$url" -o "$file"
  flatpak install --user -y "$file"
  msg "Installed Flatpak bundle. Run: flatpak run ${APP_ID}"
}

install_tarball() {
  local url="$1"
  local file="$TMP_DIR/${APP_NAME}.tar.gz"
  local dest="/opt/${BIN_NAME}"
  local exe_path=""
  msg "Downloading tar.gz: $url"
  curl -fL "$url" -o "$file"

  install_deps_if_needed

  msg "Extracting to $TMP_DIR/unpacked"
  mkdir -p "$TMP_DIR/unpacked"
  tar xf "$file" -C "$TMP_DIR/unpacked"

  # Try to find an executable in unpacked dir
  if [ -x "$TMP_DIR/unpacked/${BIN_NAME}" ]; then
    exe_path="$TMP_DIR/unpacked/${BIN_NAME}"
  else
    exe_path="$(find "$TMP_DIR/unpacked" -maxdepth 2 -type f -perm -111 -printf "%p\n" | grep -E "/(${BIN_NAME}|StreamBooru)$" | head -n1 || true)"
  fi
  if [ -z "$exe_path" ]; then
    # fallback — accept first executable in the root
    exe_path="$(find "$TMP_DIR/unpacked" -maxdepth 2 -type f -perm -111 | head -n1 || true)"
  fi
  if [ -z "$exe_path" ]; then
    err "Could not locate the app executable in the tarball."
    exit 1
  fi

  msg "Installing to $dest"
  $SUDO rm -rf "$dest"
  $SUDO mkdir -p "$dest"
  # copy all to /opt/streambooru
  $SUDO cp -r "$TMP_DIR/unpacked/"* "$dest/"

  # Create CLI wrapper
  cat <<EOF | $SUDO tee "/usr/local/bin/${BIN_NAME}" >/dev/null
#!/usr/bin/env bash
exec "${dest}/$(basename "$exe_path")" "\$@"
EOF
  $SUDO chmod 755 "/usr/local/bin/${BIN_NAME}"

  # Desktop file
  cat <<EOF | $SUDO tee "/usr/share/applications/${BIN_NAME}.desktop" >/dev/null
[Desktop Entry]
Type=Application
Version=1.0
Name=${APP_NAME}
Comment=Multi-site booru browser
Exec=${BIN_NAME} %U
Icon=${BIN_NAME}
Terminal=false
Categories=Network;Utility;
EOF

  # Try icon if present
  if [ -f "$dest/resources/app/build/icon.png" ]; then
    $SUDO install -Dm644 "$dest/resources/app/build/icon.png" "/usr/share/pixmaps/${BIN_NAME}.png"
  elif [ -f "$dest/icon.png" ]; then
    $SUDO install -Dm644 "$dest/icon.png" "/usr/share/pixmaps/${BIN_NAME}.png"
  fi

  msg "Installed tarball. Launch with: ${BIN_NAME}"
}

main() {
  msg "Installing ${APP_NAME} from ${REPO}"

  # Fetch release metadata
  local json; json="$(get_release_json)" || { err "Failed to fetch release metadata"; exit 1; }

  # Asset candidates
  local deb_url flatpak_url tar_url
  deb_url="$(pick_asset_url "$json" "\\.deb$" || true)"
  flatpak_url="$(pick_asset_url "$json" "\\.flatpak$" || true)"
  tar_url="$(pick_asset_url "$json" "\\.tar\\.gz$" || true)"

  # Prefer .deb when dpkg/apt present
  if command -v dpkg >/dev/null 2>&1 && [ -n "$deb_url" ]; then
    install_deb "$deb_url"
    exit 0
  fi

  # Otherwise try Flatpak bundle
  if command -v flatpak >/dev/null 2>&1 && [ -n "$flatpak_url" ]; then
    install_flatpak_bundle "$flatpak_url"
    exit 0
  fi

  # Fallback: tar.gz
  if [ -n "$tar_url" ]; then
    install_tarball "$tar_url"
    exit 0
  fi

  err "No suitable Linux assets found in the latest release."
  echo "Found assets:"
  echo "$json" | { command -v jq >/dev/null 2>&1 && jq -r '.assets[]?.browser_download_url' || sed -nE 's|.*"browser_download_url"\\s*:\\s*"([^"]+)".*|\\1|p'; }
  exit 1
}

main "$@"
