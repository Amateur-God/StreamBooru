# StreamBooru v1.1.0-beta.1 — Beta Release

We're opening up the first public beta of **StreamBooru 1.1** — focused on the web experience, sync server improvements, and fixes from your feedback since v1.0.2.

> **This is a pre-release.** Expect rough edges. Please report issues on GitHub.

---

## Try it in your browser

No install required — browse directly on the sync server:

**https://streambooru.ecchibooru.uk/app/**

- Landing page: https://streambooru.ecchibooru.uk/
- Log in with a local account or Discord to sync favourites and site settings
- Same UI as desktop/Android, running in the browser

---

## What's new

### Web app & sync server
- Landing page at `/` and full StreamBooru browser at `/app/`
- Discord OAuth works in the browser (no deep link needed)
- Sync server runs on **Bun** with Coolify/Nixpacks deployment support
- Automatic DB migrations on server start

### Auth fixes
- **Local login after Discord link** — linking Discord no longer breaks username/password login
- **Unlink Discord** button now backed by a real server endpoint

### App improvements
- **Profile tags** from Manage Sites apply correctly on web/Android searches
- **Tab cache** — feeds expire (New 2 min / Popular 30 s / Search 3 min) and refresh when you re-click the active tab
- **Flatpak CI** rebuilt for more reliable Linux builds

---

## Downloads

Grab builds from the [v1.1.0-beta.1 release](https://github.com/Atlas-Commons/StreamBooru/releases/tag/v1.1.0-beta.1):

| Platform | Artifact |
|----------|----------|
| Linux | `.deb`, `.tar.gz`, Flatpak |
| Windows | `.exe` installer |
| Android | `streambooru.apk` |

---

## Upgrade notes

**Server:** Redeploy the sync server (`server/` base directory on Coolify). Discord redirect URI is unchanged: `{BASE_URL}/auth/discord/callback`.

**Accounts:** If your local username was overwritten by an older Discord login bug, restore it in the DB or use **Unlink Discord** → re-link after upgrading.

---

## How to tag this release

```bash
git tag -a v1.1.0-beta.1 -m "StreamBooru v1.1.0-beta.1"
git push origin v1.1.0-beta.1
```

The release workflow will automatically:
- Build Linux, Windows, Flatpak, and Android artifacts
- Mark the release as **pre-release**
- Fill release notes from `CHANGELOG.md` + GitHub commit/PR summary

---

Feedback welcome — open an issue or comment on the release. Thanks for testing!
