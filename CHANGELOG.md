# Changelog

All notable changes to this project will be documented in this file.
The format roughly follows Keep a Changelog, and dates are in YYYY-MM-DD.

## [v0.2.1] — 2025-10-18

### Highlights
- Reliable searches and infinite scroll with a clear “End of results” message.
- “New” tab now fairly interleaves results from all sites (round‑robin) and appends new items without jumping your view.
- “Popular” remains globally sorted, with scroll-position preservation when a re‑order is required.
- Danbooru: filter takedowns and gold‑only/restricted posts (when not viewable with your account).
- Video groundwork in the lightbox (CSP and sizing); proxy fallback for media that requires headers.
- Remote “Favorite” (site API) button appears when credentials are configured.

### Added
- Lightbox video handling
  - Render videos as a video element with controls, muted autoplay, loop, and playsInline.
  - Fallback: if the CDN blocks direct loads, try an in‑app proxy that preserves Referer.
  - If the environment can’t decode the video (e.g., missing H.264/AAC), a tip suggests using “Open Media.”
- Content-Security-Policy
  - index.html now allows media (`media-src`) so videos can load in the app.
- Remote “Favorite” via site APIs
  - When a site in Manage Sites has valid credentials, cards and lightbox show a “♥ Favorite” button:
    - Danbooru: login + API key
    - Moebooru: login + password_hash
  - Uses the site’s favorite endpoints to add/remove favorites; initial state uses site flags when available (e.g., Danbooru’s `is_favorited`).

### Changed
- Thumbnails in the grid (cards)
  - Prefer `sample_url` (or full `file_url`) for images so Danbooru thumbs are sharp.
  - For video posts, fall back to preview (Danbooru only provides a small static preview for videos).
- New tab behavior
  - Switch to a true round‑robin interleave across all configured sites, append‑only per fetch.
  - Newer items discovered later won’t jump to the top (prevents viewport shifts).
- Popular tab behavior
  - Still globally sorted by popularity/recency. If new items strictly belong at the end, we append; otherwise we re‑render while preserving scroll to avoid “teleporting.”
- Search tab behavior
  - Continues using round‑robin interleaving across sites (fair mixing of results).
- Card actions layout
  - Actions row now uses a two‑column grid so 3–4 buttons (Open Post, Open Media, Favorite, Save) fit without clipping on narrow cards.

### Fixed
- New search at end‑of‑pagination yielded no images
  - Implemented robust fetch coordination with a generation token and a queued‑fetch flag; drops stale responses after resets.
- Endless “Loading…” when results are exhausted
  - Added `noMoreResults` guard; displays “End of results” and stops auto‑fetching when a batch adds zero new posts.
- Scroll jumps when loading a new batch
  - Append‑only rendering when possible; when a global sort is needed, re‑render while preserving scroll from the nearest visible anchor.
- Remote favorite POST errors
  - Removed manual `Content-Length` in POST form requests; let Chromium set it to avoid `net::ERR_INVALID_ARGUMENT`.
- Danbooru: hide posts that shouldn’t be shown
  - Filter out takedowns (`is_banned`, `is_deleted`).
  - Filter out gold‑only or otherwise restricted posts for non‑gold accounts (no `file_url` and no `large_file_url` and no `media_asset.variants` with `sample` or `original`). If you log in with a gold account, these posts will appear as media URLs become available.

### Known Issues
- Lightbox video playback on some Linux builds
  - Electron builds often lack proprietary codecs (H.264/AAC), so many MP4s show 0:00 and won’t play. Workarounds:
    - Replace Electron’s `libffmpeg.so` with your distro’s “chromium‑codecs‑ffmpeg‑extra” (or equivalent with proprietary codecs).
    - Use “Open Media” to view in your default browser.
  - WebM typically works. The lightbox shows a small tip when codecs are unsupported.
- Softer thumbnails for video posts
  - Danbooru only provides small static previews for videos; grid thumbs for video entries may look blurry. Image posts remain sharp via `sample_url`.
- Remote favorites
  - Favorite button only appears when credentials are present for a site. We show an alert on auth or rate‑limit errors; state is not auto‑refreshed from the server after out‑of‑band changes.
- End‑of‑results detection is conservative
  - We mark end‑of‑results when a fetch adds zero new items across all sites. Some sites might still return data in later attempts.
- Intentional behavior: “New” does not reorder
  - Newer posts fetched later are appended at the end by design so your current view doesn’t shift. Use “Popular” if you want a globally resorted feed.

### Developer Notes
- State coordination
  - Added `fetchGen` to drop stale responses across resets, `pendingFetch` to queue a fetch while one is in flight, and `noMoreResults` to halt further loads at the end.
  - New tab keeps a `feedSeen` set and a rolling `rrCursor` for fair round‑robin across sites per fetch.
  - Search tab keeps `searchBuckets` and `searchSeen` to fairly interleave de‑duplicated results.
- Network
  - Image/media requests continue to set site‑specific Referer headers; proxy endpoint returns data URLs for render safety when direct loads fail.
- UI
  - Popular re‑sort path preserves scroll via nearest visible anchor element; append‑only path avoids any scroll changes.

[v0.2.1]: https://github.com/Amateur-God/StreamBooru/releases/tag/v0.2.1
