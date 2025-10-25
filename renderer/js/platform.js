/* StreamBooru platform adapter for Electron (desktop) and Capacitor (Android)
   - Supplies window.api on Android/Web
*/
(function () {
  // env
  const isElectron = () => navigator.userAgent.includes('Electron');
  const C = typeof window !== 'undefined' ? window.Capacitor : undefined;
  const isAndroid = () => !!C && typeof C.getPlatform === 'function' && C.getPlatform() === 'android';

  // native HTTP
  const UA = 'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Mobile Safari/537.36';
  function getHttp() { return C?.Plugins?.CapacitorHttp || C?.Plugins?.Http || null; }
  function originFrom(url) { try { return new URL(url).origin; } catch { return ''; } }
  const b64 = (s) => { try { return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'utf8').toString('base64'); } catch { return s; } };

  // Tiny event bus used by renderer
  const Events = (() => {
    const map = new Map();
    const on = (ev, fn) => { if (!map.has(ev)) map.set(ev, new Set()); map.get(ev).add(fn); };
    const off = (ev, fn) => { map.get(ev)?.delete(fn); };
    const emit = (ev, payload) => { (map.get(ev) || new Set()).forEach((fn)=>{ try { fn(payload); } catch {} }); };
    return {
      on, off, emit,
      onFavoritesChanged: (fn) => on('favorites_changed', fn),
      offFavoritesChanged: (fn) => off('favorites_changed', fn),
      onConfigChanged: (fn) => on('config_changed', fn),
      offConfigChanged: (fn) => off('config_changed', fn)
    };
  })();
  window.events = window.events || Events;

  // Global image preconnects for speed
  (function injectPreconnects() {
    const hosts = [
      'https://cdn.donmai.us', 'https://danbooru.donmai.us',
      'https://files.yande.re', 'https://konachan.com', 'https://konachan.net',
      'https://gelbooru.com', 'https://safebooru.org',
      'https://derpicdn.net', 'https://derpibooru.org',
      'https://e621.net'
    ];
    for (const href of hosts) {
      if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
      const l = document.createElement('link');
      l.rel = 'preconnect'; l.href = href; l.crossOrigin = '';
      document.head.appendChild(l);
    }
  })();

  // HTTP helpers
  async function httpGetJSON(url, headers = {}) {
    const Http = getHttp();
    if (isAndroid() && Http?.get) {
      const res = await Http.get({
        url,
        headers: { Accept: 'application/json', 'User-Agent': UA, Referer: originFrom(url), ...headers },
        readTimeout: 15000,
        connectTimeout: 15000
      });
      const status = res.status ?? 0;
      if (status < 200 || status >= 300) throw new Error(`HTTP ${status} for ${url}`);
      let data = res.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
      return data;
    }
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA, ...headers } });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json();
  }
  async function httpPostJSON(url, body = {}, headers = {}) {
    const Http = getHttp();
    if (isAndroid() && Http?.post) {
      const res = await Http.post({
        url,
        data: body,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA, Referer: originFrom(url), ...headers },
        readTimeout: 20000,
        connectTimeout: 15000
      });
      const status = res.status ?? 0;
      let data = res.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
      return { status, json: data };
    }
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA, ...headers }, body: JSON.stringify(body || {}) });
    let json = null; try { json = await resp.json(); } catch {}
    return { status: resp.status || 0, json };
  }
  async function httpPutJSON(url, body = {}, headers = {}) {
    const Http = getHttp();
    if (isAndroid() && Http?.put) {
      const res = await Http.put({
        url,
        data: body,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA, Referer: originFrom(url), ...headers },
        readTimeout: 20000,
        connectTimeout: 15000
      });
      const status = res.status ?? 0;
      let data = res.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
      return { status, json: data };
    }
    const resp = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA, ...headers }, body: JSON.stringify(body || {}) });
    let json = null; try { json = await resp.json(); } catch {}
    return { status: resp.status || 0, json };
  }
  async function httpDelete(url, headers = {}) {
    const Http = getHttp();
    if (isAndroid() && Http?.delete) {
      const res = await Http.delete({
        url,
        headers: { 'User-Agent': UA, Referer: originFrom(url), ...headers },
        readTimeout: 15000,
        connectTimeout: 15000
      });
      const status = res.status ?? 0;
      let data = res.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
      return { status, json: data };
    }
    const resp = await fetch(url, { method: 'DELETE', headers: { 'User-Agent': UA, ...headers } });
    let json = null; try { json = await resp.json(); } catch {}
    return { status: resp.status || 0, json };
  }

  // Image fetch helpers (Referer/Origin for hotlinking)
  function refererFor(url) {
    try {
      const h = new URL(url).hostname.toLowerCase();
      if (h.endsWith('donmai.us')) return 'https://danbooru.donmai.us';
      if (h.endsWith('yande.re')) return 'https://yande.re';
      if (h.endsWith('konachan.com')) return 'https://konachan.com';
      if (h.endsWith('konachan.net')) return 'https://konachan.net';
      if (h.endsWith('hypnohub.net')) return 'https://hypnohub.net';
      if (h.endsWith('tbib.org')) return 'https://tbib.org';
      if (h.endsWith('gelbooru.com')) return 'https://gelbooru.com';
      if (h.endsWith('safebooru.org')) return 'https://safebooru.org';
      if (h.endsWith('e621.net') || h.endsWith('e926.net')) return 'https://e621.net';
      if (h.endsWith('derpicdn.net') || h.endsWith('derpibooru.org')) return 'https://derpibooru.org';
      return '';
    } catch { return ''; }
  }

  // LRU cache for proxied images (data URLs)
  const IMG_CACHE_MAX = 400;
  const imgCache = new Map();
  function cacheGet(k) {
    const v = imgCache.get(k);
    if (v) { imgCache.delete(k); imgCache.set(k, v); }
    return v || null;
  }
  function cachePut(k, v) {
    if (imgCache.has(k)) imgCache.delete(k);
    imgCache.set(k, v);
    if (imgCache.size > IMG_CACHE_MAX) {
      const it = imgCache.keys().next();
      if (!it.done) imgCache.delete(it.value);
    }
  }

  // Concurrency limiter for proxyImage
  const MAX_CONC = 8;
  let inFlight = 0;
  const waitQ = [];
  function acquire() {
    return new Promise((resolve) => {
      if (inFlight < MAX_CONC) { inFlight++; resolve(); }
      else waitQ.push(resolve);
    });
  }
  function release() {
    inFlight--;
    const next = waitQ.shift();
    if (next) { inFlight++; next(); }
  }

  async function httpGetBase64(url) {
    const Http = getHttp();
    const ref = refererFor(url);
    const headers = {
      'User-Agent': UA,
      ...(ref ? { Referer: ref, Origin: ref } : {}),
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
    };

    if (isAndroid() && Http?.get) {
      const res = await Http.get({
        url,
        responseType: 'arraybuffer',
        headers,
        readTimeout: 20000,
        connectTimeout: 15000
      });
      const status = res.status ?? 0;
      if (status < 200 || status >= 300) throw new Error(`HTTP ${status} for ${url}`);
      return String(res.data || '');
    }
    const resp = await fetch(url, { headers, credentials: 'omit' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    const buf = await (await resp.blob()).arrayBuffer();
    const bytes = new Uint8Array(buf); let bin = '';
    for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    return b64(bin);
  }
  function guessMime(url) {
    const u = (url || '').toLowerCase();
    if (u.endsWith('.png')) return 'image/png';
    if (u.endsWith('.webp')) return 'image/webp';
    if (u.endsWith('.gif')) return 'image/gif';
    if (u.endsWith('.mp4')) return 'video/mp4';
    if (u.endsWith('.webm')) return 'video/webm';
    return 'image/jpeg';
  }

  // Normalize base URL (for stable favourite keys)
  function normalizeBaseUrl(u) {
    try {
      const url = new URL(String(u || '').trim());
      url.hash = '';
      url.search = '';
      return url.toString().replace(/\/+$/, '');
    } catch {
      return String(u || '').replace(/\/+$/, '');
    }
  }

  // Config and local favourites (unchanged core helpers elided for brevity)
  const CFG_KEY = 'sb_config_v1';
  const DEFAULT_SITES = [
    { name: 'Danbooru', type: 'danbooru', baseUrl: 'https://danbooru.donmai.us', rating: 'safe', tags: '' },
    { name: 'Gelbooru', type: 'gelbooru', baseUrl: 'https://gelbooru.com', rating: 'safe', tags: '' },
    { name: 'Yande.re', type: 'moebooru', baseUrl: 'https://yande.re', rating: 'safe', tags: '' }
  ];
  function defaultConfig() { return { sites: DEFAULT_SITES }; }
  async function loadConfigWeb() { try { const raw = localStorage.getItem(CFG_KEY); if (!raw) return defaultConfig(); const parsed = JSON.parse(raw); if (parsed && Array.isArray(parsed.sites)) { parsed.sites = parsed.sites.map((s) => ({ rating: 'safe', tags: '', ...s })); return parsed; } return defaultConfig(); } catch { return defaultConfig(); } }
  async function saveConfigWeb(cfg) { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg || defaultConfig())); } catch {} return cfg || defaultConfig(); }
  const FAV_KEYS = 'sb_local_favs_keys_v1';
  const FAV_POSTS = 'sb_local_favs_posts_v1';
  function favLoadKeys() { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEYS) || '[]')); } catch { return new Set(); } }
  function favSaveKeys(set) { try { localStorage.setItem(FAV_KEYS, JSON.stringify([...set])); } catch {} }
  function favLoadMap() { try { return new Map(Object.entries(JSON.parse(localStorage.getItem(FAV_POSTS) || '{}'))); } catch { return new Map(); } }
  function favSaveMap(map) { try { localStorage.setItem(FAV_POSTS, JSON.stringify(Object.fromEntries(map))); } catch {} }
  async function favKeys() { return [...favLoadKeys()]; }
  async function favList() { const map = favLoadMap(); const out = []; for (const v of map.values()) { try { out.push(JSON.parse(v)); } catch {} } return out; }

  // proxy image with LRU cache and server fallback
  async function proxyImage(url) {
    try {
      const cached = cacheGet(url);
      if (cached) return { ok: true, url: cached, dataUrl: cached };
      await acquire();
      try {
        const base64 = await httpGetBase64(url);
        const mime = guessMime(url);
        const dataUrl = `data:${mime};base64,${base64}`;
        cachePut(url, dataUrl);
        return { ok: true, url: dataUrl, dataUrl };
      } finally {
        release();
      }
    } catch (e) {
      // Fallback via server proxy (CORS enabled)
      try {
        const acc = accLoad(); const base = accGetBase(acc);
        if (!base) throw e;
        const resp = await fetch(`${base}/imgproxy?url=${encodeURIComponent(url)}`);
        if (!resp.ok) throw new Error(`proxy ${resp.status}`);
        const blob = await resp.blob();
        const dataUrl = await new Promise((resolve) => {
          const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.readAsDataURL(blob);
        });
        cachePut(url, dataUrl);
        return { ok: true, url: dataUrl, dataUrl };
      } catch (e2) {
        console.error('proxyImage failed', e2);
        return { ok: false, error: String(e2), url: '', dataUrl: '' };
      }
    }
  }

  // Account helpers for remote sync
  const ACC_KEY = 'sb_account_v1';
  function accLoad() { try { return JSON.parse(localStorage.getItem(ACC_KEY) || '{}'); } catch { return {}; } }
  function accSave(obj) { try { localStorage.setItem(ACC_KEY, JSON.stringify(obj || {})); } catch {} }
  function accGetBase(acc) { const b = String(acc?.serverBase || '').trim(); if (!b) return ''; try { const u = new URL(b); return u.toString().replace(/\/+$/,''); } catch { return b.replace(/\/+$/,''); } }
  async function getMe(base, token) { try { return await httpGetJSON(`${base}/api/me`, { Authorization: `Bearer ${token}` }); } catch (e) { return { ok: false, error: String(e?.message || e) }; } }

  // Favourites toggle (remote + local)
  async function favToggle(post) {
    const key = `${normalizeBaseUrl(post?.site?.baseUrl || '')}#${post?.id}`;
    const keys = favLoadKeys(); const map = favLoadMap();
    let favorited;
    const now = Date.now();
    if (keys.has(key)) { keys.delete(key); map.delete(key); favorited = false; }
    else { keys.add(key); map.set(key, JSON.stringify({ ...post, _added_at: now })); favorited = true; }
    favSaveKeys(keys); favSaveMap(map);

    try {
      const acc = accLoad();
      const base = accGetBase(acc);
      const token = acc?.token || '';
      if (base && token) {
        if (favorited) {
          await httpPutJSON(`${base}/api/favorites/${encodeURIComponent(key)}`, { post, added_at: now }, { Authorization: `Bearer ${token}` });
        } else {
          await httpDelete(`${base}/api/favorites/${encodeURIComponent(key)}`, { Authorization: `Bearer ${token}` });
        }
      }
    } catch (e) {
      console.warn('Remote favourite sync failed:', e?.message || e);
    }

    return { ok: true, favorited, key };
  }

  // Replace local favourites from remote (authoritative)
  async function syncReplaceFavorites() {
    const acc = accLoad(); const base = accGetBase(acc);
    if (!base || !acc.token) return { ok: false, error: 'Not logged in' };
    const data = await httpGetJSON(`${base}/api/favorites`, { Authorization: `Bearer ${acc.token}` });
    const remote = Array.isArray(data?.items) ? data.items : [];
    const keys = new Set();
    const map = new Map();
    for (const it of remote) {
      const k = String(it.key || ''); if (!k || !it.post) continue;
      keys.add(k);
      map.set(k, JSON.stringify({ ...it.post, _added_at: Number(it.added_at) || Date.now() }));
    }
    favSaveKeys(keys);
    favSaveMap(map);
    return { ok: true, count: keys.size };
  }

  // SSE with debounce to avoid storms
  let sse = { es: null, base: '', token: '' };
  let favSyncTimer = null;
  let favSyncInFlight = false;
  let favSyncNeedsRerun = false;

  function scheduleFavSync() {
    if (favSyncTimer) return;
    favSyncTimer = setTimeout(async () => {
      favSyncTimer = null;
      if (favSyncInFlight) { favSyncNeedsRerun = true; return; }
      favSyncInFlight = true;
      try {
        await syncReplaceFavorites();
        try { const keys = await favKeys(); window.__localFavsSet = new Set(keys || []); } catch {}
        window.events?.emit?.('favorites_changed', { ok: true, source: 'sse' });
      } catch (e) {
        console.warn('SSE favourites sync error', e?.message || e);
      } finally {
        favSyncInFlight = false;
        if (favSyncNeedsRerun) { favSyncNeedsRerun = false; scheduleFavSync(); }
      }
    }, 250);
  }

  function openSse() {
    try {
      const acc = accLoad(); const base = accGetBase(acc); const token = acc?.token || '';
      if (!base || !token) return closeSse();
      if (sse.es && sse.base === base && sse.token === token) return;

      closeSse();
      const url = `${base}/api/stream?access_token=${encodeURIComponent(token)}&t=${Date.now()}`;
      const es = new EventSource(url, { withCredentials: false });
      sse = { es, base, token };

      es.addEventListener('hello', () => {});
      es.addEventListener('ping', () => {});
      es.addEventListener('fav_changed', () => scheduleFavSync());
      es.addEventListener('sites_changed', () => window.events?.emit?.('config_changed', {}));
      es.onerror = () => { setTimeout(() => { if (sse.es === es) openSse(); }, 3000); };
    } catch {}
  }
  function closeSse() {
    try { sse.es?.close?.(); } catch {}
    sse = { es: null, base: '', token: '' };
  }

  // expose
  window.Platform = { isElectron, isAndroid, openExternal: async (url) => {
    if (isElectron() && window.api?.openExternal) return window.api.openExternal(url);
    if (C?.Plugins?.Browser?.open) { await C.Plugins.Browser.open({ url }); return true; }
    window.open(url, '_blank', 'noopener,noreferrer'); return true;
  }, share: async (opts = {}) => {
    if (C?.Plugins?.Share?.share) { await C.Plugins.Share.share(opts); return true; }
    if (navigator.share) { const { title, text, url } = opts; await navigator.share({ title, text, url }); return true; }
    return false;
  }, saveImageFromUrl: async (url, filename = 'image.jpg') => {
    if (isElectron() && window.api?.saveImage) return window.api.saveImage(url, filename);
    if (C?.Plugins?.Filesystem?.writeFile) {
      try {
        if (typeof C.Plugins.Filesystem.requestPermissions === 'function') {
          try { const perm = await C.Plugins.Filesystem.requestPermissions(); const ok = perm.publicStorage === 'granted' || perm.publicStorage === 'limited'; if (!ok) return false; } catch {}
        }
        const resp = await fetch(url); const blob = await resp.blob(); const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf); let bin = ''; for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
        const base64 = b64(bin);
        await C.Plugins.Filesystem.writeFile({ path: `Pictures/StreamBooru/${filename}`, data: base64, directory: 'EXTERNAL', recursive: true });
        return true;
      } catch (e) { console.error('saveImageFromUrl error', e); return false; }
    }
    const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener'; a.click(); return true;
  }, getVersion: async () => {
    if (isElectron() && window.api?.getVersion) return window.api.getVersion();
    if (C?.Plugins?.App?.getInfo) { try { const info = await C.Plugins.App.getInfo(); return info?.version || 'android'; } catch {} }
    return 'web';
  }, ensureStoragePermission: async () => {
    if (!isAndroid() || !C?.Plugins?.Filesystem) return true;
    if (typeof C.Plugins.Filesystem.requestPermissions === 'function') {
      try { const perm = await C.Plugins.Filesystem.requestPermissions(); return perm.publicStorage === 'granted' || perm.publicStorage === 'limited'; }
      catch { return true; }
    }
    return true;
  } };

  if (!isElectron()) {
    window.api = {
      // Config
      loadConfig: loadConfigWeb,
      saveConfig: saveConfigWeb,

      // Fetch
      fetchBooru: fetchBooruWeb,

      // External
      openExternal: window.Platform.openExternal,

      // Images
      downloadImage: async ({ url, fileName }) => window.Platform.saveImageFromUrl(url, fileName),
      downloadBulk: undefined,
      proxyImage,

      // Site helpers (stubs on Android)
      booruFavorite: async () => ({ ok: false, error: 'Not supported on Android build' }),
      authCheck: async () => ({ ok: true }),
      rateLimit: async () => ({ ok: true }),
      rateLimitCheck: async () => ({ ok: true }),

      // Local favorites (with remote sync on Android/Web)
      favKeys,
      favList,
      favToggle,
      favClear: async () => { favSaveKeys(new Set()); favSaveMap(new Map()); return { ok: true }; },
      getLocalFavoriteKeys: favKeys,
      getLocalFavorites: favList,
      toggleLocalFavorite: favToggle,
      clearLocalFavorites: async () => { favSaveKeys(new Set()); favSaveMap(new Map()); return { ok: true }; },

      // Account + sync (Android/Web)
      accountGet: async () => {
        const acc = accLoad();
        setTimeout(openSse, 0);
        return { serverBase: acc.serverBase || '', token: acc.token || '', user: acc.user || null, loggedIn: !!acc.token };
      },
      accountSetServer: async (base) => {
        const acc = accLoad(); acc.serverBase = String(base || '').trim(); accSave(acc);
        openSse();
        return { ok: true, serverBase: acc.serverBase || '' };
      },
      accountRegister: async (username, password) => {
        const acc = accLoad(); const base = accGetBase(acc);
        if (!base) return { ok: false, error: 'No server selected' };

        let { status, json } = await httpPostJSON(`${base}/auth/local/register`, { username, password });
        if (status >= 400 || !json?.token) {
          const auth = 'Basic ' + b64(`${username}:${password}`);
          ({ status, json } = await httpPostJSON(`${base}/auth/local/register`, {}, { Authorization: auth, 'X-Username': username, 'X-Password': password }));
        }
        if (status >= 400 || !json?.token) return { ok: false, error: json?.error || 'Register failed' };

        acc.token = json.token;
        try { const me = await httpGetJSON(`${base}/api/me`, { Authorization: `Bearer ${acc.token}` }); if (me?.ok && me.user) acc.user = me.user; } catch {}
        accSave(acc);
        openSse();
        return { ok: true, user: acc.user || null };
      },
      accountLoginLocal: async (username, password) => {
        const acc = accLoad(); const base = accGetBase(acc);
        if (!base) return { ok: false, error: 'No server selected' };

        let { status, json } = await httpPostJSON(`${base}/auth/local/login`, { username, password });
        if (status >= 400 || !json?.token) {
          const auth = 'Basic ' + b64(`${username}:${password}`);
          ({ status, json } = await httpPostJSON(`${base}/auth/local/login`, {}, { Authorization: auth, 'X-Username': username, 'X-Password': password }));
        }
        if (status >= 400 || !json?.token) return { ok: false, error: json?.error || 'Login failed' };

        acc.token = json.token;
        try { const me = await httpGetJSON(`${base}/api/me`, { Authorization: `Bearer ${acc.token}` }); if (me?.ok && me.user) acc.user = me.user; } catch {}
        accSave(acc);
        openSse();
        return { ok: true, user: acc.user || null };
      },
      accountLoginDiscord: async () => {
        const acc = accLoad(); const base = accGetBase(acc);
        if (!base) return { ok: false, error: 'No server selected' };
        const deepLink = 'streambooru://oauth/discord';
        await window.Platform.openExternal(`${base}/auth/discord?redirect_uri=${encodeURIComponent(deepLink)}`);
        return { ok: true, pending: true };
      },
      accountLinkDiscord: async () => {
        const acc = accLoad(); const base = accGetBase(acc);
        if (!base || !acc.token) return { ok: false, error: 'Not logged in' };
        try {
          const next = 'streambooru://oauth/linked';
          const start = await httpGetJSON(`${base}/api/link/discord/start?next=${encodeURIComponent(next)}`, { Authorization: `Bearer ${acc.token}` });
          if (start?.ok && start.url) { await window.Platform.openExternal(start.url); return { ok: true, pending: true }; }
          return { ok: false, error: 'Server refused link start' };
        } catch (e) { return { ok: false, error: String(e?.message || e) }; }
      },
      accountUnlinkDiscord: async () => {
        try {
          const acc = accLoad(); const base = accGetBase(acc);
          if (!base || !acc.token) return { ok: false, error: 'Not logged in' };
          const r = await httpPostJSON(`${base}/auth/discord/unlink`, {}, { Authorization: `Bearer ${acc.token}` });
          if ((r?.status || 0) < 400) {
            const me = await httpGetJSON(`${base}/api/me`, { Authorization: `Bearer ${acc.token}` });
            if (me?.ok) { acc.user = me.user || null; accSave(acc); }
            return { ok: true };
          }
          return { ok: false, error: r?.json?.error || 'Unlink failed' };
        } catch (e) {
          return { ok: false, error: String(e?.message || e) };
        }
      },
      accountLogout: async () => { const acc = accLoad(); accSave({ serverBase: acc.serverBase || '', token: '', user: null }); closeSse(); return { ok: true }; },

      // Sync helpers
      syncOnLogin: async () => ({ ok: true }),
      syncPullFavorites: syncReplaceFavorites,

      sitesGetRemote: async () => {
        try {
          const acc = accLoad(); const base = accGetBase(acc);
        if (!base || !acc.token) return { ok: true, sites: [] };
          const j = await httpGetJSON(`${base}/api/sites`, { Authorization: `Bearer ${acc.token}` });
          return { ok: true, sites: Array.isArray(j?.sites) ? j.sites : [] };
        } catch { return { ok: true, sites: [] }; }
      },
      sitesSaveRemote: async (sites) => {
        try {
          const acc = accLoad(); const base = accGetBase(acc);
          if (!base || !acc.token) return { ok: false, error: 'Not logged in' };
          const res = await httpPutJSON(`${base}/api/sites`, { sites: Array.isArray(sites) ? sites : [] }, { Authorization: `Bearer ${acc.token}` });
          return { ok: res.status && res.status < 400 };
        } catch (e) { return { ok: false, error: String(e?.message || e) }; }
      },

      // Version
      getVersion: window.Platform.getVersion
    };

    // Try to open SSE if already logged in
    openSse();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        const App = C?.Plugins?.App;
        if (!isAndroid() || !App?.addListener) return;
        App.addListener('appUrlOpen', async (data) => {
          try {
            const url = String(data?.url || '');
            if (!url.startsWith('streambooru://')) return;
            const u = new URL(url);
            const token = u.searchParams.get('token') || '';
            const linked = u.searchParams.get('linked') || '';
            const acc = accLoad();
            if (token) {
              acc.token = token;
              const base = accGetBase(acc);
              if (base) {
                try {
                  const me = await httpGetJSON(`${base}/api/me`, { Authorization: `Bearer ${token}` });
                  if (me?.ok && me.user) acc.user = me.user;
                } catch {}
              }
              accSave(acc);
              openSse();
            } else if (linked) {
              const base = accGetBase(acc);
              if (base && acc.token) {
                try {
                  const me = await httpGetJSON(`${base}/api/me`, { Authorization: `Bearer ${acc.token}` });
                  if (me?.ok && me.user) { acc.user = me.user; accSave(acc); }
                } catch {}
              }
            }
          } catch {}
        });
      } catch {}
    });
  }
})();