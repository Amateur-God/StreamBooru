#!/usr/bin/env bash
set -euo pipefail

echo "==> Uninstalling StreamBooru (manual install)"

APP_DIR="/opt/streambooru"
WRAPPER="/usr/local/bin/streambooru"

# Remove app payload
if [[ -d "$APP_DIR" ]]; then
  echo " - Removing $APP_DIR"
  sudo rm -rf "$APP_DIR"
else
  echo " - $APP_DIR not found (already removed)"
fi

# Remove wrapper
if [[ -e "$WRAPPER" ]]; then
  echo " - Removing $WRAPPER"
  sudo rm -f "$WRAPPER"
else
  echo " - $WRAPPER not found (already removed)"
fi

# Optional: remove an unowned /usr/bin/streambooru (only if not owned by a package)
if [[ -e "/usr/bin/streambooru" ]]; then
  if ! pacman -Qo /usr/bin/streambooru >/dev/null 2>&1; then
    echo " - Removing unowned /usr/bin/streambooru"
    sudo rm -f /usr/bin/streambooru
  else
    echo " - /usr/bin/streambooru is owned by a package; leaving it"
  fi
fi

# Optional: offer to remove user data
read -r -p "Remove user config/cache (will delete app settings)? [y/N] " yn
case "$yn" in
  [Yy]* )
    for p in \
      "$HOME/.config/StreamBooru" "$HOME/.cache/StreamBooru" "$HOME/.local/share/StreamBooru" \
      "$HOME/.config/streambooru" "$HOME/.cache/streambooru" "$HOME/.local/share/streambooru"
    do
      if [[ -e "$p" ]]; then
        echo " - Removing $p"
        rm -rf "$p"
      fi
    done
    ;;
  * )
    echo " - Keeping user data"
    ;;
esac

echo "==> Uninstall complete"
