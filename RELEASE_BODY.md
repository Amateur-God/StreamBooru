## [v1.1.0-beta.1] — 2026-05-22

### Highlights
* **Web browser:** StreamBooru now runs in your browser at `/app/` on the sync server, with a landing page at `/`.
* **Web Discord login:** OAuth works in the browser via `/oauth-callback` (no `streambooru://` deep link required).
* **Beta releases:** Tags like `v1.1.0-beta.1` are published as GitHub pre-releases automatically.

### Added
* **Landing page** at `/` on the sync server with links to the web app, downloads, and health check.
* **Web app** at `/app/` — full StreamBooru UI served from the sync server (renderer copied at build time).
* **Web OAuth callback** at `/oauth-callback` for browser Discord login and account linking.
* **`POST /auth/discord/unlink`** endpoint to remove Discord from a linked account.
* **Tab cache TTLs** — New (2 min), Popular (30 s), Search (3 min) with manual refresh by re-clicking the active tab.
* **Server Coolify/Nixpacks** deployment with Bun runtime and automatic DB migrations on start.
* **Release notes builder** — releases combine `CHANGELOG.md` sections with GitHub-generated commit/PR notes.

### Changed
* **Sync server** migrated to Bun; native `fetch` replaces `node-fetch`; `start:prod` runs migrations then starts.
* **Profile tags (web/Android)** — site tags and rating from Manage Sites are now merged into search/popular queries (matching desktop adapters).
* **Discord login** — logging in with Discord after linking no longer overwrites your local username when a password is set.
* **Release workflow** — pre-release tags skip AUR publish; Flatpak build uses electron-builder; release body built from changelog + auto notes.

### Fixed
* **Local login after Discord link** — username/password login works again after linking Discord to a local account.
* **Tab cache stale results** — cached feeds expire and can be refreshed manually instead of blocking new posts indefinitely.
* **Flatpak CI** — rebuilt around `electron-builder --linux flatpak` with the Electron base app.

### Notes
* Web app URL (when deployed): `https://streambooru.ecchibooru.uk/app/`
* Discord OAuth redirect (unchanged): `{BASE_URL}/auth/discord/callback`
* If your username was already overwritten before this fix, restore it in the database or unlink/re-link Discord after upgrading the server.
---
## Commits & pull requests

## Sample GitHub notes
* fix something (#5)
