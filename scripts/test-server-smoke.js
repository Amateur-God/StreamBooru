#!/usr/bin/env node
'use strict';

const base = (process.argv[2] || process.env.STREAMBOORU_SERVER || 'https://streambooru.ecchibooru.uk').replace(/\/+$/, '');
const timeoutMs = 15000;

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { status: r.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok: ${name}`);
  } catch (e) {
    console.error(`FAIL: ${name} — ${e.message || e}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log(`Testing StreamBooru server at ${base}\n`);

  await check('GET /health', async () => {
    const r = await fetchJson(`${base}/health`);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}${r.text ? `: ${r.text.slice(0, 120)}` : ''}`);
    if (!r.json?.ok) throw new Error('health body not ok');
  });

  await check('GET /imgproxy rejects bad url', async () => {
    const r = await fetchJson(`${base}/imgproxy?url=https://evil.example/x.jpg`);
    if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
  });

  await check('GET /api/me without token returns 401', async () => {
    const r = await fetchJson(`${base}/api/me`);
    if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
  });

  await check('GET /api/sites without token returns 401', async () => {
    const r = await fetchJson(`${base}/api/sites`);
    if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
  });

  await check('POST /auth/local/login bad creds returns 4xx', async () => {
    const r = await fetchJson(`${base}/auth/local/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '__smoke_test__', password: 'bad-password-123' })
    });
    if (r.status < 400 || r.status >= 500) throw new Error(`expected 4xx, got ${r.status}`);
  });

  if (process.exitCode) {
    console.error('\nServer smoke tests failed');
    process.exit(process.exitCode);
  }
  console.log('\nAll server smoke tests passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
