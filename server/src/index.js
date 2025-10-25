require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { EventEmitter } = require('events');
const { exec } = require('child_process');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const crypto = require('crypto');
const path = require('path');

const { query, pool } = require('./db');
const { enc, dec } = require('./crypto');
const { sanitizeSiteInput, sanitizeFavoriteKey, clampPost } = require('./sanitize');

const app = express();
app.set('trust proxy', true);

/* body parser (tolerant) */
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') { req.body = {}; return next(); }
  const max = 1024 * 1024;
  let size = 0; const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > max) { try { req.pause(); } catch {} res.status(413).send('Payload too large'); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    req.rawBody = raw;
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    let obj = {};
    const tryJson = () => { try { obj = JSON.parse(raw); } catch {} };
    const tryForm = () => { try { obj = Object.fromEntries(new URLSearchParams(raw)); } catch {} };
    if (!raw || !raw.trim()) { req.body = {}; return next(); }
    if (ct.includes('application/json')) { tryJson(); if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !Object.keys(obj).length) tryForm(); }
    else if (ct.includes('application/x-www-form-urlencoded')) { tryForm(); if (!obj || typeof obj !== 'object' || Array.isArray(obj)) tryJson(); }
    else { tryJson(); if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !Object.keys(obj).length) tryForm(); }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) obj = {};
    req.body = obj; next();
  });
  req.on('error', () => next());
});

/* log */
app.use((req, _res, next) => { try { console.log(`${req.method} ${req.url}`); } catch {} next(); });

/* config */
const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || '0.0.0.0');
const STATIC_BASE_URL = String(process.env.BASE_URL || '').replace(/\/+$/, '');
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

/* utils */
function publicBase(req) {
  if (STATIC_BASE_URL) return STATIC_BASE_URL;
  const host = String(req.headers['host'] || '').trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  if (!host) return `${proto}://localhost:${PORT}`;
  return `${proto}://${host}`;
}
function oauthRedirectBase(req) { return `${publicBase(req)}/auth/discord/callback`; }
function signToken(user) { return jwt.sign({ sub: user.id, name: user.username || '', avatar: user.avatar || '' }, JWT_SECRET, { expiresIn: '90d' }); }
function auth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const m = /^Bearer\s+(.+)$/.exec(h);
    if (!m) return res.status(401).json({ ok: false, error: 'missing token' });
    const decd = jwt.verify(m[1], JWT_SECRET);
    req.user = { id: decd.sub, name: decd.name || '', avatar: decd.avatar || '' };
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'invalid token' });
  }
}
function cryptoRandomId() { return crypto.randomBytes(16).toString('hex'); }
function isAllowedDeepLink(url) { return url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost') || url.startsWith('streambooru://'); }
function bodyObj(req) { const b = req.body; return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; }
function extractCreds(req) {
  const b = bodyObj(req);
  let u = (b.username ?? req.query?.username ?? req.headers['x-username'] ?? '').toString().trim();
  let p = (b.password ?? req.query?.password ?? req.headers['x-password'] ?? '').toString();
  if (!u || !p) {
    const h = String(req.headers.authorization || '');
    const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(h);
    if (m) {
      try {
        const raw = Buffer.from(m[1], 'base64').toString('utf8');
        const idx = raw.indexOf(':');
        if (idx >= 0) {
          const u2 = raw.slice(0, idx);
          const p2 = raw.slice(idx + 1);
          if (!u) u = u2; if (!p) p = p2;
        }
      } catch {}
    }
  }
  return { username: String(u || '').trim(), password: String(p || '') };
}

/* legacy password helpers */
function looksBcrypt(s) { return typeof s === 'string' && /^\$2[aby]\$[0-9]{2}\$/.test(s); }
function tryDec(value) { try { return dec(value); } catch { return null; } }
function unwrapHashFromDec(d) {
  if (!d) return null;
  if (typeof d === 'string') return d;
  if (typeof d === 'object' && typeof d.hash === 'string') return d.hash;
  return null;
}
async function verifyAndMaybeMigrateToRaw(userId, submittedPassword, storedValue) {
  const decd = tryDec(storedValue);
  const decHash = unwrapHashFromDec(decd);

  if (looksBcrypt(decHash)) {
    const ok = await bcrypt.compare(submittedPassword, decHash);
    if (ok) {
      try { await query('UPDATE users SET password_hash = $1 WHERE id = $2', [decHash, userId]); } catch {}
    }
    return ok;
  }
  if (typeof decHash === 'string' && decHash) {
    if (decd === submittedPassword || decHash === submittedPassword) {
      const newHash = await bcrypt.hash(submittedPassword, 12);
      try { await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]); } catch {}
      return true;
    }
  }
  if (looksBcrypt(storedValue)) {
    return await bcrypt.compare(submittedPassword, storedValue);
  }
  if (typeof storedValue === 'string' && storedValue) {
    if (storedValue === submittedPassword) {
      const newHash = await bcrypt.hash(submittedPassword, 12);
      try { await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]); } catch {}
      return true;
    }
  }
  return false;
}

/* per-user bus */
const userBus = new Map();
function chanFor(uid) { if (!userBus.has(uid)) userBus.set(uid, new EventEmitter()); return userBus.get(uid); }
function emitTo(uid, event, payload) { try { chanFor(uid).emit('event', { event, payload, ts: Date.now() }); } catch {} }

/* migrations */
async function runMigrations() {
  const steps = [
    `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_hash TEXT`,
    `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS discord_id TEXT`,
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_username_uniq')
       THEN EXECUTE 'CREATE UNIQUE INDEX users_username_uniq ON users((lower(username)))'; END IF;
     END$$;`,
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_discord_id_uniq')
       THEN EXECUTE 'CREATE UNIQUE INDEX users_discord_id_uniq ON users(discord_id) WHERE discord_id IS NOT NULL'; END IF;
     END$$;`
  ];
  for (const sql of steps) { try { await query(sql); } catch (e) { console.error('[migrations]', e?.message || e); } }
}

/* health */
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

/* local accounts */
app.post('/auth/local/register', async (req, res) => {
  try {
    const b = bodyObj(req);
    const username = String(b.username || '').trim();
    const password = String(b.password || '');
    if (!username || username.length < 3) return res.status(400).json({ ok: false, error: 'bad username' });
    if (!password || password.length < 6) return res.status(400).json({ ok: false, error: 'bad password' });

    const rs = await query('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username]);
    if (rs.rowCount > 0) return res.status(409).json({ ok: false, error: 'username taken' });

    const id = 'local:' + cryptoRandomId();
    const hash = await bcrypt.hash(password, 12);
    const created_at = Date.now();
    await query(`INSERT INTO users (id, username, avatar, created_at, password_hash) VALUES ($1, $2, '', $3, $4)`,
      [id, username, created_at, hash]);

    const token = signToken({ id, username, avatar: '' });
    res.json({ ok: true, token });
  } catch (e) {
    console.error('Register error:', e?.message || e);
    res.status(500).json({ ok: false });
  }
});

app.post('/auth/local/login', async (req, res) => {
  try {
    const { username, password } = extractCreds(req);
    if (!username || !password) return res.status(400).json({ ok: false, error: 'missing credentials' });

    const r = await query(
      `SELECT id, username, avatar, password_hash
       FROM users
       WHERE lower(username) = lower($1) OR id = $1
       LIMIT 1`,
      [username]
    );
    const row = r.rows[0];
    if (!row) return res.status(401).json({ ok: false, error: 'invalid credentials' });

    const stored = row.password_hash;
    if (!stored) return res.status(409).json({ ok: false, error: 'no password set' });

    const ok = await verifyAndMaybeMigrateToRaw(row.id, password, stored);
    if (!ok) return res.status(401).json({ ok: false, error: 'invalid credentials' });

    const token = signToken({ id: row.id, username: row.username, avatar: row.avatar || '' });
    res.json({ ok: true, token });
  } catch (e) {
    console.error('Login error:', e?.message || e);
    res.status(500).json({ ok: false, error: 'server error' });
  }
});

app.post('/auth/local/set_password', auth, async (req, res) => {
  try {
    const b = bodyObj(req);
    const password = String(b.password || req.query?.password || req.headers['x-password'] || '');
    if (!password || password.length < 6) return res.status(400).json({ ok: false, error: 'bad password' });
    const hash = await bcrypt.hash(password, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Set password error:', e?.message || e);
    res.status(500).json({ ok: false });
  }
});

/* discord oauth */
app.get('/auth/discord', (req, res) => {
  const oauthRedirect = oauthRedirectBase(req);
  const next = String(req.query.redirect_uri || '').trim();
  const stateToken = jwt.sign({ purpose: 'login', next, iat: Math.floor(Date.now() / 1000) }, JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: oauthRedirect,
    response_type: 'code',
    scope: 'identify',
    prompt: 'consent',
    state: stateToken
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

app.get('/api/link/discord/start', auth, async (req, res) => {
  try {
    const oauthRedirect = oauthRedirectBase(req);
    const next = String(req.query.next || '').trim();
    const stateToken = jwt.sign({ purpose: 'link', linkTo: req.user.id, next, iat: Math.floor(Date.now() / 1000) }, JWT_SECRET, { expiresIn: '10m' });
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: oauthRedirect,
      response_type: 'code',
      scope: 'identify',
      prompt: 'consent',
      state: stateToken
    });
    res.json({ ok: true, url: `https://discord.com/api/oauth2/authorize?${params.toString()}` });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get('/auth/discord/callback', async (req, res) => {
  try {
    const oauthRedirect = oauthRedirectBase(req);
    const code = String(req.query.code || '');
    const stateRaw = String(req.query.state || '');
    if (!code) return res.status(400).send('Missing code');
    let state = {}; try { state = jwt.verify(stateRaw, JWT_SECRET); } catch { state = {}; }

    const tokRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: oauthRedirect })
    });
    if (!tokRes.ok) return res.status(400).send('Token exchange failed');
    const tokJson = await tokRes.json();
    const access_token = tokJson.access_token;
    if (!access_token) return res.status(400).send('No access_token');

    const meRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
    if (!meRes.ok) return res.status(400).send('Failed to fetch user');
    const me = await meRes.json();
    const discordId = String(me.id);
    const profile = { username: me.username || '', avatar: me.avatar || '' };

    if (state.purpose === 'link' && state.linkTo) {
      try { await query('UPDATE users SET discord_id = $1, username = COALESCE(username, $2) WHERE id = $3', [discordId, profile.username, state.linkTo]); }
      catch { return res.status(409).send('This Discord is already linked to another account.'); }
      const next = String(state.next || '');
      if (isAllowedDeepLink(next)) { const u = new URL(next); u.searchParams.set('linked', '1'); return res.redirect(u.toString()); }
      return res.status(200).send('Discord account linked. You can close this window.');
    }

    const found = await query('SELECT id, username, avatar FROM users WHERE discord_id = $1', [discordId]);
    let userId;
    if (found.rowCount > 0) {
      userId = found.rows[0].id;
      await query('UPDATE users SET username = $1, avatar = $2 WHERE id = $3', [profile.username, profile.avatar, userId]);
    } else {
      userId = `discord:${discordId}`;
      const created_at = Date.now();
      await query(`INSERT INTO users (id, username, avatar, created_at, discord_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
        [userId, profile.username, profile.avatar, created_at, discordId]);
    }
    const jwtToken = signToken({ id: userId, username: profile.username, avatar: profile.avatar });

    const next = String(state.next || '');
    if (isAllowedDeepLink(next)) { const u = new URL(next); u.searchParams.set('token', jwtToken); return res.redirect(u.toString()); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8" />
<title>StreamBooru Login Success</title>
<style>body{font-family:system-ui;margin:2rem;color:#222}code{background:#eee;padding:4px 6px;border-radius:6px}</style>
<h2>Login successful</h2>
<p>Copy this token into the app:</p>
<p><code>${jwtToken}</code></p>`);
  } catch (e) {
    console.error('Discord callback error:', e?.message || e);
    res.status(500).send('Auth error');
  }
});

/* user/me */
app.get('/api/me', auth, async (req, res) => {
  const r = await query('SELECT id, username, avatar, discord_id FROM users WHERE id = $1', [req.user.id]);
  const u = r.rows[0] || { id: req.user.id, username: req.user.name, avatar: '' };
  res.json({ ok: true, user: { id: u.id, name: u.username || '', avatar: u.avatar || '', discord_id: u.discord_id || null } });
});

/* favorites */
app.get('/api/favorites/keys', auth, async (req, res) => {
  const r = await query('SELECT key FROM favorites WHERE user_id = $1 ORDER BY added_at DESC', [req.user.id]);
  res.json({ ok: true, keys: r.rows.map(x => x.key) });
});
app.get('/api/favorites', auth, async (req, res) => {
  const r = await query('SELECT key, added_at, post_json FROM favorites WHERE user_id = $1 ORDER BY added_at DESC', [req.user.id]);
  const items = r.rows.map(row => ({ key: row.key, added_at: Number(row.added_at) || 0, post: row.post_json })).filter(x => x.post);
  res.json({ ok: true, items });
});
app.put('/api/favorites/:key', auth, async (req, res) => {
  try {
    const key = sanitizeFavoriteKey(req.params.key);
    const post = clampPost(bodyObj(req)?.post);
    if (!key || !post) return res.status(400).json({ ok: false, error: 'bad key/post' });
    const added_at = Number(bodyObj(req)?.added_at) || Date.now();
    await query(`
      INSERT INTO favorites (user_id, key, added_at, post_json)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT(user_id, key) DO UPDATE SET added_at = EXCLUDED.added_at, post_json = EXCLUDED.post_json
    `, [req.user.id, key, added_at, post]);
    emitTo(req.user.id, 'fav_changed', { key, added_at });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});
app.delete('/api/favorites/:key', auth, async (req, res) => {
  try {
    const key = sanitizeFavoriteKey(req.params.key);
    if (!key) return res.status(400).json({ ok: false, error: 'bad key' });
    await query('DELETE FROM favorites WHERE user_id = $1 AND key = $2', [req.user.id, key]);
    emitTo(req.user.id, 'fav_changed', { key, removed: true });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});
app.post('/api/favorites/bulk_upsert', auth, async (req, res) => {
  try {
    const b = bodyObj(req);
    const items = Array.isArray(b.items) ? b.items : [];
    const now = Date.now();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const it of items) {
        const key = sanitizeFavoriteKey(it?.key);
        const post = clampPost(it?.post);
        if (!key || !post) continue;
        const added_at = Number(it?.added_at) || now;
        await client.query(`
          INSERT INTO favorites (user_id, key, added_at, post_json)
          VALUES ($1, $2, $3, $4::jsonb)
          ON CONFLICT(user_id, key) DO UPDATE SET added_at = EXCLUDED.added_at, post_json = EXCLUDED.post_json
        `, [req.user.id, key, added_at, post]);
      }
      await client.query('COMMIT');
    } catch (e) { try { await client.query('ROLLBACK'); } catch {} throw e; }
    finally { client.release(); }
    emitTo(req.user.id, 'fav_changed', { bulk: true, count: items.length, at: Date.now() });
    res.json({ ok: true, upserted: items.length });
  } catch {
    res.status(500).json({ ok: false });
  }
});

/* sites */
app.get('/api/sites', auth, async (req, res) => {
  const r = await query(`
    SELECT site_id, name, type, base_url, rating, tags, credentials_enc, order_index
    FROM user_sites WHERE user_id = $1 ORDER BY order_index ASC, created_at ASC
  `, [req.user.id]);
  const sites = r.rows.map(row => {
    const creds = dec(row.credentials_enc) || {};
    return {
      id: row.site_id,
      name: row.name,
      type: row.type,
      baseUrl: row.base_url,
      rating: row.rating,
      tags: row.tags,
      credentials: creds,
      order_index: row.order_index
    };
  });
  res.json({ ok: true, sites });
});
app.put('/api/sites', auth, async (req, res) => {
  try {
    const listRaw = bodyObj(req)?.sites;
    const list = Array.isArray(listRaw) ? listRaw : [];
    if (list.length > 100) return res.status(400).json({ ok: false, error: 'too many sites' });
    const sanitized = list.map(sanitizeSiteInput).filter(s => s.type && s.base_url);
    const now = Date.now();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_sites WHERE user_id = $1', [req.user.id]);
      for (let i = 0; i < sanitized.length; i++) {
        const s = sanitized[i];
        const credsEnc = enc(s.credentials || {});
        const site_id = cryptoRandomId();
        await client.query(`
          INSERT INTO user_sites (site_id, user_id, name, type, base_url, rating, tags, credentials_enc, order_index, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
        `, [site_id, req.user.id, s.name, s.type, s.base_url, s.rating, s.tags, credsEnc, i, now, now]);
      }
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      if (String(e.message || '').includes('user_sites_user_type_base_uniq')) {
        return res.status(409).json({ ok: false, error: 'duplicate site (type+baseUrl)' });
      }
      throw e;
    } finally { client.release(); }
    emitTo(req.user.id, 'sites_changed', { count: sanitized.length, at: Date.now() });
    res.json({ ok: true, count: sanitized.length });
  } catch {
    res.status(500).json({ ok: false });
  }
});

/* SSE */
app.get('/api/stream', auth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const uid = req.user.id;
  const ch = chanFor(uid);

  const send = (event, data) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data || {})}\n\n`);
    } catch {}
  };

  const onEvt = (e) => send(e.event, e.payload || {});
  ch.on('event', onEvt);

  const ping = setInterval(() => send('ping', { ts: Date.now() }), 25000);
  req.on('close', () => { clearInterval(ping); ch.off('event', onEvt); });

  send('hello', { ok: true, ts: Date.now() });
});

/* webhook */
function verifyWebhook(req, res, next) {
  try {
    const signature = req.headers['x-hub-signature'];
    const payload = JSON.stringify(req.body || {});
    if (!signature || !WEBHOOK_SECRET) return res.status(403).json({ error: 'Unauthorized' });
    const hmac = crypto.createHmac('sha1', WEBHOOK_SECRET);
    const digest = Buffer.from('sha1=' + hmac.update(payload).digest('hex'), 'utf8');
    const checksum = Buffer.from(signature, 'utf8');
    if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
  } catch { return res.status(403).json({ error: 'Unauthorized' }); }
}
app.post('/webhook', verifyWebhook, (req, res) => {
  try {
    const payload = req.body || {};
    const ref = String(payload.ref || '');
    const branch = ref.split('/').pop();
    if (branch !== 'dev' && branch !== 'master') {
      return res.status(200).send('Webhook received but not for the dev or master branch.');
    }
    const deployScript = path.join(__dirname, 'deploy.sh');
    console.log(`Webhook received for ${branch} branch. Deploying...`);
    exec(`${deployScript} ${branch}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`deploy.sh (${branch}) error:`, error.message);
        return res.status(500).send(`Deployment script for ${branch} failed`);
      }
      if (stderr) console.error(`deploy.sh (${branch}) stderr:`, stderr);
      console.log(`deploy.sh (${branch}) stdout:`, stdout);
      res.status(200).send(`Webhook received and deployment for ${branch} triggered successfully`);
    });
  } catch (e) {
    console.error('Webhook error:', e?.message || e);
    res.status(500).send('Webhook handler error');
  }
});

/* start */
(async function start() {
  try { await runMigrations(); } catch (e) { console.error('[migrations] failed:', e?.message || e); }
  app.listen(PORT, HOST, () => {
    const pub = STATIC_BASE_URL || `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
    console.log(`Sync server listening on ${HOST}:${PORT} (public base: ${pub})`);
  });
})();