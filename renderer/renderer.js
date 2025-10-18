// Renderer with dedicated Search tab (round-robin interleave), New (round-robin append),
// Popular (global popularity sort), Favorites (local), and robust Manage Sites.

const state = {
  config: { sites: [] },
  viewType: 'new', // 'new' | 'popular' | 'search' | 'faves'
  cursors: {}, // per-site cursor map
  items: [], // rendered items
  loading: false,
  search: '',

  // Search mode aggregation
  searchBuckets: new Map(), // siteKey -> posts[]
  searchSeen: new Set(),    // keys to avoid dupes
  searchOrder: [],          // site order as keys (also used for New)

  // New mode aggregation (round-robin append)
  feedSeen: new Set(),      // global seen set for non-search feed
  rrCursor: 0,              // starting index for per-fetch round-robin across sites

  // Paging/flow control
  noMoreResults: false,
  pendingFetch: false,
  fetchGen: 0               // generation token to drop stale responses across resets
};

// ---------- utils ----------

function siteKey(site) { return `${site.type}:${site.baseUrl}`; }
function itemKey(p) { return `${p.site?.baseUrl || ''}#${p.id}`; }
function safeNum(n, d=0) { const v = Number(n); return Number.isFinite(v)?v:d; }
function timeKey(p) {
  const t = p?.created_at ? Date.parse(p.created_at) : NaN;
  if (Number.isFinite(t)) return t;
  const idn = Number(p?.id);
  return Number.isFinite(idn) ? idn : -Infinity;
}
function tagsInclude(p, searchStr) {
  if (!searchStr) return true;
  const wanted = searchStr.split(/\s+/).filter(Boolean);
  if (wanted.length === 0) return true;
  const hay = new Set((p.tags || []).map((t) => t.toLowerCase()));
  return wanted.every((t) => hay.has(t.toLowerCase()));
}

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
function computePopularity(items) {
  const stats = buildSiteStats(items);
  const now = Date.now();
  const map = new Map();
  for (const p of items) {
    const sk = siteKey(p.site || {});
    const st = stats.get(sk) || { favP95: 0, scoreP95: 0 };
    const favNorm = st.favP95>0 ? Math.min(1, Math.max(0, safeNum(p.favorites,0)/st.favP95)) : 0;
    const scoreNorm = st.scoreP95>0 ? Math.min(1, Math.max(0, safeNum(p.score,0)/st.scoreP95)) : 0;
    const pop = 1.0*favNorm + 0.6*scoreNorm + 0.15*recencyBoost(p, now);
    map.set(itemKey(p), pop);
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
    list.sort(newCompare); // kept for completeness; New tab uses RR append mode below
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
  for (let i=0;i<maxLen;i++) {
    for (let j=0;j<arrays.length;j++) {
      if (i < arrays[j].length) out.push(arrays[j][i]);
    }
  }
  return out;
}

// Incremental RR merge for a single fetch cycle, starting at rrCursor
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
      if (a.length) {
        out.push(a.shift());
        remaining--;
      }
    }
  }
  return out;
}

// ---------- Remote favorites helpers (site APIs) ----------

function findSiteConfigForPost(post) {
  const b = (post?.site?.baseUrl || '').replace(/\/+$/, '');
  const t = post?.site?.type || '';
  return (state.config.sites || []).find(
    (s) => (s.type === t) && ((s.baseUrl || '').replace(/\/+$/, '') === b)
  ) || null;
}
function hasRemoteFavoriteSupport(post) {
  const s = findSiteConfigForPost(post);
  if (!s) return false;
  if (s.type === 'danbooru') return !!(s.credentials?.login && s.credentials?.api_key);
  if (s.type === 'moebooru') return !!(s.credentials?.login && s.credentials?.password_hash);
  return false;
}
async function toggleRemoteFavorite(post) {
  const siteCfg = findSiteConfigForPost(post);
  if (!siteCfg) return { ok: false, error: 'No site config' };
  const already = !!(post.user_favorited || post._remote_favorited);
  const action = already ? 'remove' : 'add';
  try {
    const res = await window.api.favoritePost({ site: siteCfg, postId: post.id, action });
    if (res?.ok) {
      post._remote_favorited = action === 'add';
      return { ok: true, favorited: post._remote_favorited };
    }
    return { ok: false, error: res?.error || 'Favorite failed' };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
// Expose for components
window.hasRemoteFavoriteSupport = hasRemoteFavoriteSupport;
window.toggleRemoteFavoriteRemote = toggleRemoteFavorite;

// ---------- state/bootstrap ----------

async function loadConfig() {
  state.config = await window.api.loadConfig();
  state.searchOrder = (state.config.sites || []).map((s)=>siteKey(s));
}
function setActiveTab() {
  document.querySelectorAll('.tab').forEach((t)=>t.classList.remove('active'));
  const btn = document.querySelector(`[data-view="${state.viewType}"]`);
  if (btn) btn.classList.add('active');
}
function clearFeed() {
  state.items = [];
  state.cursors = {};
  // Reset buckets/sets and RR cursor
  state.searchBuckets = new Map();
  state.searchSeen = new Set();
  state.feedSeen = new Set();
  state.rrCursor = 0;
  state.noMoreResults = false;
  state.pendingFetch = false;
  state.fetchGen++;
  const feed = document.getElementById('feed');
  feed.innerHTML = '';
}
function renderAppend() {
  const feed = document.getElementById('feed');
  const start = feed.childElementCount;
  for (let i = start; i < state.items.length; i++) {
    feed.appendChild(window.PostCard(state.items[i], i));
  }
}
function renderReplacePreserveScroll() {
  const feed = document.getElementById('feed');

  const topbarH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 64;
  let anchorKey = null;
  let anchorTop = null;
  for (const child of Array.from(feed.children)) {
    const rect = child.getBoundingClientRect();
    if (rect.bottom > topbarH) {
      anchorKey = child.dataset?.key || null;
      anchorTop = rect.top;
      break;
    }
  }

  feed.innerHTML = '';
  window.getGalleryItems = () => state.items;
  for (let i = 0; i < state.items.length; i++) {
    feed.appendChild(window.PostCard(state.items[i], i));
  }

  if (anchorKey) {
    const newAnchor = feed.querySelector(`[data-key="${CSS.escape(anchorKey)}"]`);
    if (newAnchor) {
      const rect2 = newAnchor.getBoundingClientRect();
      if (typeof anchorTop === 'number') {
        const delta = rect2.top - anchorTop;
        window.scrollBy(0, delta);
      }
    }
  }
}
window.getGalleryItems = () => state.items;
function isSearchTab() { return state.viewType === 'search'; }

// ---------- fetching ----------

async function fetchBatch() {
  const loadingEl = document.getElementById('loading');
  if (state.noMoreResults) {
    loadingEl.classList.remove('hidden');
    loadingEl.textContent = 'End of results';
    return;
  }
  if (state.loading) { state.pendingFetch = true; return; }

  const gen = state.fetchGen;

  state.loading = true;
  loadingEl.classList.remove('hidden');
  loadingEl.textContent = 'Loading…';

  if (state.viewType === 'faves') {
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
  if (sites.length === 0) {
    loadingEl.textContent = 'No sites configured. Click Manage Sites to add.';
    state.loading = false;
    return;
  }

  const doSearch = isSearchTab() && (state.search || '').trim().length > 0;
  const isPopular = state.viewType === 'popular';
  const isNew = state.viewType === 'new';

  const reqs = sites.map(async (site)=>{
    const key = siteKey(site);
    const cursor = state.cursors[key] || null;
    const res = await window.api.fetchBooru({
      site,
      viewType: doSearch ? 'new' : state.viewType,
      cursor,
      limit: 40,
      search: state.search || ''
    });
    state.cursors[key] = res?.nextCursor ?? cursor ?? null;
    return { key, posts: Array.isArray(res?.posts) ? res.posts : [] };
  });

  let results;
  try { results = await Promise.allSettled(reqs); }
  catch { results = []; }

  if (gen !== state.fetchGen) {
    state.loading = false;
    if (state.pendingFetch) { state.pendingFetch = false; fetchBatch(); }
    return;
  }

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
    for (const p of collected) {
      const k = itemKey(p);
      if (seen.has(k)) continue;
      newbies.push(p);
      seen.add(k);
    }
    if (newbies.length > 0) {
      const mergedSorted = sortItems(state.items.concat(newbies), 'popular');
      const currKeys = state.items.map(itemKey);
      const prefixKeys = mergedSorted.slice(0, currKeys.length).map(itemKey);

      state.items = mergedSorted;
      if (currKeys.length > 0 && currKeys.every((k,i)=>k===prefixKeys[i])) {
        renderAppend();
      } else {
        renderReplacePreserveScroll();
      }
      addedTotal = newbies.length;
    }
  } else if (isNew) {
    const perSiteNew = new Map();
    for (const k of state.searchOrder) perSiteNew.set(k, []);
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { key, posts } = r.value;
      if (!perSiteNew.has(key)) perSiteNew.set(key, []);
      const arr = perSiteNew.get(key);
      for (const p of posts) {
        const k = itemKey(p);
        if (state.feedSeen.has(k)) continue;
        state.feedSeen.add(k);
        arr.push(p);
      }
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

  if (addedTotal === 0) {
    state.noMoreResults = true;
    loadingEl.classList.remove('hidden');
    loadingEl.textContent = 'End of results';
  } else {
    loadingEl.classList.add('hidden');
  }

  state.loading = false;
  if (state.pendingFetch) {
    const runAgain = !state.noMoreResults;
    state.pendingFetch = false;
    if (runAgain) fetchBatch();
  }
}

// ---------- wiring ----------

function setupTabs() {
  document.getElementById('tab-new').addEventListener('click', ()=>{
    if (state.viewType !== 'new') { state.viewType = 'new'; setActiveTab(); clearFeed(); fetchBatch(); }
  });
  document.getElementById('tab-popular').addEventListener('click', ()=>{
    if (state.viewType !== 'popular') { state.viewType = 'popular'; setActiveTab(); clearFeed(); fetchBatch(); }
  });
  document.getElementById('tab-search').addEventListener('click', ()=>{
    if (state.viewType !== 'search') { state.viewType = 'search'; setActiveTab(); clearFeed(); fetchBatch(); }
  });
  document.getElementById('tab-faves').addEventListener('click', ()=>{
    if (state.viewType !== 'faves') { state.viewType = 'faves'; setActiveTab(); clearFeed(); fetchBatch(); }
  });
}

function setupSearch() {
  const form = document.getElementById('search-form');
  const input = document.getElementById('tag-search');
  const btnClear = document.getElementById('tag-clear-btn');

  if (state.search) input.value = state.search;

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const v = (input.value || '').trim();
    state.search = v;
    state.viewType = 'search';
    setActiveTab();
    clearFeed();
    fetchBatch();
  });

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
      window.renderSiteManager(
        modal,
        state.config,
        async (newCfg) => {
          state.config = newCfg;
          state.searchOrder = (state.config.sites || []).map((s)=> siteKey(s));
          clearFeed();
          await window.api.saveConfig(state.config);
          fetchBatch();
        },
        () => {}
      );
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

// Local favorites helpers exposed globally (used by cards/lightbox)
window.isLocalFavorite = (post) => (window.__localFavsSet || new Set()).has(itemKey(post));
window.toggleLocalFavorite = async (post) => {
  const res = await window.api.toggleLocalFavorite(post);
  window.__localFavsSet = window.__localFavsSet || new Set(await window.api.getLocalFavoriteKeys());
  if (res?.ok) {
    if (res.favorited) window.__localFavsSet.add(res.key);
    else window.__localFavsSet.delete(res.key);
    if (state.viewType === 'faves') { clearFeed(); await fetchBatch(); }
  }
  return res;
};

// ---------- bootstrap ----------

async function init() {
  await loadConfig();
  try {
    const keys = await window.api.getLocalFavoriteKeys();
    window.__localFavsSet = new Set(keys || []);
  } catch {}
  setupTabs();
  setupSearch();
  setupManageSites();
  setupInfiniteScroll();
  setActiveTab();
  clearFeed();
  fetchBatch();
}

init();
