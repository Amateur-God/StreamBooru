const { app, BrowserWindow, ipcMain, net, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

/* Dev flag for verbose logging */
const isDev = process.env.SB_DEV === '1';

/* -------- robust adapter loader (dev: ../src/adapters, packaged: ./src/adapters) -------- */
function loadAdapter(name) {
  const dev = path.join(__dirname, '..', 'src', 'adapters', name);
  const prod = path.join(__dirname, 'src', 'adapters', name);
  try { return require(dev); } catch (e1) {
    try { return require(prod); } catch (e2) {
      const err = new Error(`Cannot load adapter "${name}". Tried:\n - ${dev}\n - ${prod}\nOriginal errors:\n${e1?.stack || e1}\n${e2?.stack || e2}`);
      err.cause = e2;
      throw err;
    }
  }
}

/* ------------------------------- Adapters ------------------------------- */
const Danbooru    = loadAdapter('danbooru');
const Moebooru    = loadAdapter('moebooru');
const Gelbooru    = loadAdapter('gelbooru');
const E621        = loadAdapter('e621');
const Derpibooru  = loadAdapter('derpibooru');

let win;

/* ------------------------------- Hotlink headers + request logging ------------------------------- */
function setupHotlinkHeaders(sess) {
  sess.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
    try {
      const headers = { ...details.requestHeaders };
      const host = new URL(details.url).hostname;

      // Decide Referer per host
      let referer = null;
      if (host.endsWith('donmai.us')) {
        referer = 'https://danbooru.donmai.us/';
      } else if (host === 'files.yande.re') {
        referer = 'https://yande.re/';
      } else if (host === 'konachan.com') {
        referer = 'https://konachan.com/';
      } else if (host === 'konachan.net') {
        referer = 'https://konachan.net/';
      } else if (host.endsWith('e621.net')) {
        referer = 'https://e621.net/';
      } else if (host.endsWith('e926.net')) {
        referer = 'https://e926.net/';
      } else if (host.endsWith('derpicdn.net') || host.endsWith('derpibooru.org')) {
        referer = 'https://derpibooru.org/';
      }
      if (referer) headers['Referer'] = referer;

      // Ensure a reasonable UA
      if (!headers['User-Agent']) {
        headers['User-Agent'] =
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36 StreamBooru/Electron';
      }

      callback({ requestHeaders: headers });
    } catch {
      callback({});
    }
  });

  if (isDev) {
    const filt = { urls: ['*://*/*'] };
    sess.webRequest.onCompleted(filt, (d) => {
      try {
        const h = new URL(d.url).hostname;
        if (
          h.includes('gelbooru') ||
          h.includes('safebooru') ||
          h.includes('rule34') ||
          h.includes('realbooru') ||
          h.includes('xbooru') ||
          h.includes('derpibooru') ||
          h.includes('derpicdn')
        ) {
          console.log('[net:onCompleted]', JSON.stringify({
            url: d.url, statusCode: d.statusCode, method: d.method, fromCache: d.fromCache || false
          }));
        }
      } catch {}
    });
    sess.webRequest.onErrorOccurred(filt, (d) => {
      try {
        const h = new URL(d.url).hostname;
        if (
          h.includes('gelbooru') ||
          h.includes('safebooru') ||
          h.includes('rule34') ||
          h.includes('realbooru') ||
          h.includes('xbooru') ||
          h.includes('derpibooru') ||
          h.includes('derpicdn')
        ) {
          console.warn('[net:onError]', JSON.stringify({ url: d.url, error: d.error, method: d.method }));
        }
      } catch {}
    });
  }
}

/* --------------------------------- Window --------------------------------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'StreamBooru',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true
    }
  });

  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);
  setupHotlinkHeaders(win.webContents.session);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* --------------------------------- Config --------------------------------- */
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const FAVORITES_PATH = path.join(app.getPath('userData'), 'favorites.json');
const ACCOUNT_PATH = path.join(app.getPath('userData'), 'account.json');

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig = {
      sites: [
        {
          name: 'Danbooru (safe)',
          type: 'danbooru',
          baseUrl: 'https://danbooru.donmai.us',
          rating: 'safe',
          tags: '',
          credentials: { login: '', api_key: '' }
        },
        {
          name: 'Yande.re (safe)',
          type: 'moebooru',
          baseUrl: 'https://yande.re',
          rating: 'safe',
          tags: '',
          credentials: { login: '', password_hash: '' }
        },
        {
          name: 'e621 (safe)',
          type: 'e621',
          baseUrl: 'https://e621.net',
          rating: 'safe',
          tags: '',
          credentials: {}
        },
        {
          name: 'Derpibooru (safe)',
          type: 'derpibooru',
          baseUrl: 'https://derpibooru.org',
          rating: 'safe',
          tags: '',
          credentials: {}
        }
      ]
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    return defaultConfig;
  }
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); }
  catch { return { sites: [] }; }
}
function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

/* ------------------------------- Account I/O ------------------------------- */
function readAccount() {
  if (!fs.existsSync(ACCOUNT_PATH)) {
    const def = { serverBase: 'https://streambooru.co.uk', token: '', user: null };
    fs.writeFileSync(ACCOUNT_PATH, JSON.stringify(def, null, 2), 'utf-8');
    return def;
  }
  try { return JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf-8')); }
  catch { return { serverBase: 'https://streambooru.co.uk', token: '', user: null }; }
}
function writeAccount(acc) {
  const base = acc?.serverBase || 'https://streambooru.co.uk';
  fs.writeFileSync(ACCOUNT_PATH, JSON.stringify({ serverBase: base, token: acc?.token || '', user: acc?.user || null }, null, 2), 'utf-8');
}

/* ------------------------------- Favorites I/O ------------------------------- */
function favKey(post) { return `${post?.site?.baseUrl || ''}#${post?.id}`; }
function loadFavorites() {
  if (!fs.existsSync(FAVORITES_PATH)) return [];
  try { const arr = JSON.parse(fs.readFileSync(FAVORITES_PATH, 'utf-8')); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}
function saveFavorites(arr) {
  try { fs.writeFileSync(FAVORITES_PATH, JSON.stringify(arr, null, 2), 'utf-8'); } catch {}
}

/* --------------------------------- HTTP --------------------------------- */
function applyDefaultHeaders(request, url, headers = {}) {
  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36 StreamBooru/0.4 Electron/31',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: url
  };
  const merged = { ...defaultHeaders, ...headers };
  Object.entries(merged).forEach(([k, v]) => request.setHeader(k, v));
}

function httpGetJson(url, headers = {}) {
  if (isDev) console.log('[httpGetJson] GET', url);
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET' });
    applyDefaultHeaders(request, url, { Accept: 'application/json, text/json;q=0.9, */*;q=0.1', ...headers });
    let data = '';
    request.on('response', (response) => {
      const status = response.statusCode || 0;
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        if (isDev) console.log('[httpGetJson:end]', status, url);
        const rawCT = response.headers['content-type'] || response.headers['Content-Type'] || '';
        const ct = Array.isArray(rawCT) ? rawCT[0] : rawCT;
        if (status >= 400) return reject(new Error(`HTTP ${status} from ${url}\nBody: ${data.slice(0, 300)}...`));
        const looksHtml = /^\s*</.test(data);
        const looksJsonCT = /application\/json|text\/json|application\/x-json/i.test(String(ct));
        if (looksHtml && !looksJsonCT) {
          return reject(new Error(`Non-JSON response from ${url}. Content-Type: ${ct || 'unknown'}\nBody: ${data.slice(0,300)}...`));
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Failed to parse JSON from ${url}: ${e.message}\nBody: ${data.slice(0,300)}...`)); }
      });
    });
    request.on('error', (e) => reject(e));
    request.end();
  });
}

function httpGetText(url, headers = {}) {
  if (isDev) console.log('[httpGetText] GET', url);
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET' });
    applyDefaultHeaders(request, url, headers);
    let data = '';
    request.on('response', (response) => {
      const status = response.statusCode || 0;
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        if (isDev) console.log('[httpGetText:end]', status, url, 'bytes:', data.length);
        if (status >= 400) return reject(new Error(`HTTP ${status} from ${url}\nBody: ${data.slice(0,300)}...`));
        resolve(data);
      });
    });
    request.on('error', (e) => reject(e));
    request.end();
  });
}

function httpPostForm(url, form, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams(form).toString();
    const request = net.request({ url, method: 'POST' });
    applyDefaultHeaders(request, url, { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json, text/json;q=0.9, */*;q=0.1', ...headers });
    let data = '';
    request.on('response', (response) => {
      const status = response.statusCode || 0;
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        if (status >= 400) return reject(new Error(`HTTP ${status} from ${url}\nBody: ${data.slice(0,300)}...`));
        try { resolve(JSON.parse(data)); } catch { resolve({ ok: true, raw: data }); }
      });
    });
    request.on('error', reject);
    request.write(postData);
    request.end();
  });
}

function httpDelete(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'DELETE' });
    applyDefaultHeaders(request, url, headers);
    let data = '';
    request.on('response', (response) => {
      const status = response.statusCode || 0;
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        if (status >= 400) return reject(new Error(`HTTP ${status} from ${url}\nBody: ${data.slice(0,300)}...`));
        try { resolve(JSON.parse(data)); } catch { resolve({ ok: true, raw: data }); }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

/* -------------------------------- Adapters registry -------------------------------- */
const adapters = {
  danbooru: new Danbooru(httpGetJson, httpPostForm, httpDelete),
  moebooru: new Moebooru(httpGetJson, httpPostForm),
  gelbooru: new Gelbooru(httpGetJson, httpGetText),
  e621: new E621(httpGetJson),
  derpibooru: new Derpibooru(httpGetJson)
};

/* --------------------------------- IPC --------------------------------- */
// Config
ipcMain.handle('config:load', async () => readConfig());
ipcMain.handle('config:save', async (_evt, cfg) => { writeConfig(cfg); return { ok: true }; });

// Fetch posts
ipcMain.handle('booru:fetch', async (_evt, payload) => {
  const { site, viewType, cursor, limit = 40, search = '' } = payload || {};
  if (isDev) console.log('[IPC] booru:fetch', { type: site?.type, baseUrl: site?.baseUrl, viewType, limit, search });
  try {
    if (!site || !site.type || !adapters[site.type]) throw new Error(`Unsupported site type: ${site?.type}`);
    const adapter = adapters[site.type];
    const res = (viewType === 'new')
      ? await adapter.fetchNew(site, { cursor, limit, search })
      : (viewType === 'popular')
        ? await adapter.fetchPopular(site, { cursor, limit, search })
        : (() => { throw new Error(`Unsupported viewType: ${viewType}`); })();
    if (isDev) console.log('[IPC] booru:fetch done', site?.type, 'posts:', res?.posts?.length || 0);
    return res;
  } catch (err) {
    if (isDev) console.error('[IPC] booru:fetch error', site?.type, err);
    return { posts: [], nextCursor: cursor || null, error: String(err?.message || err) };
  }
});

// Open external
ipcMain.handle('openExternal', async (_evt, url) => { if (!url) return false; await shell.openExternal(url); return true; });

// Download image
ipcMain.handle('download:image', async (_evt, payload) => {
  const { url, siteName = 'unknown', fileName = '' } = payload || {};
  if (!url) return { ok: false, error: 'No URL' };

  const defaultDir = app.getPath('downloads');
  const suggested = path.join(defaultDir, 'StreamBooru', siteName.replace(/[^\w.-]+/g, '_'), fileName || path.basename(new URL(url).pathname));
  const savePath = dialog.showSaveDialogSync(win, { title: 'Save Image', defaultPath: suggested });
  if (!savePath) return { ok: false, cancelled: true };

  await fs.promises.mkdir(path.dirname(savePath), { recursive: true });

  const refererMap = new Map([
    ['cdn.donmai.us', 'https://danbooru.donmai.us/'],
    ['danbooru.donmai.us', 'https://danbooru.donmai.us/'],
    ['files.yande.re', 'https://yande.re/'],
    ['konachan.com', 'https://konachan.com/'],
    ['konachan.net', 'https://konachan.net/'],
    ['static1.e621.net', 'https://e621.net/'],
    ['e621.net', 'https://e621.net/'],
    ['static1.e926.net', 'https://e926.net/'],
    ['e926.net', 'https://e926.net/'],
    ['derpicdn.net', 'https://derpibooru.org/'],
    ['derpibooru.org', 'https://derpibooru.org/']
  ]);

  await new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = net.request({ url, method: 'GET' });
    const referer = refererMap.get(u.hostname);
    applyDefaultHeaders(req, url, referer ? { Referer: referer } : {});
    const file = fs.createWriteStream(savePath);
    req.on('response', (res) => {
      res.pipe(file);
      res.on('end', resolve);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });

  return { ok: true, path: savePath };
});

// Bulk download
ipcMain.handle('download:bulk', async (_evt, payload) => {
  const { items = [], options = {} } = payload || {};
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'No items to download' };
  }

  const baseDir = dialog.showOpenDialogSync(win, {
    title: 'Choose folder to save images',
    properties: ['openDirectory', 'createDirectory']
  });
  if (!baseDir || !baseDir[0]) return { ok: false, cancelled: true };
  const basePath = baseDir[0];

  const refererMap = new Map([
    ['cdn.donmai.us', 'https://danbooru.donmai.us/'],
    ['danbooru.donmai.us', 'https://danbooru.donmai.us/'],
    ['files.yande.re', 'https://yande.re/'],
    ['konachan.com', 'https://konachan.com/'],
    ['konachan.net', 'https://konachan.net/'],
    ['static1.e621.net', 'https://e621.net/'],
    ['e621.net', 'https://e621.net/'],
    ['static1.e926.net', 'https://e926.net/'],
    ['e926.net', 'https://e926.net/'],
    ['derpicdn.net', 'https://derpibooru.org/'],
    ['derpibooru.org', 'https://derpibooru.org/']
  ]);

  const sanitize = (s) => String(s || '').replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_').slice(0, 200);
  const subfolder = !!options.subfolderBySite;

  const concurrency = Number(options.concurrency || 3);
  let index = 0;
  const results = [];
  await fs.promises.mkdir(basePath, { recursive: true });

  const worker = async () => {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      const it = items[i];
      try {
        const u = new URL(it.url);
        const siteFolder = subfolder ? sanitize(it.siteName || u.hostname || 'unknown') : '';
        const targetDir = siteFolder ? path.join(basePath, siteFolder) : basePath;
        await fs.promises.mkdir(targetDir, { recursive: true });

        const filename = sanitize(it.fileName || path.basename(u.pathname) || `file_${i}`);
        const outPath = path.join(targetDir, filename);

        await new Promise((resolve, reject) => {
          const req = net.request({ url: it.url, method: 'GET' });
          const ref = refererMap.get(u.hostname);
          req.setHeader('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36 StreamBooru/Electron');
          req.setHeader('Accept', '*/*');
          req.setHeader('Accept-Language', 'en-US,en;q=0.9');
          if (ref) req.setHeader('Referer', ref);

          const file = fs.createWriteStream(outPath);
          req.on('response', (res) => {
            res.pipe(file);
            res.on('end', resolve);
            res.on('error', reject);
          });
          req.on('error', reject);
          req.end();
        });

        results.push({ i, ok: true, path: outPath });
      } catch (e) {
        results.push({ i, ok: false, error: String(e?.message || e) });
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  const saved = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  return { ok: true, saved, failed, basePath };
});

// Favorites (remote APIs for sites)
ipcMain.handle('booru:favorite', async (_evt, payload) => {
  const { site, postId, action } = payload || {};
  if (!site || !site.type || !adapters[site.type]) return { ok: false, error: 'Unsupported site' };
  try {
    const adapter = adapters[site.type];
    if (typeof adapter.favorite !== 'function') return { ok: false, error: 'Favorites not supported for this site' };
    const result = await adapter.favorite(site, postId, action);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// Image proxy (data URL)
ipcMain.handle('image:proxy', async (_evt, { url }) => {
  if (!url) return { ok: false, error: 'No URL' };

  const refererMap = new Map([
    ['cdn.donmai.us', 'https://danbooru.donmai.us/'],
    ['danbooru.donmai.us', 'https://danbooru.donmai.us/'],
    ['files.yande.re', 'https://yande.re/'],
    ['konachan.com', 'https://konachan.com/'],
    ['konachan.net', 'https://konachan.net/'],
    ['static1.e621.net', 'https://e621.net/'],
    ['e621.net', 'https://e621.net/'],
    ['static1.e926.net', 'https://e926.net/'],
    ['e926.net', 'https://e926.net/'],
    ['derpicdn.net', 'https://derpibooru.org/'],
    ['derpibooru.org', 'https://derpibooru.org/']
  ]);

  return await new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = net.request({ url, method: 'GET' });
      const referer = refererMap.get(u.hostname);
      applyDefaultHeaders(req, url, referer ? { Referer: referer } : {});
      const chunks = [];
      let contentType = 'image/jpeg';
      req.on('response', (res) => {
        const ct = res.headers['content-type'] || res.headers['Content-Type'];
        if (ct) contentType = Array.isArray(ct) ? ct[0] : ct;
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const dataUrl = `data:${contentType};base64,${buf.toString('base64')}`;
          resolve({ ok: true, dataUrl });
        });
        res.on('error', (e) => resolve({ ok: false, error: String(e) }));
      });
      req.on('error', (e) => resolve({ ok: false, error: String(e) }));
      req.end();
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
});

// Auth check (optional per adapter)
ipcMain.handle('booru:authCheck', async (_evt, payload) => {
  const { site } = payload || {};
  if (!site || !site.type || !adapters[site.type]) return { supported: false, ok: false, reason: 'Unsupported site' };
  const adapter = adapters[site.type];
  if (typeof adapter.authCheck !== 'function') return { supported: false, ok: false, reason: 'Not implemented' };
  try {
    const res = await adapter.authCheck(site);
    return { supported: true, ok: !!res?.ok, info: res?.info || null };
  } catch (e) {
    return { supported: true, ok: false, reason: String(e?.message || e) };
  }
});

// Danbooru rate limit headers (if needed)
ipcMain.handle('booru:rateLimit', async (_evt, payload) => {
  const { site } = payload || {};
  if (!site || site.type !== 'danbooru') return { ok: false, reason: 'Rate limit only for Danbooru' };
  const base = (site.baseUrl || '').replace(/\/+$/, '');
  const params = new URLSearchParams();
  params.set('limit', '1');
  if (site.credentials?.login && site.credentials?.api_key) {
    params.set('login', site.credentials.login);
    params.set('api_key', site.credentials.api_key);
  }
  const url = `${base}/posts.json?${params.toString()}`;

  return await new Promise((resolve) => {
    try {
      const req = net.request({ url, method: 'GET' });
      applyDefaultHeaders(req, url, { Accept: 'application/json' });
      req.on('response', (res) => {
        const headers = {};
        Object.entries(res.headers || {}).forEach(([k, v]) => {
          headers[String(k).toLowerCase()] = Array.isArray(v) ? v[0] : String(v);
        });
        const getH = (n) => headers[n] || headers[n.replace('ratelimit', 'rate-limit')] || null;
        const limit = Number(getH('x-ratelimit-limit')) || Number(getH('x-rate-limit-limit')) || null;
        const remaining = Number(getH('x-ratelimit-remaining')) || Number(getH('x-rate-limit-remaining')) || null;
        const reset = Number(getH('x-ratelimit-reset')) || Number(getH('x-rate-limit-reset')) || null;
        res.on('data', () => {});
        res.on('end', () => resolve({ ok: true, headers, limit, remaining, reset, status: res.statusCode || 0 }));
      });
      req.on('error', (e) => resolve({ ok: false, reason: String(e) }));
      req.end();
    } catch (e) {
      resolve({ ok: false, reason: String(e) });
    }
  });
});

/* --------------------------- Local favorites IPC --------------------------- */
ipcMain.handle('favorites:keys', async () => {
  const items = loadFavorites();
  return items.map((x) => x.key);
});

ipcMain.handle('favorites:list', async () => {
  const items = loadFavorites();
  return items
    .slice()
    .sort((a, b) => (b.added_at || 0) - (a.added_at || 0))
    .map((x) => ({ ...x.post, _added_at: x.added_at || 0 }));
});

async function pushFavoriteRemote(key, post, added_at) {
  const acc = readAccount();
  if (!acc.serverBase || !acc.token) return { ok: false, skipped: true };
  try {
    const url = `${acc.serverBase.replace(/\/+$/,'')}/api/favorites/${encodeURIComponent(key)}`;
    const req = net.request({ url, method: 'PUT' });
    applyDefaultHeaders(req, url, { 'Content-Type': 'application/json', Authorization: `Bearer ${acc.token}` });
    const body = JSON.stringify({ post, added_at: added_at || Date.now() });
    return await new Promise((resolve) => {
      req.on('response', (res) => { res.on('data', ()=>{}); res.on('end', ()=> resolve({ ok: res.statusCode < 400 })); });
      req.on('error', ()=> resolve({ ok: false }));
      req.write(body);
      req.end();
    });
  } catch { return { ok: false }; }
}

ipcMain.handle('favorites:toggle', async (_evt, { post }) => {
  if (!post || !post.id) return { ok: false, error: 'No post' };
  const key = favKey(post);
  const now = Date.now();
  const items = loadFavorites();
  const idx = items.findIndex((it) => it.key === key);
  if (idx >= 0) {
    items.splice(idx, 1);
    saveFavorites(items);
    return { ok: true, favorited: false, key };
  }
  items.push({ key, added_at: now, post });
  saveFavorites(items);
  // optional remote push if logged in
  setImmediate(() => pushFavoriteRemote(key, post, now));
  return { ok: true, favorited: true, key, added_at: now };
});

ipcMain.handle('favorites:clear', async () => { saveFavorites([]); return { ok: true }; });

/* --------------------------- Account + Sync IPC --------------------------- */
ipcMain.handle('account:get', async () => {
  const acc = readAccount();
  return { serverBase: acc.serverBase || 'https://streambooru.co.uk', token: acc.token || '', user: acc.user || null, loggedIn: !!(acc.token) };
});

ipcMain.handle('account:setServer', async (_evt, base) => {
  const acc = readAccount();
  const val = String(base || '').trim() || 'https://streambooru.co.uk';
  acc.serverBase = val;
  writeAccount(acc);
  return { ok: true, serverBase: acc.serverBase };
});

ipcMain.handle('account:logout', async () => {
  const acc = readAccount();
  writeAccount({ serverBase: acc.serverBase || 'https://streambooru.co.uk', token: '', user: null });
  return { ok: true };
});

ipcMain.handle('account:loginLocal', async (_evt, { username, password }) => {
  const acc = readAccount();
  const serverBase = (acc.serverBase || '').replace(/\/+$/,'');
  if (!serverBase) return { ok: false, error: 'Set server base URL first' };
  if (!username || !password) return { ok: false, error: 'Missing username/password' };

  try {
    const url = `${serverBase}/auth/local/login`;
    const req = net.request({ url, method: 'POST' });
    applyDefaultHeaders(req, url, { 'Content-Type': 'application/json', Accept: 'application/json' });
    const body = JSON.stringify({ username, password });
    let data = '';
    const result = await new Promise((resolve) => {
      req.on('response', (res) => {
        res.on('data', (c)=> data += c);
        res.on('end', ()=> resolve({ status: res.statusCode || 0 }));
      });
      req.on('error', ()=> resolve({ status: 0 }));
      req.write(body);
      req.end();
    });
    if (result.status >= 400 || result.status === 0) return { ok: false, error: 'Login failed' };
    let parsed = {};
    try { parsed = JSON.parse(data); } catch {}
    const token = parsed.token || parsed.jwt || '';
    if (!token) return { ok: false, error: 'No token returned' };

    const a = readAccount();
    a.token = token;
    writeAccount(a);

    try {
      const meUrl = `${serverBase}/api/me`;
      const r = await httpGetJson(meUrl, { Authorization: `Bearer ${token}` });
      if (r?.ok && r.user) { a.user = r.user; writeAccount(a); }
    } catch {}
    return { ok: true, user: readAccount().user || null };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('account:loginDiscord', async () => {
  const acc = readAccount();
  const serverBase = (acc.serverBase || '').replace(/\/+$/,'');
  if (!serverBase) return { ok: false, error: 'Set server base URL first' };

  const srv = http.createServer((req, res) => {
    try {
      const u = new URL(req.url, `http://${req.headers.host}`);
      if (u.pathname === '/callback') {
        const token = u.searchParams.get('token') || '';
        if (token) {
          const a = readAccount();
          a.token = token;
          writeAccount(a);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<h3>Login complete. You can close this window.</h3>');
          srv.close();
          return;
        }
      }
      res.statusCode = 400; res.end('Bad request');
    } catch {
      res.statusCode = 500; res.end('Error');
    }
  });

  const listenP = new Promise((resolve, reject) => {
    srv.listen(0, '127.0.0.1', () => resolve());
    srv.on('error', reject);
  });
  await listenP;
  const port = srv.address().port;
  const redirect = `http://127.0.0.1:${port}/callback`;
  const url = `${serverBase}/auth/discord?redirect_uri=${encodeURIComponent(redirect)}`;
  await shell.openExternal(url);

  const result = await new Promise((resolve) => {
    const t = setTimeout(() => { try { srv.close(); } catch {} resolve({ ok: false, error: 'Timeout' }); }, 120000);
    srv.on('close', async () => {
      clearTimeout(t);
      const a = readAccount();
      if (!a.token) return resolve({ ok: false, error: 'Login failed' });
      try {
        const meUrl = `${serverBase}/api/me`;
        const r = await httpGetJson(meUrl, { Authorization: `Bearer ${a.token}` });
        if (r?.ok && r.user) { a.user = r.user; writeAccount(a); }
      } catch {}
      resolve({ ok: true, user: readAccount().user || null });
    });
  });

  return result;
});

ipcMain.handle('sync:fav:pull', async () => {
  const acc = readAccount();
  if (!acc.serverBase || !acc.token) return { ok: false, error: 'Not logged in' };
  try {
    const url = `${acc.serverBase.replace(/\/+$/,'')}/api/favorites`;
    const req = net.request({ url, method: 'GET' });
    applyDefaultHeaders(req, url, { Accept: 'application/json', Authorization: `Bearer ${acc.token}` });
    let data = '';
    const items = await new Promise((resolve, reject) => {
      req.on('response', (res) => {
        res.on('data', (c) => data += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (!j?.ok) return reject(new Error('Server error'));
            resolve(Array.isArray(j.items) ? j.items : []);
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.end();
    });
    const local = loadFavorites();
    const byKey = new Map(local.map(x => [x.key, x]));
    let added = 0;
    for (const it of items) {
      if (!byKey.has(it.key) && it.post) {
        byKey.set(it.key, { key: it.key, added_at: Number(it.added_at) || Date.now(), post: it.post });
        added++;
      }
    }
    saveFavorites([...byKey.values()]);
    return { ok: true, added };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('sync:fav:push', async () => {
  const acc = readAccount();
  if (!acc.serverBase || !acc.token) return { ok: false, error: 'Not logged in' };
  try {
    const items = loadFavorites();
    const url = `${acc.serverBase.replace(/\/+$/,'')}/api/favorites/bulk_upsert`;
    const req = net.request({ url, method: 'POST' });
    applyDefaultHeaders(req, url, { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${acc.token}` });
    const body = JSON.stringify({ items });
    const res = await new Promise((resolve) => {
      let data = '';
      req.on('response', (r) => { r.on('data', (c)=> data += c); r.on('end', ()=> resolve({ status: r.statusCode || 0, body: data })); });
      req.on('error', ()=> resolve({ status: 0, body: '' }));
      req.write(body);
      req.end();
    });
    if (res.status >= 400) return { ok: false, error: 'Server error' };
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});