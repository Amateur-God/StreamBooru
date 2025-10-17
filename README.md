# StreamBooru

StreamBooru is a fast desktop viewer for multiple “booru” engines (Danbooru, Moebooru/Yande.re/Konachan, Gelbooru, Zerochan). It merges and navigates posts across sites, supports round‑robin cross‑site search, has a lightbox with keyboard navigation, and lets you save favorites locally or via site APIs.

## Highlights

- Multi‑site: Danbooru, Yande.re/Konachan (Moebooru), Gelbooru, Zerochan
- Views:
  - New: globally merged by recency (ties: favorites, score)
  - Popular: globally merged using a normalized popularity model (per‑site P95)
  - Search: round‑robin interleaving by your site order (1,2,3,1,2,3…)
  - Favorites: local favorites view with search filter
- Lightbox viewer: Next/Prev, Open Post/Image, Download, Favorite (local/remote), keyboard: Esc/←/→
- Fixed topbar (tabs + search + manage)
- Smart CDN handling for Danbooru (Referer headers + proxy fallback)
- Site Manager:
  - Per‑site rating and default tags (rating:* is managed by the dropdown)
  - Auth support: Danbooru (login + API key), Moebooru (login + password_hash)
  - Test shows API reachability, Auth status (with account name/level/id), and Danbooru rate limit

---

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

- Launch the app
- Manage Sites → add/edit sites, set ratings/tags, and add credentials:
  - Danbooru: login + API key (Profile → API)
  - Yande.re/Konachan: login + password_hash (shown on your account page)
- Tabs:
  - New / Popular render merged feeds
  - Search: enter tags (space‑separated), hit Search; results interleave by site order
  - Favorites: shows local saved posts; the search box filters favorites
- Lightbox:
  - Click image to open
  - ←/→ to navigate; Esc to close
  - Buttons: View Post, Open Image, Download, ♥ Save (local) / Favorite (remote)
- Right top: Manage Sites (sticky while scrolling)

---

## Troubleshooting

- Danbooru images are blank or 403:
  - The app injects proper Referer headers and falls back to a proxy fetch if blocked.
- Search shows only Danbooru:
  - We use engine‑native search; some sites may return 0 for plain tags. We auto‑retry with ranking tags (e.g., `order:score`) for Moebooru/Gelbooru.
- Manage Sites “rating:safe” appears in tags:
  - The UI strips any `rating:*` tokens from the tags field; set rating only via dropdown.
- Authentication:
  - Manage Sites → Test shows API, Auth (with account name/level/id), and Danbooru rate‑limit status.

---

## Build from source

Requirements: Node.js 20+, npm

```bash
npm ci
# run in development (adjust to your start script)
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
