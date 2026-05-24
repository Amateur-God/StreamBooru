# AUR packages

StreamBooru publishes two AUR packages from GitHub releases:

| Package | Tracks | Updated when |
|---------|--------|--------------|
| `streambooru-bin` | Latest **stable** release | Tag pushed without pre-release suffix (e.g. `v1.0.2`) |
| `streambooru-bin-beta` | Latest **pre-release** | Tag with suffix (e.g. `v1.1.0-beta.1`) |

Both packages conflict with each other and provide `streambooru`. Install only one at a time.

## One-time AUR setup

1. Create two empty package repos on AUR (if not already present):
   - https://aur.archlinux.org/pkgbase/streambooru-bin
   - https://aur.archlinux.org/pkgbase/streambooru-bin-beta

2. Add GitHub repository secrets:

| Secret | Example | Used for |
|--------|---------|----------|
| `AUR_USERNAME` | your AUR user | both |
| `AUR_SSH_PRIVATE_KEY` | SSH private key | both |
| `AUR_PACKAGE` | `streambooru-bin` | stable releases |
| `AUR_PACKAGE_BETA` | `streambooru-bin-beta` | pre-releases |

The same SSH key can push to both packages if your AUR account owns them.

## Manual publish

```bash
# Stable
./scripts/publish-aur.sh 1.0.2 Atlas-Commons StreamBooru streambooru-bin "'streambooru' 'streambooru-bin-beta'"

# Beta
./scripts/publish-aur.sh 1.1.0-beta.1 Atlas-Commons StreamBooru streambooru-bin-beta "'streambooru' 'streambooru-bin'" " (pre-release)"
```

Or use **Actions → Publish AUR (manual)** and pick stable or beta.

## Install

```bash
# Stable
yay -S streambooru-bin

# Latest beta / pre-release
yay -S streambooru-bin-beta
```
