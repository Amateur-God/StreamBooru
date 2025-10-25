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

/* body parser (1 MB, tolerant) */
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') { req.body = {}; return next(); }
  const max = 1024 * 1024;
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > max) { req.pause(); res.status(413).send('Payload too large'); return; } chunks.push(c); });
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    req.rawBody = raw;
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    let obj = {};
    const tryJson = () => { try { obj = JSON.parse(raw); } catch {} };
    const tryForm = () => { try { obj = Object.fromEntries(new URLSearchParams(raw)); } catch {} };
    if (!raw || !raw.trim()) { req.body = {}; return next(); }
    if (ct.includes('application/json')) { tryJson(); if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).length === 0) tryForm(); }
    else if (ct.includes('application/x-www-form-urlencoded')) { tryForm(); if (!obj || typeof obj !== 'object' || Array.isArray(obj)) tryJson(); }
    else { tryJson(); if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).length === 0) tryForm(); }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) obj = {};
    req.body = obj; next();
  });
  req.on('error', () => next());
});

/* request log */
app.use((req, _res, next) => { try { console.log(`${req.method} ${req.url}`); } catch {} next(); });

/* ---------- config ---------- */
const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || '0.0.0.0');
const STATIC_BASE_URL = String(process.env.BASE_URL || '').replace(/\/+$/, '');
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

/* ---------- utils ---------- */
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

/* helpers */
function bodyObj(req) { const b = req.body; return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; }
function extractCreds(req) {
  const b = bodyObj(req);
  let u = (b.username ?? req.query?.username ?? '').toString().trim();
  let p = (b.password ?? req.query?.password ?? '').toString();
  if (!u || !p) {
    const h = String(req.headers.authorization || '');
    const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(h);
    if (m) {
      try {
        const raw = Buffer.from(m[1], 'base64').toString('utf8');
        const idx = raw.indexOf(':');
        if (idx >= 0) { const u2 = raw.slice(0, idx); const p2 = raw.slice(idx + 1); if (!u) u = u2; if (!p) p = p2; }
      } catch {}
    }
  }
  return { username: String(u || '').trim(), password: String(p || '') };
}

/* ---------- per-user bus (SSE) ---------- */
const userBus = new Map();
function chanFor(uid) { if (!userBus.has(uid)) userBus.set(uid, new EventEmitter()); return userBus.get(uid); }
function emitTo(uid, event, payload) { try { chanFor(uid).emit('event', { event, payload, ts: Date.now() }); } catch {} }

/* ---------- migrations (idempotent) ---------- */
async function runMigrations() {
  const steps = [
    `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_hash TEXT`,
    `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS discord_id TEXT`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_username_uniq'
       ) THEN
         EXECUTE 'CREATE UNIQUE INDEX users_username_uniq ON users((lower(username)))';
       END IF;
     END$$;`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_discord_id_uniq'
       ) THEN
         EXECUTE 'CREATE UNIQUE INDEX users_discord_id_uniq ON users(discord_id) WHERE discord_id IS NOT NULL';
       END IF;
     END$$;`
  ];
  for (const sql of steps) { try { await query(sql); } catch (e) { console.error('[migrations]', e?.message || e); } }
}

/* ---------- health ---------- */
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

/* ---------- local accounts ---------- */
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
    if (!row.password_hash) return res.status(409).json({ ok: false, error: 'no password set' });

    const ok = await bcrypt.compare(password, row.password_hash);
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
    const password = String(b.password || '');
    if (!password || password.length < 6) return res.status(400).json({ ok: false, error: 'bad password' });
    const hash = await bcrypt.hash(password, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Set password error:', e?.message || e);
    res.status(500).json({ ok: false });
  }
});

/* ---------- discord oauth (login + link) ---------- */
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
      try {
        await query('UPDATE users SET discord_id = $1, username = COALESCE(username, $2) WHERE id = $3', [discordId, profile.username, state.linkTo]);
      } catch {
        return res.status(409).send('This Discord is already linked to another account.');
      }
      const next = String(state.next || '');
      if (isAllowedDeepLink(next)) {
        const u = new URL(next);
        u.searchParams.set('linked', '1');
        return res.redirect(u.toString());
      }
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

/* Optional: unlink Discord so local login remains independent */
app.post('/auth/discord/unlink', auth, async (req, res) => {
  try {
    await query('UPDATE users SET discord_id = NULL WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Unlink Discord error:', e?.message || e);
    res.status(500).json({ ok: false, error: 'server error' });
  }
});

/* ---------- user/me ---------- */
app.get('/api/me', auth, async (req, res) => {
  const r = await query('SELECT id, username, avatar, discord_id FROM users WHERE id = $1', [req.user.id]);
  const u = r.rows[0] || { id: req.user.id, username: req.user.name, avatar: '' };
  res.json({ ok: true, user: { id: u.id, name: u.username || '', avatar: u.avatar || '', discord_id: u.discord_id || null } });
});

/* ---------- favourites (British primary) ---------- */
app.get('/api/favourites/keys', auth, async (req, res) => {
  const r = await query('SELECT key FROM favorites WHERE user_id = $1 ORDER BY added_at DESC', [req.user.id]);
  res.json({ ok: true, keys: r.rows.map(x => x.key) });
});
app.get('/api/favourites', auth, async (req, res) => {
  const r = await query('SELECT key, added_at, post_json FROM favorites WHERE user_id = $1 ORDER BY added_at DESC', [req.user.id]);
  const items = r.rows.map(row => ({ key: row.key, added_at: Number(row.added_at) || 0, post: row.post_json })).filter(x => x.post);
  res.json({ ok: true, items });
});
app.put('/api/favourites/:key', auth, async (req, res) => {
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
app.delete('/api/favourites/:key', auth, async (req, res) => {
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
app.post('/api/favourites/bulk_upsert', auth, async (req, res) => {
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

/* ---------- aliases: American spelling (legacy) ---------- */
app.get('/api/favorites', (req, res) => res.redirect(307, '/api/favourites'));
app.get('/api/favorites/keys', (req, res) => res.redirect(307, '/api/favourites/keys'));
app.post('/api/favorites/bulk_upsert', (req, res) => res.redirect(307, '/api/favourites/bulk_upsert'));
app.put('/api/favorites/:key', (req, res) => res.redirect(307, `/api/favourites/${encodeURIComponent(req.params.key)}`));
app.delete('/api/favorites/:key', (req, res) => res.redirect(307, `/api/favourites/${encodeURIComponent(req.params.key)}`));

/* ---------- sites ---------- */
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

/* ---------- SSE (token via query + CORS) ---------- */
function authFromHeaderOrQuery(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  const token = m ? m[1] : (String(req.query.access_token || req.query.token || '') || '');
  if (!token) throw new Error('missing token');
  const decd = jwt.verify(token, JWT_SECRET);
  return { id: decd.sub, name: decd.name || '', avatar: decd.avatar || '' };
}
app.get('/api/stream', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');

  let user;
  try { user = authFromHeaderOrQuery(req); }
  catch { res.status(401).end('Unauthorized'); return; }

  const uid = user.id;
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

/* ---------- Image proxy (fallback for hotlink-protected CDNs) ---------- */
function isProxyAllowed(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    const okProto = u.protocol === 'https:' || u.protocol === 'http:';
    const allow =
      h.endsWith('donmai.us') ||
      h === 'files.yande.re' ||
      h === 'konachan.com' || h === 'konachan.net' ||
      h.endsWith('e621.net') || h.endsWith('e926.net') ||
      h.endsWith('derpibooru.org') || h.endsWith('derpicdn.net') ||
      h.endsWith('gelbooru.com') || h.endsWith('safebooru.org') ||
      h.endsWith('rule34.xxx') || h.endsWith('realbooru.com') || h.endsWith('xbooru.com') ||
      h.endsWith('tbib.org') || h.endsWith('hypnohub.net');
    return okProto && allow;
  } catch { return false; }
}
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
app.get('/imgproxy', async (req, res) => {
  // CORS for browser builds too
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Vary', 'Origin');

  try {
    const url = String(req.query.url || '');
    if (!url || !isProxyAllowed(url)) return res.status(400).send('Bad url');

    // Optional explicit referer from client (e.g. the actual post page)
    const refParam = String(req.query.ref || '').trim();

    const hdr = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Mobile Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
    };

    let refFinal = '';
    if (refParam) {
      // Only allow referers from known sites to avoid open-proxy abuse
      try {
        const u = new URL(refParam);
        const h = u.hostname.toLowerCase();
        const allowRef =
          h.endsWith('donmai.us') ||
          h.endsWith('yande.re') ||
          h.endsWith('konachan.com') || h.endsWith('konachan.net') ||
          h.endsWith('e621.net') || h.endsWith('e926.net') ||
          h.endsWith('derpibooru.org') || h.endsWith('derpicdn.net') ||
          h.endsWith('gelbooru.com') || h.endsWith('safebooru.org') ||
          h.endsWith('tbib.org') || h.endsWith('hypnohub.net') ||
          h.endsWith('rule34.xxx') || h.endsWith('realbooru.com') || h.endsWith('xbooru.com');
        if (allowRef) refFinal = u.toString();
      } catch {}
    }
    if (!refFinal) refFinal = refererFor(url);

    if (refFinal) {
      try {
        const o = new URL(refFinal);
        hdr['Referer'] = refFinal;
        hdr['Origin'] = `${o.protocol}//${o.host}`;
      } catch {
        hdr['Referer'] = refFinal;
      }
    }

    const r = await fetch(url, { headers: hdr });
    if (!r.ok) {
      res.status(r.status).end(`Upstream ${r.status}`);
      return;
    }

    const ct = r.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    // Stream the image back
    r.body.pipe(res);
  } catch (e) {
    console.error('imgproxy error', e);
    res.status(500).end('proxy error');
  }
});

/* ---------- start ---------- */
(async function start() {
  try { await runMigrations(); } catch (e) { console.error('[migrations] failed:', e?.message || e); }
  app.listen(PORT, HOST, () => {
    const pub = STATIC_BASE_URL || `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
    console.log(`Sync server listening on ${HOST}:${PORT} (public base: ${pub})`);
  });
})();