const { app, BrowserWindow, ipcMain, net, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const Danbooru = require('../src/adapters/danbooru');
const Moebooru = require('../src/adapters/moebooru');
const Gelbooru = require('../src/adapters/gelbooru');
const Zerochan = require('../src/adapters/zerochan');

let win;

/* ------------------------------- Hotlink headers ------------------------------- */
function setupHotlinkHeaders(sess) {
  const rules = [
    { pattern: '*://cdn.donmai.us/*', referer: 'https://danbooru.donmai.us/' },
    { pattern: '*://danbooru.donmai.us/*', referer: 'https://danbooru.donmai.us/' },
    { pattern: '*://files.yande.re/*', referer: 'https://yande.re/' },
    { pattern: '*://konachan.com/*', referer: 'https://konachan.com/' },
    { pattern: '*://konachan.net/*', referer: 'https://konachan.net/' }
  ];
  rules.forEach(({ pattern, referer }) => {
    sess.webRequest.onBeforeSendHeaders({ urls: [pattern] }, (details, callback) => {
      const headers = { ...details.requestHeaders };
      headers['Referer'] = referer;
      if (!headers['User-Agent']) {
        headers['User-Agent'] =
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36 StreamBooru/Electron';
      }
      callback({ requestHeaders: headers });
    });
  });
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
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36 StreamBooru/0.3 Electron/31',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: url
  };
  const merged = { ...defaultHeaders, ...headers };
  Object.entries(merged).forEach(([k, v]) => request.setHeader(k, v));
}

function httpGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET' });
    applyDefaultHeaders(request, url, { Accept: 'application/json, text/json;q=0.9, */*;q=0.1', ...headers });
    let data = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        const status = response.statusCode || 0;
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
    request.on('error', reject);
    request.end();
  });
}

function httpGetText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET' });
    applyDefaultHeaders(request, url, headers);
    let data = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        const status = response.statusCode || 0;
        if (status >= 400) return reject(new Error(`HTTP ${status} from ${url}\nBody: ${data.slice(0,300)}...`));
        resolve(data);
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function httpPostForm(url, form, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams(form).toString();
    const request = net.request({ url, method: 'POST' });
    // Important: let Chromium set Content-Length automatically to avoid net::ERR_INVALID_ARGUMENT
    applyDefaultHeaders(request, url, { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json, text/json;q=0.9, */*;q=0.1', ...headers });
    let data = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        const status = response.statusCode || 0;
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
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        const status = response.statusCode || 0;
        if (status >= 400) return reject(new Error(`HTTP ${status} from ${url}\nBody: ${data.slice(0,300)}...`));
        try { resolve(JSON.parse(data)); } catch { resolve({ ok: true, raw: data }); }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

/* -------------------------------- Adapters -------------------------------- */
const adapters = {
  danbooru: new Danbooru(httpGetJson, httpPostForm, httpDelete),
  moebooru: new Moebooru(httpGetJson, httpPostForm),
  gelbooru: new Gelbooru(httpGetJson),
  zerochan: new Zerochan(httpGetText)
};

/* --------------------------------- IPC --------------------------------- */
// Config
ipcMain.handle('config:load', async () => readConfig());
ipcMain.handle('config:save', async (_evt, cfg) => { writeConfig(cfg); return { ok: true }; });

// Fetch posts
ipcMain.handle('booru:fetch', async (_evt, payload) => {
  const { site, viewType, cursor, limit = 40, search = '' } = payload || {};
  try {
    if (!site || !site.type || !adapters[site.type]) throw new Error(`Unsupported site type: ${site?.type}`);
    const adapter = adapters[site.type];
    if (viewType === 'new') return await adapter.fetchNew(site, { cursor, limit, search });
    if (viewType === 'popular') return await adapter.fetchPopular(site, { cursor, limit, search });
    throw new Error(`Unsupported viewType: ${viewType}`);
  } catch (err) {
    return { posts: [], nextCursor: cursor || null, error: String(err?.message || err) };
  }
});

// Open external
ipcMain.handle('openExternal', async (_evt, url) => { if (!url) return false; await shell.openExternal(url); return true; });

// Download image (with referer)
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
    ['konachan.net', 'https://konachan.net/']
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

// Favorites (remote)
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
    ['konachan.net', 'https://konachan.net/']
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

// Auth check (adapters implement)
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

// NEW: Danbooru rate limit check via headers
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
        // Normalize headers to lower-case string values
        const headers = {};
        Object.entries(res.headers || {}).forEach(([k, v]) => {
          headers[String(k).toLowerCase()] = Array.isArray(v) ? v[0] : String(v);
        });

        // Danbooru may use either x-ratelimit-* or x-rate-limit-*
        const getH = (n) => headers[n] || headers[n.replace('ratelimit', 'rate-limit')] || null;

        const limit = Number(getH('x-ratelimit-limit')) || Number(getH('x-rate-limit-limit')) || null;
        const remaining = Number(getH('x-ratelimit-remaining')) || Number(getH('x-rate-limit-remaining')) || null;
        const reset = Number(getH('x-ratelimit-reset')) || Number(getH('x-rate-limit-reset')) || null;

        // Drain body (not used)
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
  return { ok: true, favorited: true, key, added_at: now };
});

ipcMain.handle('favorites:clear', async () => { saveFavorites([]); return { ok: true }; });
