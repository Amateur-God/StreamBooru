require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { EventEmitter } = require('events');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const crypto = require('crypto');

const { query } = require('../db');

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

// ---------- config ----------
const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || '0.0.0.0');
const STATIC_BASE_URL = String(process.env.BASE_URL || '').replace(/\/+$/, ''); // e.g. https://streambooru.ecchibooru.uk
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// ---------- utils ----------
function publicBase(req) {
  if (STATIC_BASE_URL) return STATIC_BASE_URL;
  const host = String(req.headers['host'] || '').trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  if (!host) return `${proto}://localhost:${PORT}`;
  return `${proto}://${host}`;
}
function oauthRedirectBase(req) {
  // This MUST exactly match what you configured in the Discord developer portal.
  return `${publicBase(req)}/auth/discord/callback`;
}
function signToken(user) {
  return jwt.sign({ sub: user.id, name: user.username || '', avatar: user.avatar || '' }, JWT_SECRET, { expiresIn: '90d' });
}
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
function cryptoRandomId() {
  return crypto.randomBytes(16).toString('hex');
}

// ---------- per-user bus (SSE skeleton for future) ----------
const userBus = new Map();
function chanFor(uid) {
  if (!userBus.has(uid)) userBus.set(uid, new EventEmitter());
  return userBus.get(uid);
}
function emitTo(uid, event, payload) {
  try { chanFor(uid).emit('event', { event, payload, ts: Date.now() }); } catch {}
}

// ---------- startup migrations (idempotent) ----------
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
  for (const sql of steps) {
    try { await query(sql); } catch (e) { console.error('Migration step failed (continuing):', e?.message || e); }
  }
  console.log('[migrations] ensured');
}

// ---------- health ----------
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ---------- local auth ----------
app.post('/auth/local/register', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || username.length < 3) return res.status(400).json({ ok: false, error: 'bad username' });
    if (!password || password.length < 6) return res.status(400).json({ ok: false, error: 'bad password' });

    const rs = await query('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username]);
    if (rs.rowCount > 0) return res.status(409).json({ ok: false, error: 'username taken' });

    const id = 'local:' + cryptoRandomId();
    const hash = await bcrypt.hash(password, 12);
    const created_at = Date.now();
    await query(`
      INSERT INTO users (id, username, avatar, created_at, password_hash)
      VALUES ($1, $2, '', $3, $4)
    `, [id, username, created_at, hash]);

    const token = signToken({ id, username, avatar: '' });
    res.json({ ok: true, token });
  } catch (e) {
    console.error('Register error:', e?.message || e);
    res.status(500).json({ ok: false });
  }
});

app.post('/auth/local/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) return res.status(400).json({ ok: false, error: 'missing credentials' });

    const r = await query('SELECT id, username, avatar, password_hash FROM users WHERE lower(username) = lower($1)', [username]);
    const row = r.rows[0];
    if (!row || !row.password_hash) return res.status(401).json({ ok: false, error: 'invalid credentials' });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: 'invalid credentials' });

    const token = signToken({ id: row.id, username: row.username, avatar: row.avatar || '' });
    res.json({ ok: true, token });
  } catch (e) {
    console.error('Login error:', e?.message || e);
    res.status(500).json({ ok: false });
  }
});

// ---------- Discord OAuth ----------
// Login flow: GET /auth/discord?redirect_uri=http://127.0.0.1:PORT/callback (for Electron)
// We DO NOT append query params to the Discord redirect_uri. We put them into a signed 'state'.
app.get('/auth/discord', (req, res) => {
  const base = publicBase(req);
  const oauthRedirect = oauthRedirectBase(req); // must match portal URI exactly
  const next = String(req.query.redirect_uri || '').trim(); // optional desktop callback

  const stateToken = jwt.sign(
    { purpose: 'login', next, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '10m' }
  );

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

// Linking flow (start while authenticated locally)
// GET /api/link/discord/start?next=http://127.0.0.1:PORT/callback
app.get('/api/link/discord/start', auth, async (req, res) => {
  try {
    const base = publicBase(req);
    const oauthRedirect = oauthRedirectBase(req);
    const next = String(req.query.next || '').trim();

    const stateToken = jwt.sign(
      { purpose: 'link', linkTo: req.user.id, next, iat: Math.floor(Date.now() / 1000) },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

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

// Discord callback
app.get('/auth/discord/callback', async (req, res) => {
  try {
    const base = publicBase(req);
    const oauthRedirect = oauthRedirectBase(req);
    const code = String(req.query.code || '');
    const stateRaw = String(req.query.state || '');
    if (!code) return res.status(400).send('Missing code');

    let state = {};
    try { state = jwt.verify(stateRaw, JWT_SECRET); } catch { state = {}; }

    // Exchange code for token
    const tokRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: oauthRedirect
      })
    });
    if (!tokRes.ok) return res.status(400).send('Token exchange failed');
    const tokJson = await tokRes.json();
    const access_token = tokJson.access_token;
    if (!access_token) return res.status(400).send('No access_token');

    // Fetch user
    const meRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
    if (!meRes.ok) return res.status(400).send('Failed to fetch user');
    const me = await meRes.json();
    const discordId = String(me.id);
    const profile = { username: me.username || '', avatar: me.avatar || '' };

    // Linking vs Login
    if (state.purpose === 'link' && state.linkTo) {
      // Attach discord_id to the existing user
      try {
        // If another user already has this discord_id, you might want to merge; for now, enforce unique
        await query('UPDATE users SET discord_id = $1, username = COALESCE(username, $2) WHERE id = $3', [discordId, profile.username, state.linkTo]);
      } catch (e) {
        // Unique violation: discord_id already bound -> let the user know
        return res.status(409).send('This Discord is already linked to another account.');
      }
      const next = String(state.next || '');
      if (next.startsWith('http://127.0.0.1') || next.startsWith('http://localhost')) {
        const u = new URL(next);
        u.searchParams.set('linked', '1');
        return res.redirect(u.toString());
      }
      return res.status(200).send('Discord account linked. You can close this window.');
    }

    // Login: find user by discord_id; create if missing
    const found = await query('SELECT id, username, avatar FROM users WHERE discord_id = $1', [discordId]);
    let userId;
    if (found.rowCount > 0) {
      userId = found.rows[0].id;
      // keep username/avatar fresh
      await query('UPDATE users SET username = $1, avatar = $2 WHERE id = $3', [profile.username, profile.avatar, userId]);
    } else {
      userId = `discord:${discordId}`;
      const created_at = Date.now();
      await query(`
        INSERT INTO users (id, username, avatar, created_at, discord_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
      `, [userId, profile.username, profile.avatar, created_at, discordId]);
    }

    const jwtToken = signToken({ id: userId, username: profile.username, avatar: profile.avatar });

    // Electron/device callback
    const next = String(state.next || '');
    if (next.startsWith('http://127.0.0.1') || next.startsWith('http://localhost')) {
      const u = new URL(next);
      u.searchParams.set('token', jwtToken);
      return res.redirect(u.toString());
    }

    // Fallback simple page
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

// ---------- user/me ----------
app.get('/api/me', auth, async (req, res) => {
  const r = await query('SELECT id, username, avatar, discord_id FROM users WHERE id = $1', [req.user.id]);
  const u = r.rows[0] || { id: req.user.id, username: req.user.name, avatar: '' };
  res.json({ ok: true, user: { id: u.id, name: u.username || '', avatar: u.avatar || '', discord_id: u.discord_id || null } });
});

// ---------- favorites (skeleton from earlier – left unchanged) ----------
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
    const key = String(req.params.key || '');
    const post = req.body?.post || null;
    if (!key || !post) return res.status(400).json({ ok: false, error: 'bad key/post' });
    const added_at = Number(req.body?.added_at) || Date.now();
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
    const key = String(req.params.key || '');
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
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const now = Date.now();
    const { pool } = require('../db');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const it of items) {
        const key = String(it?.key || '');
        const post = it?.post || null;
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

// ---------- start ----------
(async function start() {
  try {
    await runMigrations();
  } catch (e) {
    console.error('[migrations] failed (continuing):', e?.message || e);
  }
  app.listen(PORT, HOST, () => {
    const pub = STATIC_BASE_URL || `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
    console.log(`Sync server listening on ${HOST}:${PORT} (public base: ${pub})`);
  });
})();