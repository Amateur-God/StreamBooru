// Renderer with Search/New/Popular/Favorites, Manage Sites,
// Bulk Download, and filename templates (popover from Download All)

const state = {
  config: { sites: [] },
  viewType: 'new',
  cursors: {},
  items: [],
  loading: false,
  search: '',

  // Aggregation
  searchBuckets: new Map(),
  searchSeen: new Set(),
  searchOrder: [],
  feedSeen: new Set(),
  rrCursor: 0,

  // Flow control
  noMoreResults: false,
  pendingFetch: false,
  fetchGen: 0,

  // File naming
  nameTemplate: null
};

// ---------- utils ----------
function normalizeBaseUrl(u) {
  try { const url = new URL(String(u || '').trim()); url.hash = ''; url.search = ''; return url.toString().replace(/\/+$/, ''); }
  catch { return String(u || '').replace(/\/+$/, ''); }
}
function siteKey(site) { return `${site.type}:${normalizeBaseUrl(site.baseUrl || '')}`; }
function itemKey(p) { return `${normalizeBaseUrl(p.site?.baseUrl || '')}#${p.id}`; }
function safeNum(n, d=0) { const v = Number(n); return Number.isFinite(v)?v:d; }
function timeKey(p) {
  const t = p?.created_at ? Date.parse(p.created_at) : NaN;
  if (Number.isFinite(t)) return t;
  const idn = Number(p?.id);
  return Number.isFinite(idn) ? idn : -Infinity;
}
function tagsInclude(p, searchStr) {
  if (!searchStr) return true;
  const wanted = (searchStr || '').split(/\s+/).filter(Boolean);
  if (wanted.length === 0) return true;
  const hay = new Set((p.tags || []).map((t) => String(t).toLowerCase()));
  return wanted.every((t) => hay.has(String(t).toLowerCase()));
}

// Popularity helpers
function quantile(a, q) {
  if (!a || a.length === 0) return 0;
  const s = [...a].sort((x,y)=>x-y);
  const pos = (s.length - 1) * Math.min(Math.max(q, 0), 1);
  const b = Math.floor(pos);
  const r = pos - b;
  if (s[b+1] !== undefined) return s[b] + r*(s[b+1]-s[b]);
  return s[b];
}
function buildSiteStats(items) {
  const by = new Map();
  for (const p of items) {
    const k = siteKey(p.site || {});
    if (!by.has(k)) by.set(k, { favs: [], scores: [] });
    const b = by.get(k);
    const f = safeNum(p.favorites, 0);
    const s = safeNum(p.score, 0);
    if (f > 0) b.favs.push(f);
    if (s !== 0) b.scores.push(s);
  }
  const out = new Map();
  for (const [k,v] of by.entries()) {
    out.set(k, { favP95: quantile(v.favs, 0.95) || 0, scoreP95: quantile(v.scores, 0.95) || 0 });
  }
  return out;
}
function recencyBoost(p, now=Date.now()) {
  const t = timeKey(p);
  if (!Number.isFinite(t) || t<=0) return 0;
  const ageH = Math.max(0, (now - t)/3600000);
  const half = 48;
  return Math.exp(-ageH/half);
}
function clamp01(x) { const n = Number(x); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }
function computePopularity(items) {
  const stats = buildSiteStats(items);
  const now = Date.now();
  const map = new Map();
  for (const p of items) {
    const sk = siteKey(p.site || {});
    const st = stats.get(sk) || { favP95: 0, scoreP95: 0 };
    const favNorm = st.favP95>0 ? clamp01(safeNum(p.favorites,0)/st.favP95) : 0;
    const scoreNorm = st.scoreP95>0 ? clamp01(safeNum(p.score,0)/st.scoreP95) : 0;
    const pop = 1.0*favNorm + 0.6*scoreNorm + 0.15*recencyBoost(p, now);
    map.set(itemKey(p), Number.isFinite(pop) ? pop : 0);
  }
  return map;
}
function popularCompare(a,b, popMap) {
  const pa = popMap.get(itemKey(a)) ?? 0;
  const pb = popMap.get(itemKey(b)) ?? 0;
  if (pb !== pa) return pb - pa;
  const af = safeNum(a.favorites), bf = safeNum(b.favorites);
  if (bf !== af) return bf - af;
  const as = safeNum(a.score), bs = safeNum(b.score);
  if (bs !== as) return bs - as;
  const ad = timeKey(a), bd = timeKey(b);
  if (bd !== ad) return bd - ad;
  const ak = itemKey(a), bk = itemKey(b);
  return ak < bk ? -1 : ak > bk ? 1 : 0;
}
function newCompare(a,b) {
  const ad = timeKey(a), bd = timeKey(b);
  if (bd !== ad) return bd - ad;
  const af = safeNum(a.favorites), bf = safeNum(b.favorites);
  if (bf !== af) return bf - af;
  const as = safeNum(a.score), bs = safeNum(b.score);
  if (bs !== as) return bs - as;
  return 0;
}
function sortItems(items, viewType) {
  const list = [...items];
  if (viewType === 'popular') {
    const pop = computePopularity(list);
    list.sort((a,b)=>popularCompare(a,b,pop));
  } else if (viewType === 'new') {
    list.sort(newCompare);
  } else if (viewType === 'faves') {
    list.sort((a,b)=>{
      const al = a._added_at || 0, bl = b._added_at || 0;
      if (bl !== al) return bl - al;
      const ad = timeKey(a), bd = timeKey(b);
      if (bd !== ad) return bd - ad;
      return 0;
    });
  }
  return list;
}
function interleaveRoundRobin(orderKeys, buckets) {
  const arrays = orderKeys.map((k)=> buckets.get(k) || []);
  const maxLen = Math.max(0, ...arrays.map(a=>a.length));
  const out = [];
  for (let i=0;i<maxLen;i++) for (let j=0;j<arrays.length;j++) if (i < arrays[j].length) out.push(arrays[j][i]);
  return out;
}
function rrMergeAppend(orderKeys, perSiteNewArrays, startIndex) {
  const arrays = orderKeys.map((k)=> perSiteNewArrays.get(k) || []);
  const total = arrays.reduce((s,a)=>s+a.length, 0);
  const out = [];
  if (arrays.length === 0 || total === 0) return out;
  let remaining = total;
  while (remaining > 0) {
    for (let j=0; j<arrays.length; j++) {
      const idx = (startIndex + j) % arrays.length;
      const a = arrays[idx];
      if (a.length) { out.push(a.shift()); remaining--; }
    }
  }
  return out;
}

// ---------- filename templating ----------
function sanitizeName(s) {
  return String(s || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}
function getUrlMeta(url) {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split('/').pop() || '');
    const original = last || 'image';
    const ext = (original.includes('.') ? original.split('.').pop() : 'jpg').toLowerCase().slice(0, 10);
    return { original, ext };
  } catch {
    return { original: 'image', ext: 'jpg' };
  }
}
function formatDateParts(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return { y:'', m:'', d:'', hhmm:'' , yyyy_mm_dd: '' };
  const y = String(d.getFullYear());
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return { y, m, d: dd, hhmm: `${hh}${mm}`, yyyy_mm_dd: `${y}-${m}-${dd}` };
}
function extractTagCategory(post, key) {
  const src = post?.[key] ?? post?.meta?.[key] ?? null;
  if (Array.isArray(src)) return src.join('_');
  if (typeof src === 'string') return src.split(/[,\s]+/).filter(Boolean).join('_');
  return '';
}
function buildFileNameFromTemplate(post, index, template) {
  const url = post?.file_url || post?.sample_url || post?.preview_url || '';
  const { original, ext } = getUrlMeta(url);
  const site = post?.site?.name || post?.site?.type || 'site';
  const site_type = post?.site?.type || '';
  const id = post?.id ?? '';
  const score = safeNum(post?.score, '');
  const favorites = safeNum(post?.favorites, '');
  const rating = post?.rating || '';
  const width = safeNum(post?.width, '');
  const height = safeNum(post?.height, '');
  const idx = (Number(index) + 1) || 1;

  const dp = formatDateParts(post?.created_at);
  const created = dp.yyyy_mm_dd;

  const artist = extractTagCategory(post, 'artist');
  const copyright = extractTagCategory(post, 'copyright');
  const character = extractTagCategory(post, 'character');

  const map = {
    site, site_type, id, score, favorites, rating, width, height,
    index: String(idx), ext, original_name: original,
    created, created_yyyy: dp.y, created_mm: dp.m, created_dd: dp.d, created_hhmm: dp.hhmm,
    artist, copyright, character
  };

  let name = String(template || '{site}-{id}');
  name = name.replace(/\{([a-z0-9_]+)\}/ig, (_, k) => sanitizeName(map[k] ?? ''));

  name = name.replace(/(\s*[-_,]\s*){2,}/g, '$1')
             .replace(/^[,._ -]+|[,._ -]+$/g, '')
             .replace(/\s{2,}/g, ' ')
             .trim();

  if (!name.toLowerCase().endsWith(`.${ext}`)) name = `${name}.${ext}`;
  return sanitizeName(name).replace(/[\/\\]/g, '_');
}

window.getFileNameForPost = (post, index=0) =>
  buildFileNameFromTemplate(post, index, state.nameTemplate || '{site}-{id}');

// ---------- fetching / render ----------
async function fetchBatch() {
  const loadingEl = document.getElementById('loading');
  if (state.noMoreResults) { loadingEl.classList.remove('hidden'); loadingEl.textContent = 'End of results'; return; }
  if (state.loading) { state.pendingFetch = true; return; }
  const gen = state.fetchGen;
  state.loading = true; loadingEl.classList.remove('hidden'); loadingEl.textContent = 'Loading…';

  if (state.viewType === 'faves') {
    // Auto-pull remote faves when opening the tab (Android/Web build supports it)
    try { await window.api.syncPullFavorites?.(); } catch {}
    const all = await window.api.getLocalFavorites();
    const filtered = (all || []).filter((p)=> tagsInclude(p, state.search));
    state.items = sortItems(filtered, 'faves');
    renderReplacePreserveScroll();
    loadingEl.classList.add('hidden');
    state.loading = false;
    if (state.pendingFetch) { state.pendingFetch = false; fetchBatch(); }
    return;
  }

  const sites = (state.config.sites || []).filter((s)=> s.baseUrl && s.type);
  if (sites.length === 0) { loadingEl.textContent = 'No sites configured. Click Manage Sites to add.'; state.loading = false; return; }

  const doSearch = state.viewType === 'search' && (state.search || '').trim().length > 0;
  const isPopular = state.viewType === 'popular';
  const isNew = state.viewType === 'new';

  const reqs = sites.map(async (site)=>{
    const s2 = { ...site, baseUrl: normalizeBaseUrl(site.baseUrl) };
    const key = siteKey(s2);
    const cursor = state.cursors[key] || null;
    const res = await window.api.fetchBooru({
      site: s2,
      viewType: doSearch ? 'new' : state.viewType,
      cursor,
      limit: 40,
      search: state.search || ''
    });
    state.cursors[key] = res?.nextCursor ?? cursor ?? null;
    return { key, posts: Array.isArray(res?.posts) ? res.posts : [] };
  });

  let results; try { results = await Promise.allSettled(reqs); } catch { results = []; }
  if (gen !== state.fetchGen) { state.loading = false; if (state.pendingFetch) { state.pendingFetch = false; fetchBatch(); } return; }

  let addedTotal = 0;

  if (doSearch) {
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { key, posts } = r.value;
      if (!state.searchBuckets.has(key)) state.searchBuckets.set(key, []);
      const bucket = state.searchBuckets.get(key);
      for (const p of posts) {
        const k = itemKey(p);
        if (state.searchSeen.has(k)) continue;
        state.searchSeen.add(k);
        bucket.push(p);
      }
    }
    const before = state.items.length;
    state.items = interleaveRoundRobin(state.searchOrder, state.searchBuckets);
    addedTotal = Math.max(0, state.items.length - before);
    if (addedTotal > 0) renderAppend();
  } else if (isPopular) {
    const collected = results.flatMap((r)=> r.status==='fulfilled'? r.value.posts : []);
    const seen = new Set(state.items.map(itemKey));
    const newbies = [];
    for (const p of collected) { const k = itemKey(p); if (seen.has(k)) continue; newbies.push(p); seen.add(k); }
    if (newbies.length > 0) {
      const mergedSorted = sortItems(state.items.concat(newbies), 'popular');
      const currKeys = state.items.map(itemKey);
      const prefixKeys = mergedSorted.slice(0, currKeys.length).map(itemKey);
      state.items = mergedSorted;
      if (currKeys.length > 0 && currKeys.every((k,i)=>k===prefixKeys[i])) renderAppend();
      else renderReplacePreserveScroll();
      addedTotal = newbies.length;
    }
  } else if (isNew) {
    const perSiteNew = new Map(); for (const k of state.searchOrder) perSiteNew.set(k, []);
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { key, posts } = r.value;
      if (!perSiteNew.has(key)) perSiteNew.set(key, []);
      const arr = perSiteNew.get(key);
      for (const p of posts) { const k = itemKey(p); if (state.feedSeen.has(k)) continue; state.feedSeen.add(k); arr.push(p); }
    }
    const chunk = rrMergeAppend(state.searchOrder, perSiteNew, state.rrCursor);
    addedTotal = chunk.length;
    if (addedTotal > 0) {
      state.items = state.items.concat(chunk);
      renderAppend();
      const siteCount = Math.max(1, state.searchOrder.length);
      state.rrCursor = (state.rrCursor + 1) % siteCount;
    }
  }

  if (addedTotal === 0) { state.noMoreResults = true; loadingEl.classList.remove('hidden'); loadingEl.textContent = 'End of results'; }
  else { loadingEl.classList.add('hidden'); }

  state.loading = false;
  if (state.pendingFetch) { const runAgain = !state.noMoreResults; state.pendingFetch = false; if (runAgain) fetchBatch(); }
}

// ---------- render helpers ----------
function renderAppend() {
  const feed = document.getElementById('feed');
  const start = feed.childElementCount;
  for (let i = start; i < state.items.length; i++) feed.appendChild(window.PostCard(state.items[i], i));
}
function renderReplacePreserveScroll() {
  const feed = document.getElementById('feed');
  const topbarH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 64;
  let anchorKey = null, anchorTop = null;
  for (const child of Array.from(feed.children)) {
    const rect = child.getBoundingClientRect();
    if (rect.bottom > topbarH) { anchorKey = child.dataset?.key || null; anchorTop = rect.top; break; }
  }
  feed.innerHTML = '';
  window.getGalleryItems = () => state.items;
  for (let i=0;i<state.items.length;i++) feed.appendChild(window.PostCard(state.items[i], i));
  if (anchorKey) {
    const newAnchor = feed.querySelector(`[data-key="${CSS.escape(anchorKey)}"]`);
    if (newAnchor && typeof anchorTop === 'number') {
      const rect2 = newAnchor.getBoundingClientRect();
      window.scrollBy(0, rect2.top - anchorTop);
    }
  }
}
window.getGalleryItems = () => state.items;

// ---------- Download All + Options popover ----------
function sanitizeForFolder(s) { return String(s || '').replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_').slice(0, 200); }
function toDownloadItem(post, i) {
  const url = post?.file_url || post?.sample_url || post?.preview_url || '';
  if (!url) return null;
  const siteName = post?.site?.name || post?.site?.baseUrl || 'unknown';
  const fileName = buildFileNameFromTemplate(post, i, state.nameTemplate || '{site}-{id}');
  return { url, siteName: sanitizeForFolder(siteName), fileName };
}
async function onDownloadAllClick() {
  try {
    if (!window.api?.downloadBulk) { alert('Bulk download is not available in this build.'); return; }
    const posts = Array.isArray(state.items) ? state.items : [];
    if (posts.length === 0) { alert('No results to download.'); return; }
    const items = posts.map(toDownloadItem).filter(Boolean);
    if (items.length === 0) { alert('No downloadable URLs found in the current results.'); return; }
    const res = await window.api.downloadBulk(items, { subfolderBySite: true, concurrency: 3 });
    if (res?.cancelled) return;
    if (!res?.ok) { alert(`Download failed: ${res?.error || 'unknown error'}`); return; }
    const failedCount = (res.failed || []).length;
    alert(`Saved ${res.saved} file(s)${failedCount ? `, ${failedCount} failed` : ''}${res.basePath ? `\nFolder: ${res.basePath}` : ''}`);
  } catch (e) {
    console.error('Download all error:', e);
    alert(`Download error: ${e?.message || e}`);
  }
}

function openDownloadOptionsPopover(anchorEl) {
  const pop = document.getElementById('download-options');
  if (!pop) return;

  const rect = anchorEl.getBoundingClientRect();
  const margin = 8;
  pop.classList.remove('hidden');
  pop.style.visibility = 'hidden';
  pop.style.left = '0px'; pop.style.top = '0px';
  const pw = pop.offsetWidth || 360;
  const ph = pop.offsetHeight || 120;
  pop.style.visibility = '';

  let left = Math.max(8, Math.min(window.innerWidth - pw - 8, rect.right - pw));
  let top = Math.max(8, Math.min(window.innerHeight - ph - 8, rect.bottom + margin));
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;

  const close = () => { pop.classList.add('hidden'); document.removeEventListener('mousedown', outside); window.removeEventListener('keydown', esc); };
  const outside = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl) close(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('mousedown', outside);
  window.addEventListener('keydown', esc);

  const btnClose = document.getElementById('dlopt-close');
  if (btnClose) { btnClose.onclick = close; }
}

function setupDownloadAll() {
  const btn = document.getElementById('btn-download-all');
  const sel = document.getElementById('name-template');

  let saved = localStorage.getItem('sb_name_tpl') || '{site}-{id}';
  const oldCommaPreset = '{site},{score},{artist},{copyright},{character},{id}';
  const newHyphenPreset = '{site}-{score}-{artist}-{copyright}-{character}-{id}';
  if (saved === oldCommaPreset) {
    saved = newHyphenPreset;
    localStorage.setItem('sb_name_tpl', saved);
  }
  state.nameTemplate = saved;

  if (sel) {
    let matched = false;
    for (const opt of Array.from(sel.options)) {
      if (opt.value !== '__custom__' && opt.value === saved) { sel.value = opt.value; matched = true; break; }
    }
    if (!matched) sel.value = '__custom__';

    sel.addEventListener('change', () => {
      let v = sel.value;
      if (v === '__custom__') {
        const current = state.nameTemplate || '{site}-{id}';
        const entered = window.prompt(
          'Enter a custom filename template.\nTokens:\n{site} {site_type} {id} {score} {favorites} {rating} {width} {height} {index} {ext} {original_name} {created} {created_yyyy} {created_mm} {created_dd} {created_hhmm} {artist} {copyright} {character}',
          current
        );
        if (entered && entered.trim()) v = entered.trim();
        else v = current;
        sel.value = '__custom__';
      }
      state.nameTemplate = v;
      localStorage.setItem('sb_name_tpl', v);
    });
  }

  if (btn) {
    btn.addEventListener('click', (e) => {
      if (e.shiftKey || e.altKey) { e.preventDefault(); openDownloadOptionsPopover(btn); }
      else onDownloadAllClick();
    });
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); openDownloadOptionsPopover(btn); });
  }
}

// ---------- Tabs/Search/Manage/Scroll ----------
function setupTabs() {
  document.getElementById('tab-new').addEventListener('click', ()=>{ if (state.viewType !== 'new') { state.viewType = 'new'; setActiveTab(); clearFeed(); fetchBatch(); } });
  document.getElementById('tab-popular').addEventListener('click', ()=>{ if (state.viewType !== 'popular') { state.viewType = 'popular'; setActiveTab(); clearFeed(); fetchBatch(); } });
  document.getElementById('tab-search').addEventListener('click', ()=>{ if (state.viewType !== 'search') { state.viewType = 'search'; setActiveTab(); clearFeed(); fetchBatch(); } });
  document.getElementById('tab-faves').addEventListener('click', ()=>{ if (state.viewType !== 'faves') { state.viewType = 'faves'; setActiveTab(); clearFeed(); fetchBatch(); } });
}
function setActiveTab() {
  document.querySelectorAll('.tab').forEach((t)=>t.classList.remove('active'));
  const btn = document.querySelector(`[data-view="${state.viewType}"]`);
  if (btn) btn.classList.add('active');
}
async function loadConfig() {
  state.config = await window.api.loadConfig();
  state.searchOrder = (state.config.sites || []).map((s)=>siteKey(s));
}
function clearFeed() {
  state.items = [];
  state.cursors = {};
  state.searchBuckets = new Map();
  state.searchSeen = new Set();
  state.feedSeen = new Set();
  state.rrCursor = 0;
  state.noMoreResults = false;
  state.pendingFetch = false;
  state.fetchGen++;
  document.getElementById('feed').innerHTML = '';
}
function setupSearch() {
  const form = document.getElementById('search-form');
  const input = document.getElementById('tag-search');
  const btnClear = document.getElementById('tag-clear-btn');
  if (state.search) input.value = state.search;
  form.addEventListener('submit', (e)=>{ e.preventDefault(); state.search = (input.value || '').trim(); state.viewType = 'search'; setActiveTab(); clearFeed(); fetchBatch(); });
  btnClear.addEventListener('click', ()=>{
    if (!input.value && !state.search) return;
    input.value = '';
    state.search = '';
    if (state.viewType === 'search') state.viewType = 'new';
    setActiveTab();
    clearFeed();
    fetchBatch();
  });
}
function setupManageSites() {
  document.getElementById('btn-manage-sites').addEventListener('click', ()=>{
    try {
      const modal = document.getElementById('site-manager');
      if (!window.renderSiteManager) throw new Error('renderSiteManager not loaded');
      window.renderSiteManager(modal, state.config, async (newCfg) => {
        state.config = newCfg;
        state.searchOrder = (state.config.sites || []).map((s)=> siteKey(s));
        clearFeed();
        await window.api.saveConfig(state.config);
        try {
          const acct = await window.api.accountGet?.();
          if (acct?.loggedIn) await window.api.sitesSaveRemote(state.config.sites || []);
        } catch {}
        fetchBatch();
      }, () => {});
    } catch (err) {
      console.error('Manage Sites open failed:', err);
      alert('Failed to open Manage Sites. See Console for details.');
    }
  });
}
function setupInfiniteScroll() {
  window.addEventListener('scroll', ()=>{
    const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 800;
    if (nearBottom && !state.loading && !state.noMoreResults) fetchBatch();
  });
}

// ---------- Events: config + instant favorites ----------
(function subscribeConfigEvents() {
  window.events?.onConfigChanged?.(async (cfg) => {
    if (cfg && typeof cfg === 'object') {
      state.config = cfg || { sites: [] };
      state.searchOrder = (state.config.sites || []).map((s)=> siteKey(s));
      clearFeed(); fetchBatch();
    }
  });
})();
(function subscribeFavoriteEvents() {
  window.events?.onFavoritesChanged?.(async () => {
    try {
      const keys = await (window.api?.getLocalFavoriteKeys?.() || []);
      window.__localFavsSet = new Set(keys || []);
    } catch {}
    if (state.viewType === 'faves') {
      clearFeed(); await fetchBatch();
    }
  });
})();

// ---------- Local favorites with fallback ----------
window.isLocalFavorite = (post) => (window.__localFavsSet || new Set()).has(itemKey(post));

function localFavToggleFallback(post) {
  const KEY_KEYS = 'sb_local_favs_keys_v1';
  const KEY_POSTS = 'sb_local_favs_posts_v1';
  const key = itemKey(post);
  const loadKeys = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY_KEYS) || '[]')); } catch { return new Set(); } };
  const saveKeys = (set) => { try { localStorage.setItem(KEY_KEYS, JSON.stringify([...set])); } catch {} };
  const loadMap = () => { try { return new Map(Object.entries(JSON.parse(localStorage.getItem(KEY_POSTS) || '{}'))); } catch { return new Map(); } };
  const saveMap = (map) => { try { localStorage.setItem(KEY_POSTS, JSON.stringify(Object.fromEntries(map))); } catch {} };

  const keys = loadKeys();
  const map = loadMap();
  let favorited;
  if (keys.has(key)) {
    keys.delete(key);
    map.delete(key);
    favorited = false;
  } else {
    keys.add(key);
    map.set(key, JSON.stringify({ ...post, _added_at: Date.now() }));
    favorited = true;
  }
  saveKeys(keys);
  saveMap(map);
  return { ok: true, favorited, key };
}

window.toggleLocalFavorite = async (post) => {
  try {
    let res;
    if (typeof window.api?.toggleLocalFavorite === 'function') {
      res = await window.api.toggleLocalFavorite(post);
    } else {
      res = localFavToggleFallback(post);
    }
    window.__localFavsSet = window.__localFavsSet || new Set(await (window.api?.getLocalFavoriteKeys?.() || []));
    const key = res?.key || itemKey(post);
    if (res?.ok) {
      if (res.favorited) window.__localFavsSet.add(key);
      else window.__localFavsSet.delete(key);
      if (state.viewType === 'faves') { clearFeed(); await fetchBatch(); }
    } else {
      alert(`Save failed: ${res?.error || 'unknown error'}`);
    }
    return res;
  } catch (e) {
    console.error('toggleLocalFavorite error:', e);
    alert(`Save failed: ${e?.message || e}`);
    return { ok: false, error: String(e?.message || e) };
  }
};

// ---------- bootstrap ----------
async function init() {
  await loadConfig();
  try { const keys = await (window.api?.getLocalFavoriteKeys?.() || []); window.__localFavsSet = new Set(keys || []); } catch {}
  setupTabs();
  setupSearch();
  setupManageSites();
  setupInfiniteScroll();
  setupDownloadAll();
  setActiveTab();
  clearFeed();
  fetchBatch();
}
init();