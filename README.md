# StreamBooru

StreamBooru is a fast desktop viewer for multiple booru engines (Danbooru, Moebooru/Yande.re/Konachan, Gelbooru family, e621/e926, Derpibooru). It merges and navigates posts across sites, supports round‑robin cross‑site search, has a lightbox with keyboard navigation, a bulk “Download All”, filename templates, and local favorites. Zerochan support has been removed.

## Highlights

- Engines
  - Danbooru
  - Moebooru family: Yande.re / Konachan(.com/.net) / Hypnohub / TBIB
  - Gelbooru family: Gelbooru.com, Safebooru.org, Rule34 (rule34.xxx), Realbooru, Xbooru
  - e621/e926
  - Derpibooru
- Views
  - New: globally merged by recency (ties: favorites, score) with per‑site round‑robin append
  - Popular: globally merged using a normalized popularity model (per‑site P95)
  - Search: round‑robin interleaving by your site order (1,2,3,1,2,3…)
  - Favorites: local favorites view with search filter
- Bulk download
  - “Download All” saves everything currently loaded in the active view (New/Popular/Search/Favorites)
  - Right‑click or Shift‑click “Download All” for options (filename templates)
  - Single folder chooser, optional per‑site subfolders, concurrency‑limited downloads
  - Correct Referer headers for common image CDNs (Danbooru, Moebooru, e621/e926, Derpibooru)
- Naming templates
  - Presets: `site-id`, `site-score-artist-copyright-character-id`, `site-id-original`, `site-id-rating`, `site-id-widthxheight`
  - Custom templates with tokens:
    - Basics: `{site} {site_type} {id} {score} {favorites} {rating} {width} {height} {index} {ext} {original_name}`
    - Date: `{created} {created_yyyy} {created_mm} {created_dd} {created_hhmm}`
    - Tags (best‑effort): `{artist} {copyright} {character}`
- Lightbox viewer
  - Next/Prev, Open Post/Media, Download, Favorite (local), keyboard: Esc / ← / →
- Fixed topbar (tabs + search + manage)
- Site Manager
  - Presets for common sites
  - Per‑site rating and default tags (rating:* is managed by the dropdown)
  - Auth support: Danbooru (login + API key), Moebooru (login + password_hash), Gelbooru (user_id + api_key), e621 (optional)
  - Test shows API reachability, Auth status (with account/name/level if available), and Danbooru rate limit
  - Quick links: “Open Account Page” and “API Help”
- Smart CDN handling
  - Automatic Referer headers for cdn.donmai.us, files.yande.re, konachan.com/.net, static1.e621.net/e926.net, derpicdn.net, etc.

---

> [!NOTE]
> **Enjoying this integration?**
>
> This is an open-source project I maintain in my spare time. If you'd like to show your appreciation and support its development, you can buy me a coffee!
>
> [![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/amateurgod)

## Install

Pick one method.

### 1) One‑liner (any Linux)

Downloads the latest release and installs the best format for your distro (deb → Flatpak → tar.gz fallback), adds a launcher and `streambooru` CLI.

```bash
curl -fsSL https://raw.githubusercontent.com/Amateur-God/StreamBooru/HEAD/scripts/install.sh | bash
```

Options:
- Install a specific version:
  ```bash
  STREAMBOORU_VERSION=0.3.0 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Amateur-God/StreamBooru/HEAD/scripts/install.sh)"
  ```
- Use a different repo fork:
  ```bash
  STREAMBOORU_REPO="yourname/yourfork" bash -c "$(curl -fsSL https://raw.githubusercontent.com/Amateur-God/StreamBooru/HEAD/scripts/install.sh)"
  ```

### 2) Debian/Ubuntu (.deb)

1) Download the `.deb` from Releases.
2) Install:
```bash
sudo apt install ./StreamBooru-*.deb
```

### 3) Windows (.exe)

1) Download the `StreamBooru-Setup-<version>.exe` from Releases
2) Run the installer (One‑Click) and launch from Start Menu.

### 4) Flatpak (.flatpak)

If you don’t have Flatpak:
```bash
sudo apt install flatpak   # Debian/Ubuntu
sudo flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
```

Install the bundle:
```bash
flatpak install --user ./StreamBooru.flatpak
flatpak run io.streambooru.StreamBooru
```

### 5) Arch Linux (AUR)

If the AUR package is published for your version:
```bash
yay -S streambooru-bin
```

Manual:
```bash
git clone https://aur.archlinux.org/streambooru-bin.git
cd streambooru-bin
makepkg -si
```

### 6) Generic tar.gz

1) Download `StreamBooru-*-linux-x64.tar.gz` from Releases
2) Extract and run:
```bash
tar xf StreamBooru-*-linux-x64.tar.gz
cd StreamBooru-*-linux-x64
./streambooru
```

If you run Wayland only and see issues:
```bash
./streambooru --ozone-platform-hint=x11
```

---

## Usage

- Manage Sites → add/edit sites, set ratings/tags, and add credentials:
  - Danbooru: login + API key (Profile → API)
  - Yande.re/Konachan: login + password_hash (shown on your account page)
  - Gelbooru.com: user_id + api_key required for API; Safebooru.org works without auth
  - e621/e926: auth optional for browsing
- Tabs:
  - New / Popular render merged feeds
  - Search: enter tags (space‑separated), hit Search; results interleave by site order
  - Favorites: shows local saved posts; the search box filters favorites
- Download All:
  - Left‑click to download everything currently loaded in the active view
  - Shift‑click or Right‑click for options (naming template)
  - Files are saved to a single folder; optionally sub‑foldered by site
- Lightbox:
  - Click image to open
  - ←/→ to navigate; Esc to close
  - Buttons: View Post, Open Media, Download, ♥ Save (local)

---

## Notes per engine

- Danbooru
  - Card thumbnails prefer the larger sample image to avoid blur; videos still show small static previews (site limitation).
  - Test shows API status, Auth, and rate‑limit (remaining/limit and reset time).
- Gelbooru family
  - gelbooru.com typically requires `user_id` + `api_key` for JSON/XML API access. Many clones (e.g., Safebooru.org) work without auth.
- Derpibooru
  - Defaults to `q=score.gte:0` when the query is empty. Optional `filter_id` is supported if you want to bypass your default site filter.
- e621/e926
  - Browsing works without auth; account features (favorites, etc.) are not implemented in this app.

---

## Troubleshooting

- Danbooru images look blurry in cards
  - Fixed: cards now prefer `sample_url` (the larger preview, e.g., large_file_url on Danbooru) before `file_url`, with `preview_url` as a last resort. Videos still use small static previews.
- Gelbooru returns 401 or “No results”
  - Add `user_id` and `api_key` in Manage Sites (Gelbooru.com), or use https://safebooru.org
- Search shows only some sites
  - We use engine‑native search. For Moebooru/Gelbooru variants, the app retries with ranking tags (e.g., `order:score`) if plain tags return 0.
- “rating:safe” appears in tags
  - The UI strips any `rating:*` tokens from the tags field; set rating via the dropdown instead.

---

## Build from source

Requirements: Node.js 20+, npm

```bash
npm ci
# run in development (adjust to your scripts)
npm run start
# build packages (uses electron-builder.yml)
npx electron-builder --linux deb tar.gz
npx electron-builder --win nsis
```

---

## Uninstall

- Debian:
  ```bash
  sudo apt remove streambooru
  ```
- Flatpak:
  ```bash
  flatpak uninstall io.streambooru.StreamBooru
  ```
- Generic/manual:
  - Remove `/opt/streambooru` and `/usr/local/bin/streambooru`
  - Remove `/usr/share/applications/streambooru.desktop`

---

## License

GPLv3 — see [LICENSE](LICENSE).
