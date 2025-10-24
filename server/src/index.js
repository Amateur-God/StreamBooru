require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { query } = require('./db');
const { enc, dec } = require('./crypto');
const { sanitizeSiteInput, sanitizeFavoriteKey, clampPost } = require('./sanitize');

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 3000);
const STATIC_BASE_URL = String(process.env.BASE_URL || '').replace(/\/+$/, '');
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

function publicBase(req) {
  if (STATIC_BASE_URL) return STATIC_BASE_URL;
  const host = String(req.headers['host'] || '').trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  if (!host) return `${proto}://localhost:${PORT}`;
  return `${proto}://${host}`;
}
function signToken(user) {
  return jwt.sign({ sub: user.id, name: user.username || '', avatar: user.avatar || '' }, JWT_SECRET, { expiresIn: '90d' });
}
function auth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const m = /^Bearer\s+(.+)$/.exec(h);
    if (!m) return res.status(401).json({ ok: false, error: 'missing token' });
    const tok = m[1];
    const decd = jwt.verify(tok, JWT_SECRET);
    req.user = { id: decd.sub, name: decd.name || '', avatar: decd.avatar || '' };
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'invalid token' });
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/auth/discord', (req, res) => {
  const redirect_uri = String(req.query.redirect_uri || '').trim();
  const base = publicBase(req);
  const finalRedirect = `${base}/auth/discord/callback` + (redirect_uri ? `?redirect_uri=${encodeURIComponent(redirect_uri)}` : '');
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: finalRedirect,
    response_type: 'code',
    scope: 'identify',
    prompt: 'consent'
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    const base = publicBase(req);
    const redirect_uri = String(req.query.redirect_uri || `${base}/auth/discord/callback`);
    if (!code) return res.status(400).send('Missing code');

    const tokRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri
      })
    });
    if (!tokRes.ok) return res.status(400).send('Token exchange failed');

    const tokJson = await tokRes.json();
    const access_token = tokJson.access_token;
    if (!access_token) return res.status(400).send('No access_token');

    const meRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` } });
    if (!meRes.ok) return res.status(400).send('Failed to fetch user');
    const me = await meRes.json();

    const user = { id: String(me.id), username: me.username || '', avatar: me.avatar || '', created_at: Date.now() };
    await query(`
      INSERT INTO users (id, username, avatar, created_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, avatar = EXCLUDED.avatar
    `, [user.id, user.username, user.avatar, user.created_at]);

    const jwtToken = signToken(user);

    if (redirect_uri.startsWith('http://127.0.0.1') || redirect_uri.startsWith('http://localhost')) {
      const u = new URL(redirect_uri);
      u.searchParams.set('token', jwtToken);
      return res.redirect(u.toString());
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8" />
<title>StreamBooru Login Success</title>
<style>body{font-family:system-ui;margin:2rem;color:#222}code{background:#eee;padding:4px 6px;border-radius:6px}</style>
<h2>Login successful</h2>
<p>Copy this token into the app:</p>
<p><code>${jwtToken}</code></p>`);
  } catch {
    res.status(500).send('Auth error');
  }
});

app.get('/api/me', auth, async (req, res) => {
  const r = await query('SELECT id, username, avatar FROM users WHERE id = $1', [req.user.id]);
  const u = r.rows[0] || { id: req.user.id, username: req.user.name, avatar: '' };
  res.json({ ok: true, user: { id: u.id, name: u.username || '', avatar: u.avatar || '' } });
});

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
    const post = clampPost(req.body?.post);
    if (!key || !post) return res.status(400).json({ ok: false, error: 'bad key/post' });
    const added_at = Number(req.body?.added_at) || Date.now();
    await query(`
      INSERT INTO favorites (user_id, key, added_at, post_json)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT(user_id, key) DO UPDATE SET added_at = EXCLUDED.added_at, post_json = EXCLUDED.post_json
    `, [req.user.id, key, added_at, post]);
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
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});
app.post('/api/favorites/bulk_upsert', auth, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const now = Date.now();
    const { pool } = require('./db');
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
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      throw e;
    } finally { client.release(); }
    res.json({ ok: true, upserted: items.length });
  } catch {
    res.status(500).json({ ok: false });
  }
});

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
    const list = Array.isArray(req.body?.sites) ? req.body.sites : [];
    if (list.length > 50) return res.status(400).json({ ok: false, error: 'too many sites' });
    const sanitized = list.map(sanitizeSiteInput).filter(s => s.type && s.base_url);
    const now = Date.now();
    const { pool } = require('./db');
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
    res.json({ ok: true, count: sanitized.length });
  } catch {
    res.status(500).json({ ok: false });
  }
});

function cryptoRandomId() {
  const c = require('crypto');
  return c.randomBytes(16).toString('hex');
}

app.listen(PORT, () => {
  console.log(`Sync server listening on http://127.0.0.1:${PORT}`);
});