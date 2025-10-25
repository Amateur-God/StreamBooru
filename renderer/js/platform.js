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
      offConfigChanged: (fn) => off('config_changed', fn),
      onAccountChanged: (fn) => on('account_changed', fn),
      emitAccountChanged: () => emit('account_changed', {})
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
  async function httpGetText(url, headers = {}) {
    const Http = getHttp();
    if (isAndroid() && Http?.get) {
      const res = await Http.get({
        url,
        responseType: 'text',
        headers: { 'User-Agent': UA, Referer: originFrom(url), ...headers },
        readTimeout: 30000,
        connectTimeout: 20000
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
        readTimeout: 30000,
        connectTimeout: 20000
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
        readTimeout: 30000,
        connectTimeout: 20000
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
        readTimeout: 20000,
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
  function hostNeedsProxy(url) {
    try {
      const h = new URL(url).hostname.toLowerCase();
      return (
        h.endsWith('donmai.us') ||
        h === 'files.yande.re' ||
        h === 'konachan.com' || h === 'konachan.net'
      );
    } catch { return false; }
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
        readTimeout: 45000,
        connectTimeout: 20000
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

  // Config and local favourites
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

  // Local favorites
  const FAV_KEYS = 'sb_local_favs_keys_v1';
  const FAV_POSTS = 'sb_local_favs_posts_v1';
  function favLoadKeys() { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEYS) || '[]')); } catch { return new Set(); } }
  function favSaveKeys(set) { try { localStorage.setItem(FAV_KEYS, JSON.stringify([...set])); } catch {} }
  function favLoadMap() { try { return new Map(Object.entries(JSON.parse(localStorage.getItem(FAV_POSTS) || '{}'))); } catch { return new Map(); } }
  function favSaveMap(map) { try { localStorage.setItem(FAV_POSTS, JSON.stringify(Object.fromEntries(map))); } catch {} }
  async function favKeys() { return [...favLoadKeys()]; }
  async function favList() { const map = favLoadMap(); const out = []; for (const v of map.values()) { try { out.push(JSON.parse(v)); } catch {} } return out; }

  // Rating/helpers for fetching/normalization
  function ensureHttps(url) { try { const u = new URL(url); if (u.protocol === 'http:') u.protocol = 'https:'; return u.toString(); } catch { return url; } }
  function splitTags(s) { return String(s || '').split(/\s+/).map((t) => t.trim()).filter(Boolean); }
  function toISO(dt) {
    try {
      if (!dt) return '';
      if (typeof dt === 'number') return new Date(dt * 1000).toISOString();
      const d = new Date(dt);
      return isNaN(d.getTime()) ? '' : d.toISOString();
    } catch { return ''; }
  }
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

  // Normalizers
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

  // Per-site fetchers
  function cred(site, key) { return (site?.credentials && site.credentials[key]) || site?.[key] || ''; }
  function withDanbooruAuth(params, site) {
    const login = cred(site, 'login'); const apiKey = cred(site, 'api_key');
    if (login && apiKey) { params.set('login', login); params.set('api_key', apiKey); }
  }
  function withGelbooruAuth(params, site) {
    const userId = cred(site, 'user_id'); const apiKey = cred(site, 'api_key');
    if (userId && apiKey) { params.set('user_id', userId); params.set('api_key', apiKey); }
  }
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
  function popularTagFor(siteType) {
    if (siteType === 'danbooru') return 'order:rank';
    if (siteType === 'moebooru') return 'order:score';
    if (siteType === 'gelbooru') return 'sort:score';
    return 'order:rank';
  }

  // Fetch across a booru site (web/mobile)
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

  // proxy image with LRU cache and server fallback (CapacitorHttp to bypass CORS)
  async function proxyImage(input) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    try {
      if (!url) return { ok: false, error: 'No URL', url: '', dataUrl: '' };

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
      // Fallback via server proxy (CORS enabled). On Android use CapacitorHttp to bypass CORS.
      try {
        const acc = accLoad(); const base = accGetBase(acc);
        if (!base) throw e;
        const proxyUrl = `${base}/imgproxy?url=${encodeURIComponent(url)}`;

        const Http = getHttp();
        if (isAndroid() && Http?.get) {
          const res = await Http.get({
            url: proxyUrl,
            responseType: 'arraybuffer',
            headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', 'User-Agent': UA },
            readTimeout: 30000,
            connectTimeout: 15000
          });
          if ((res.status ?? 0) >= 200 && (res.status ?? 0) < 300) {
            const mime = guessMime(url);
            const dataUrl = `data:${mime};base64,${String(res.data || '')}`;
            cachePut(url, dataUrl);
            return { ok: true, url: dataUrl, dataUrl };
          }
          throw new Error(`proxy HTTP ${res.status}`);
        } else {
          const resp = await fetch(proxyUrl, { headers: { Accept: 'image/*' } });
          if (!resp.ok) throw new Error(`proxy ${resp.status}`);
          const blob = await resp.blob();
          const dataUrl = await new Promise((resolve) => {
            const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.readAsDataURL(blob);
          });
          cachePut(url, dataUrl);
          return { ok: true, url: dataUrl, dataUrl };
        }
      } catch (e2) {
        // Demote to warn to avoid noisy logs on Android when server proxy denies
        console.warn('proxyImage failed', e2);
        return { ok: false, error: String(e2), url: '', dataUrl: '' };
      }
    }
  }

  // Account helpers for remote sync
  const ACC_KEY = 'sb_account_v1';
  function accLoad() { try { return JSON.parse(localStorage.getItem(ACC_KEY) || '{}'); } catch { return {}; } }
  function accSave(obj) { try { localStorage.setItem(ACC_KEY, JSON.stringify(obj || {})); } catch {} }
  function accGetBase(acc) {
    const b = String(acc?.serverBase || '').trim();
    if (!b) return '';
    try { const u = new URL(b); return u.toString().replace(/\/+$/,''); } catch { return b.replace(/\/+$/,''); }
  }
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

  // Deep link handling (Discord login) — attach ASAP and also on resume
  function handleDeepLink(url) {
    try {
      if (!url || !String(url).startsWith('streambooru://')) return;
      const u = new URL(url);
      const token = u.searchParams.get('token') || '';
      const linked = u.searchParams.get('linked') || '';
      const acc = accLoad();
      if (token) {
        acc.token = token;
        const base = accGetBase(acc);
        if (base) {
          getMe(base, token).then((me) => {
            if (me?.ok && me.user) { acc.user = me.user; accSave(acc); }
            else accSave(acc);
            openSse();
            window.events?.emitAccountChanged?.();
          }).catch(()=>{ accSave(acc); openSse(); window.events?.emitAccountChanged?.(); });
        } else {
          accSave(acc);
          openSse();
          window.events?.emitAccountChanged?.();
        }
      } else if (linked) {
        const base = accGetBase(acc);
        if (base && acc.token) {
          getMe(base, acc.token).then((me) => {
            if (me?.ok && me.user) { acc.user = me.user; accSave(acc); }
            window.events?.emitAccountChanged?.();
          }).catch(()=>{});
        }
      }
    } catch {}
  }
  (function attachDeepLinkListeners() {
    try {
      const App = C?.Plugins?.App;
      if (!App) return;
      if (typeof App.getLaunchUrl === 'function') {
        App.getLaunchUrl().then((res)=>{ const url = res?.url || res; if (url) handleDeepLink(String(url)); }).catch(()=>{});
      }
      if (typeof App.addListener === 'function') {
        App.addListener('appUrlOpen', (data) => { try { handleDeepLink(String(data?.url || '')); } catch {} });
        App.addListener('appStateChange', (st) => {
          try {
            if (st?.isActive && typeof App.getLaunchUrl === 'function') {
              App.getLaunchUrl().then((res)=>{ const url = res?.url || res; if (url) handleDeepLink(String(url)); }).catch(()=>{});
            }
          } catch {}
        });
      }
    } catch {}
  })();

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

  (function ensureProxyHelpers() {
    window.api = window.api || {};
    if (typeof window.api.proxyImage !== 'function') {
      window.api.proxyImage = proxyImage;
    } else {
      window.api.proxyImage = proxyImage;
    }
    window.apiHostNeedsProxy = window.apiHostNeedsProxy || hostNeedsProxy;
  })();

  if (!isElectron()) {
    window.api = {
      loadConfig: loadConfigWeb,
      saveConfig: saveConfigWeb,
      fetchBooru: fetchBooruWeb,
      openExternal: window.Platform.openExternal,
      downloadImage: async ({ url, fileName }) => window.Platform.saveImageFromUrl(url, fileName),
      downloadBulk: undefined,
      proxyImage,
      booruFavorite: async () => ({ ok: false, error: 'Not supported on Android build' }),
      authCheck: async () => ({ ok: true }),
      rateLimit: async () => ({ ok: true }),
      rateLimitCheck: async () => ({ ok: true }),
      favKeys,
      favList,
      favToggle,
      favClear: async () => { favSaveKeys(new Set()); favSaveMap(new Map()); return { ok: true }; },
      getLocalFavoriteKeys: favKeys,
      getLocalFavorites: favList,
      toggleLocalFavorite: favToggle,
      clearLocalFavorites: async () => { favSaveKeys(new Set()); favSaveMap(new Map()); return { ok: true }; },
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
        window.events?.emitAccountChanged?.();
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
        window.events?.emitAccountChanged?.();
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
            window.events?.emitAccountChanged?.();
            return { ok: true };
          }
          return { ok: false, error: r?.json?.error || 'Unlink failed' };
        } catch (e) {
          return { ok: false, error: String(e?.message || e) };
        }
      },
      accountLogout: async () => { const acc = accLoad(); accSave({ serverBase: acc.serverBase || '', token: '', user: null }); closeSse(); window.events?.emitAccountChanged?.(); return { ok: true }; },
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
      getVersion: window.Platform.getVersion
    };

    openSse();
  }

  document.addEventListener('visibilitychange', () => {
    try {
      const App = C?.Plugins?.App;
      if (document.visibilityState === 'visible' && App?.getLaunchUrl) {
        App.getLaunchUrl().then((res)=>{ const url = res?.url || res; if (url) handleDeepLink(String(url)); }).catch(()=>{});
      }
    } catch {}
  });
})();