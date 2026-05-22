#!/usr/bin/env bash
# Generate aur-out/PKGBUILD and .SRCINFO for a GitHub release tag.
# Usage: publish-aur.sh <version> <owner> <repo> <pkgname> <conflicts> [pkgdesc_suffix]
# Example conflicts arg: 'streambooru' 'streambooru-bin-beta'
set -euo pipefail

VERSION="${1:?version (e.g. 1.0.2 or 1.1.0-beta.1)}"
OWNER="${2:?owner}"
REPO="${3:?repo}"
PKGNAME="${4:?pkgname}"
CONFLICTS="${5:?conflicts — quoted PKGBUILD entries, e.g. 'streambooru' 'streambooru-bin-beta'}"
PKGDESC_SUFFIX="${6:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# AUR pkgver cannot contain hyphens (1.1.0-beta.1 -> 1.1.0.beta.1)
PKGVER="${VERSION//-/.}"

mkdir -p aur-out
sed -e "s|@@PKGNAME@@|${PKGNAME}|g" \
    -e "s|@@VERSION@@|${VERSION}|g" \
    -e "s|@@PKGVER@@|${PKGVER}|g" \
    -e "s|@@OWNER@@|${OWNER}|g" \
    -e "s|@@REPO@@|${REPO}|g" \
    -e "s|@@CONFLICTS@@|${CONFLICTS}|g" \
    -e "s|@@PKGDESC_SUFFIX@@|${PKGDESC_SUFFIX}|g" \
    aur/PKGBUILD.in > aur-out/PKGBUILD

ASSET_URL="https://github.com/${OWNER}/${REPO}/releases/download/v${VERSION}/streambooru-${VERSION}.tar.gz"
curl -fsSL "$ASSET_URL" -o "aur-out/streambooru-${VERSION}.tar.gz"
SHA=$(sha256sum "aur-out/streambooru-${VERSION}.tar.gz" | awk '{print $1}')
sed -i "s|@@SHA256@@|${SHA}|g" aur-out/PKGBUILD

docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$PWD/aur-out":/pkg \
  -w /pkg \
  archlinux:base-devel \
  bash -lc 'makepkg --printsrcinfo > .SRCINFO'

echo "Generated AUR package ${PKGNAME} ${VERSION} (pkgver=${PKGVER})"
