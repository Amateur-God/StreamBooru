/* StreamBooru platform adapter for Electron (desktop) and Capacitor (Android)
   - Supplies window.api on Android/Web
*/
(function () {
  // env
  const isElectron = () => navigator.userAgent.includes('Electron');
  const C = typeof window !== 'undefined' ? window.Capacitor : undefined;
  const isAndroid = () => !!C && typeof C.getPlatform === 'function' && C.getPlatform() === 'android';

  // native HTTP
  const UA = 'Mozilla/5.0 (Linux; Android 12; StreamBooru) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Mobile Safari/537.36';
  function getHttp() { return C?.Plugins?.CapacitorHttp || C?.Plugins?.Http || null; }
  function originFrom(url) { try { return new URL(url).origin; } catch { return ''; } }
  const b64 = (s) => { try { return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'utf8').toString('base64'); } catch { return s; } };

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

  async function httpGetText(url, headers = {}) {
    const Http = getHttp();
    if (isAndroid() && Http?.get) {
      const res = await Http.get({
        url,
        responseType: 'text',
        headers: { 'User-Agent': UA, Referer: originFrom(url), ...headers },
        readTimeout: 20000,
        connectTimeout: 15000
      });
      const status = res.status ?? 0;
      if (status < 200 || status >= 300) throw new Error(`HTTP ${status} for ${url}`);
      return String(res.data ?? '');
    }
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.text();
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

  async function httpGetBase64(url) {
    const Http = getHttp();
    if (isAndroid() && Http?.get) {
      const res = await Http.get({
        url,
        responseType: 'arraybuffer',
        headers: { 'User-Agent': UA, Referer: originFrom(url) },
        readTimeout: 20000,
        connectTimeout: 15000
      });
      const status = res.status ?? 0;
      if (status < 200 || status >= 300) throw new Error(`HTTP ${status} for ${url}`);
      return String(res.data || '');
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    const buf = await (await resp.blob()).arrayBuffer();
    const bytes = new Uint8Array(buf); let bin = '';
    for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
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

  // config (Android/Web)
  const CFG_KEY = 'sb_config_v1';
  const DEFAULT_SITES = [
    { name: 'Danbooru', type: 'danbooru', baseUrl: 'https://danbooru.donmai.us', rating: 'safe', tags: '' },
    { name: 'Gelbooru', type: 'gelbooru', baseUrl: 'https://gelbooru.com', rating: 'safe', tags: '' },
    { name: 'Yande.re', type: 'moebooru', baseUrl: 'https://yande.re', rating: 'safe', tags: '' }
  ];
  function defaultConfig() { return { sites: DEFAULT_SITES }; }
  async function loadConfigWeb() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (!raw) return defaultConfig();
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.sites)) {
        parsed.sites = parsed.sites.map((s) => ({ rating: 'safe', tags: '', ...s }));
        return parsed;
      }
      return defaultConfig();
    } catch { return defaultConfig(); }
  }
  async function saveConfigWeb(cfg) { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg || defaultConfig())); } catch {} return cfg || defaultConfig(); }

  // local favorites
  const FAV_KEYS = 'sb_local_favs_keys_v1';
  const FAV_POSTS = 'sb_local_favs_posts_v1';
  function favLoadKeys() { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEYS) || '[]')); } catch { return new Set(); } }
  function favSaveKeys(set) { try { localStorage.setItem(FAV_KEYS, JSON.stringify([...set])); } catch {} }
  function favLoadMap() { try { return new Map(Object.entries(JSON.parse(localStorage.getItem(FAV_POSTS) || '{}'))); } catch { return new Map(); } }
  function favSaveMap(map) { try { localStorage.setItem(FAV_POSTS, JSON.stringify(Object.fromEntries(map))); } catch {} }
  async function favKeys() { return [...favLoadKeys()]; }
  async function favList() { const map = favLoadMap(); const out = []; for (const v of map.values()) { try { out.push(JSON.parse(v)); } catch {} } return out; }

  // account helpers for remote sync
  const ACC_KEY = 'sb_account_v1';
  function accLoad() { try { return JSON.parse(localStorage.getItem(ACC_KEY) || '{}'); } catch { return {}; } }
  function accSave(obj) { try { localStorage.setItem(ACC_KEY, JSON.stringify(obj || {})); } catch {} }
  function accGetBase(acc) {
    const b = String(acc?.serverBase || '').trim();
    if (!b) return '';
    try { const u = new URL(b); return u.toString().replace(/\/+$/,''); } catch { return b.replace(/\/+$/,''); }
  }

  // proxy image
  async function proxyImage(url) {
    try {
      const base64 = await httpGetBase64(url);
      const mime = guessMime(url);
      const dataUrl = `data:${mime};base64,${base64}`;
      return { ok: true, url: dataUrl, dataUrl };
    } catch (e) {
      console.error('proxyImage failed', e);
      return { ok: false, error: String(e), url: '', dataUrl: '' };
    }
  }

  // external/open/share/save/version/perm
  async function fetchAsBase64(url) {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf); let bin = '';
    for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    return b64(bin);
  }
  async function openExternal(url) {
    if (isElectron() && window.api?.openExternal) return window.api.openExternal(url);
    if (C?.Plugins?.Browser?.open) { await C.Plugins.Browser.open({ url }); return true; }
    window.open(url, '_blank', 'noopener,noreferrer'); return true;
  }
  async function share(opts = {}) {
    if (C?.Plugins?.Share?.share) { await C.Plugins.Share.share(opts); return true; }
    if (navigator.share) { const { title, text, url } = opts; await navigator.share({ title, text, url }); return true; }
    return false;
  }
  async function ensureStoragePermission() {
    if (!isAndroid() || !C?.Plugins?.Filesystem) return true;
    if (typeof C.Plugins.Filesystem.requestPermissions === 'function') {
      try { const perm = await C.Plugins.Filesystem.requestPermissions(); return perm.publicStorage === 'granted' || perm.publicStorage === 'limited'; }
      catch { return true; }
    }
    return true;
  }
  async function saveImageFromUrl(url, filename = 'image.jpg') {
    if (isElectron() && window.api?.saveImage) return window.api.saveImage(url, filename);
    if (C?.Plugins?.Filesystem?.writeFile) {
      try {
        await ensureStoragePermission();
        const base64 = await fetchAsBase64(url);
        await C.Plugins.Filesystem.writeFile({ path: `Pictures/StreamBooru/${filename}`, data: base64, directory: 'EXTERNAL', recursive: true });
        return true;
      } catch (e) { console.error('saveImageFromUrl error', e); return false; }
    }
    const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener'; a.click(); return true;
  }
  async function getVersion() {
    if (isElectron() && window.api?.getVersion) return window.api.getVersion();
    if (C?.Plugins?.App?.getInfo) { try { const info = await C.Plugins.App.getInfo(); return info?.version || 'android'; } catch {} }
    return 'web';
  }

  // rating helpers
  function ensureHttps(url) { try { const u = new URL(url); if (u.protocol === 'http:') u.protocol = 'https:'; return u.toString(); } catch { return url; } }
  function splitTags(s) { return String(s || '').split(/\s+/).map((t) => t.trim()).filter(Boolean); }
  function toISO(dt) { try { if (!dt) return ''; if (typeof dt === 'number') return new Date(dt * 1000).toISOString(); const d = new Date(dt); return isNaN(d.getTime()) ? '' : d.toISOString(); } catch { return ''; } }
  function hasRatingSpecifier(tags) { return /\brating\s*:(?:safe|questionable|explicit|any|[sqe])\b/i.test(String(tags || '')); }
  function addRatingToken(tags, ratingVal) {
    const token = ratingVal === 'questionable' ? 'rating:questionable'
                : ratingVal === 'explicit'     ? 'rating:explicit'
                :                                 'rating:safe';
    return tags ? `${token} ${tags}` : token;
  }
  function canonRating(r) {
    const t = String(r || '').toLowerCase();
    if (t === 'g' || t === 'general') return 's';
    if (t.startsWith('s')) return 's';
    if (t.startsWith('q') || t === 'sensitive' || t === 'mature') return 'q';
    if (t.startsWith('e')) return 'e';
    return '';
  }

  // normalizers
  function normalizeDanbooru(p, site) {
    const base = site?.baseUrl || '';
    return {
      id: p.id,
      score: p.score ?? 0,
      favorites: p.fav_count ?? p.favorites ?? 0,
      rating: p.rating || '',
      width: p.image_width ?? p.width ?? 0,
      height: p.image_height ?? p.height ?? 0,
      created_at: p.created_at || p.created_at_s || '',
      tags: splitTags(p.tag_string || ''),
      file_url: p.file_url ? ensureHttps(p.file_url) : '',
      sample_url: p.large_file_url ? ensureHttps(p.large_file_url) : (p.preview_file_url ? ensureHttps(p.preview_file_url) : ''),
      preview_url: p.preview_file_url ? ensureHttps(p.preview_file_url) : '',
      post_url: `${base.replace(/\/+$/, '')}/posts/${p.id}`,
      site
    };
  }
  function normalizeMoebooru(p, site) {
    const base = site?.baseUrl || '';
    return {
      id: p.id,
      score: p.score ?? 0,
      favorites: p.fav_count ?? p.favorites ?? 0,
      rating: p.rating || '',
      width: p.width ?? 0,
      height: p.height ?? 0,
      created_at: toISO(p.created_at),
      tags: splitTags(p.tags || ''),
      file_url: p.file_url ? ensureHttps(p.file_url) : '',
      sample_url: p.sample_url ? ensureHttps(p.sample_url) : '',
      preview_url: p.preview_url ? ensureHttps(p.preview_url) : '',
      post_url: `${base.replace(/\/+$/, '')}/post/show/${p.id}`,
      site
    };
  }
  function normalizeGelbooru(p, site) {
    const base = site?.baseUrl || '';
    const file = p.file_url || p.fileURL || p.source || '';
    const preview = p.preview_url || p.previewURL || '';
    const sample = p.sample_url || p.sampleURL || '';
    const id = p.id || p.post_id || p.hash || '';
    return {
      id,
      score: Number(p.score ?? 0) || 0,
      favorites: Number(p.favorite_count ?? p.fav_count ?? p.favorites ?? 0) || 0,
      rating: p.rating || '',
      width: Number(p.width ?? 0) || 0,
      height: Number(p.height ?? 0) || 0,
      created_at: toISO(p.created_at || p.created_at_s),
      tags: splitTags(p.tags || ''),
      file_url: file ? ensureHttps(file) : '',
      sample_url: sample ? ensureHttps(sample) : '',
      preview_url: preview ? ensureHttps(preview) : '',
      post_url: `${base.replace(/\/+$/, '')}/index.php?page=post&s=view&id=${encodeURIComponent(id)}`,
      site
    };
  }

  // per-site fetchers
  function cred(site, key) { return (site?.credentials && site.credentials[key]) || site?.[key] || ''; }
  function withDanbooruAuth(params, site) { const login = cred(site, 'login'); const apiKey = cred(site, 'api_key'); if (login && apiKey) { params.set('login', login); params.set('api_key', apiKey); } }
  function withGelbooruAuth(params, site) { const userId = cred(site, 'user_id'); const apiKey = cred(site, 'api_key'); if (userId && apiKey) { params.set('user_id', userId); params.set('api_key', apiKey); } }

  async function fetchDanbooru({ baseUrl, tags, page, limit, site }) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (tags) params.set('tags', tags);
    if (page) params.set('page', String(page));
    withDanbooruAuth(params, site);
    const url = `${baseUrl.replace(/\/+$/, '')}/posts.json?${params.toString()}`;
    try {
      const json = await httpGetJSON(url);
      return Array.isArray(json) ? json : [];
    } catch {
      try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        const json = await r.json();
        return Array.isArray(json) ? json : [];
      } catch {
        return [];
      }
    }
  }
  async function fetchMoebooru({ baseUrl, tags, page, limit }) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (tags) params.set('tags', tags);
    if (page) params.set('page', String(page));
    const url = `${baseUrl.replace(/\/+$/, '')}/post.json?${params.toString()}`;
    const json = await httpGetJSON(url);
    return Array.isArray(json) ? json : [];
  }
  async function parseGelbooruXml(xmlText) {
    try {
      const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
      const nodes = doc.getElementsByTagName('post');
      const out = [];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]; const attrs = {};
        for (let j = 0; j < n.attributes.length; j++) { const a = n.attributes[j]; attrs[a.name] = a.value; }
        out.push(attrs);
      }
      return out;
    } catch { return []; }
  }
  async function fetchGelbooru({ baseUrl, tags, page, limit, site }) {
    const base = baseUrl.replace(/\/+$/, '');
    const params = new URLSearchParams();
    params.set('page', 'dapi'); params.set('s', 'post'); params.set('q', 'index'); params.set('json', '1');
    if (limit) params.set('limit', String(limit));
    if (tags) params.set('tags', tags);
    if (page) params.set('pid', String((page - 1) || 0));
    withGelbooruAuth(params, site);
    const jsonUrl = `${base}/index.php?${params.toString()}`;
    try {
      const json = await httpGetJSON(jsonUrl);
      return Array.isArray(json) ? json : (Array.isArray(json?.post) ? json.post : []);
    } catch {
      try {
        params.delete('json');
        const xmlUrl = `${base}/index.php?${params.toString()}`;
        const xml = await httpGetText(xmlUrl);
        return await parseGelbooruXml(xml);
      } catch (e2) { throw e2; }
    }
  }
  function popularTagFor(siteType) { if (siteType === 'danbooru') return 'order:rank'; if (siteType === 'moebooru') return 'order:score'; if (siteType === 'gelbooru') return 'sort:score'; return 'order:score'; }

  async function fetchBooruWeb(payload) {
    const { site, viewType, cursor, limit = 40, search = '' } = payload || {};
    if (!site || !site.baseUrl) return { posts: [], nextCursor: null };
    const baseUrl = site.baseUrl;
    const page = typeof cursor === 'number' && cursor > 0 ? cursor : 1;

    let tags = (search || '').trim();
    if (viewType === 'popular') {
      const pop = popularTagFor(site.type);
      tags = tags ? `${pop} ${tags}` : pop;
    }

    const ratingPref = String(site.rating || '').toLowerCase();
    let injectedRating = '';
    if (!hasRatingSpecifier(tags) && ratingPref && ratingPref !== 'any') {
      tags = addRatingToken(tags, ratingPref);
      injectedRating = ratingPref.startsWith('q') ? 'q' : ratingPref.startsWith('e') ? 'e' : 's';
    }

    let raw = [];
    try {
      if (site.type === 'danbooru') {
        raw = await fetchDanbooru({ baseUrl, tags, page, limit: Math.min(30, limit), site });
        if (viewType === 'popular' && Array.isArray(raw) && raw.length === 0) {
          const alt = tags.includes('order:rank') ? tags.replace('order:rank', 'order:score') : `order:score ${tags}`;
          raw = await fetchDanbooru({ baseUrl, tags: alt.trim(), page, limit: Math.min(30, limit), site });
        }
      } else if (site.type === 'moebooru') {
        raw = await fetchMoebooru({ baseUrl, tags, page, limit });
      } else if (site.type === 'gelbooru') {
        raw = await fetchGelbooru({ baseUrl, tags, page, limit, site });
      } else {
        raw = await fetchDanbooru({ baseUrl, tags, page, limit: Math.min(30, limit), site });
      }
    } catch { raw = []; }

    let norm = (raw || []).map((p) => {
      try {
        if (site.type === 'danbooru') return normalizeDanbooru(p, site);
        if (site.type === 'moebooru') return normalizeMoebooru(p, site);
        if (site.type === 'gelbooru') return normalizeGelbooru(p, site);
        return normalizeDanbooru(p, site);
      } catch { return null; }
    }).filter(Boolean);

    if (injectedRating) norm = norm.filter((p) => canonRating(p.rating) === injectedRating);

    const nextCursor = norm.length >= Math.max(1, limit) ? page + 1 : null;
    return { posts: norm, nextCursor };
  }

  // Local + remote favorite toggle
  async function favToggle(post) {
    const key = `${post?.site?.baseUrl || ''}#${post?.id}`;
    const keys = favLoadKeys(); const map = favLoadMap();
    let favorited;
    const now = Date.now();
    if (keys.has(key)) { keys.delete(key); map.delete(key); favorited = false; }
    else { keys.add(key); map.set(key, JSON.stringify({ ...post, _added_at: now })); favorited = true; }
    favSaveKeys(keys); favSaveMap(map);

    // Remote sync (Android/Web)
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

  async function favClear() { favSaveKeys(new Set()); favSaveMap(new Map()); return { ok: true }; }

  // account (Android/Web)
  async function getMe(base, token) {
    try { return await httpGetJSON(`${base}/api/me`, { Authorization: `Bearer ${token}` }); }
    catch (e) { return { ok: false, error: String(e?.message || e) }; }
  }

  function registerDeepLinkHandler() {
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
                const me = await getMe(base, token);
                if (me?.ok && me.user) acc.user = me.user;
              } catch {}
            }
            accSave(acc);
          } else if (linked) {
            const base = accGetBase(acc);
            if (base && acc.token) {
              try {
                const me = await getMe(base, acc.token);
                if (me?.ok && me.user) { acc.user = me.user; accSave(acc); }
              } catch {}
            }
          }
        } catch {}
      });
    } catch {}
  }

  // expose
  window.Platform = { isElectron, isAndroid, openExternal, share, saveImageFromUrl, getVersion, ensureStoragePermission };

  if (!isElectron()) {
    window.api = {
      // Config
      loadConfig: loadConfigWeb,
      saveConfig: saveConfigWeb,

      // Fetch
      fetchBooru: fetchBooruWeb,

      // External
      openExternal,

      // Images
      downloadImage: async ({ url, fileName }) => saveImageFromUrl(url, fileName),
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
      favClear,
      getLocalFavoriteKeys: favKeys,
      getLocalFavorites: favList,
      toggleLocalFavorite: favToggle,
      clearLocalFavorites: favClear,

      // Account + sync (Android/Web)
      accountGet: async () => {
        const acc = accLoad();
        return { serverBase: acc.serverBase || '', token: acc.token || '', user: acc.user || null, loggedIn: !!acc.token };
      },
      accountSetServer: async (base) => {
        const acc = accLoad(); acc.serverBase = String(base || '').trim(); accSave(acc);
        return { ok: true, serverBase: acc.serverBase || '' };
      },
      accountRegister: async (username, password) => {
        const acc = accLoad(); const base = accGetBase(acc);
        if (!base) return { ok: false, error: 'No server selected' };

        // JSON
        let { status, json } = await httpPostJSON(`${base}/auth/local/register`, { username, password });
        if (status >= 400 || !json?.token) {
          // Basic fallback
          const auth = 'Basic ' + b64(`${username}:${password}`);
          ({ status, json } = await httpPostJSON(`${base}/auth/local/register`, {}, { Authorization: auth, 'X-Username': username, 'X-Password': password }));
        }
        if (status >= 400 || !json?.token) return { ok: false, error: json?.error || 'Register failed' };

        acc.token = json.token;
        try { const me = await getMe(base, acc.token); if (me?.ok && me.user) acc.user = me.user; } catch {}
        accSave(acc);
        return { ok: true, user: acc.user || null };
      },
      accountLoginLocal: async (username, password) => {
        const acc = accLoad(); const base = accGetBase(acc);
        if (!base) return { ok: false, error: 'No server selected' };

        // JSON
        let { status, json } = await httpPostJSON(`${base}/auth/local/login`, { username, password });
        if (status >= 400 || !json?.token) {
          // Basic fallback
          const auth = 'Basic ' + b64(`${username}:${password}`);
          ({ status, json } = await httpPostJSON(`${base}/auth/local/login`, {}, { Authorization: auth, 'X-Username': username, 'X-Password': password }));
        }
        if (status >= 400 || !json?.token) return { ok: false, error: json?.error || 'Login failed' };

        acc.token = json.token;
        try { const me = await getMe(base, acc.token); if (me?.ok && me.user) acc.user = me.user; } catch {}
        accSave(acc);
        return { ok: true, user: acc.user || null };
      },
      accountLoginDiscord: async () => {
        const acc = accLoad(); const base = accGetBase(acc);
        if (!base) return { ok: false, error: 'No server selected' };
        const deepLink = 'streambooru://oauth/discord';
        await openExternal(`${base}/auth/discord?redirect_uri=${encodeURIComponent(deepLink)}`);
        return { ok: true, pending: true };
      },
      accountLinkDiscord: async () => {
        const acc = accLoad(); const base = accGetBase(acc);
        if (!base || !acc.token) return { ok: false, error: 'Not logged in' };
        try {
          const next = 'streambooru://oauth/linked';
          const start = await httpGetJSON(`${base}/api/link/discord/start?next=${encodeURIComponent(next)}`, { Authorization: `Bearer ${acc.token}` });
          if (start?.ok && start.url) { await openExternal(start.url); return { ok: true, pending: true }; }
          return { ok: false, error: 'Server refused link start' };
        } catch (e) { return { ok: false, error: String(e?.message || e) }; }
      },
      accountLogout: async () => { const acc = accLoad(); accSave({ serverBase: acc.serverBase || '', token: '', user: null }); return { ok: true }; },

      // Sync helpers (lightweight)
      syncOnLogin: async () => ({ ok: true }),
      syncPullFavorites: async () => {
        try {
          const acc = accLoad(); const base = accGetBase(acc);
          if (!base || !acc.token) return { ok: false, error: 'Not logged in' };
          const data = await httpGetJSON(`${base}/api/favorites`, { Authorization: `Bearer ${acc.token}` });
          const remote = Array.isArray(data?.items) ? data.items : [];
          const keys = favLoadKeys(); const map = favLoadMap();
          for (const it of remote) {
            const k = String(it.key || ''); if (!k || keys.has(k) || !it.post) continue;
            keys.add(k); map.set(k, JSON.stringify({ ...it.post, _added_at: Number(it.added_at) || Date.now() }));
          }
          favSaveKeys(keys); favSaveMap(map);
          return { ok: true, merged: remote.length };
        } catch (e) { return { ok: false, error: String(e?.message || e) }; }
      },
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
      getVersion
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerDeepLinkHandler);
  } else {
    registerDeepLinkHandler();
  }
})();