#!/usr/bin/env bash
set -euo pipefail

REPO="${ATLAS_ANALYTICS_REPO:-}"
TOKEN="${ATLAS_ANALYTICS_GITHUB_TOKEN:-}"

if [ -z "$REPO" ]; then
  echo "ATLAS_ANALYTICS_REPO not set; building without private analytics bundle."
  exit 0
fi

clone_url="$REPO"

# Separate build secret: ATLAS_ANALYTICS_GITHUB_TOKEN + plain repo URL
if [ -n "$TOKEN" ] && [[ "$REPO" != *"@github.com/"* ]] && [[ "$REPO" == https://github.com/* ]]; then
  clone_url="https://x-access-token:${TOKEN}@github.com/${REPO#https://github.com/}"
fi

# Strip accidental whitespace/newlines from Coolify paste
clone_url="$(printf '%s' "$clone_url" | tr -d '\r\n')"

rm -rf private/atlas-analytics
if GIT_TERMINAL_PROMPT=0 git clone --depth 1 "$clone_url" private/atlas-analytics; then
  echo "Cloned AtlasAnalytics bundle into private/atlas-analytics"
  exit 0
fi

echo ""
echo "WARNING: Could not clone private AtlasAnalytics repo — deploying WITHOUT analytics bundle."
echo "Check Coolify BUILD secrets (not runtime env):"
echo "  ATLAS_ANALYTICS_REPO=https://github.com/Atlas-Tech-Solutions/atlas-analytics.git"
echo "  ATLAS_ANALYTICS_GITHUB_TOKEN=<PAT with read access to that repo>"
echo "Or one combined build secret:"
echo "  ATLAS_ANALYTICS_REPO=https://x-access-token:TOKEN@github.com/Atlas-Tech-Solutions/atlas-analytics.git"
echo "Ensure both are marked Available at Buildtime / Build Secrets."
exit 0
