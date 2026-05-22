(function () {
  const badge = document.getElementById('status-badge');
  const title = document.getElementById('status-title');
  const sub = document.getElementById('status-sub');
  const checks = document.getElementById('checks');
  const raw = document.getElementById('raw-json');
  const btn = document.getElementById('btn-refresh');

  function fmtUptime(sec) {
    const s = Math.floor(Number(sec) || 0);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h ${m % 60}m`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }

  function setCheck(id, text, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'check-value' + (cls ? ` ${cls}` : '');
  }

  function render(data, httpOk) {
    raw.textContent = JSON.stringify(data, null, 2);
    checks.hidden = false;

    const ok = httpOk && data?.ok;
    badge.textContent = ok ? 'Healthy' : 'Unhealthy';
    badge.className = 'health-badge ' + (ok ? 'ok' : 'bad');
    title.textContent = ok ? 'All systems operational' : 'Something needs attention';
    sub.textContent = ok
      ? 'The sync server is running and responding normally.'
      : (data?.db?.error || 'One or more checks failed.');

    setCheck('check-api', ok ? 'OK' : 'Failed', ok ? 'ok' : 'bad');
    setCheck('check-db', data?.db?.ok ? `OK (${data.db.latencyMs} ms)` : (data?.db?.error || 'Failed'), data?.db?.ok ? 'ok' : 'bad');
    setCheck('check-latency', data?.db?.latencyMs != null ? `${data.db.latencyMs} ms` : '—', 'muted');
    setCheck('check-uptime', data?.uptime != null ? fmtUptime(data.uptime) : '—', 'muted');
    setCheck('check-ts', data?.ts ? new Date(data.ts).toLocaleString() : '—', 'muted');
    setCheck('check-discord', data?.discord?.configured ? 'Configured' : 'Not configured', data?.discord?.configured ? 'ok' : 'muted');
    setCheck('check-webapp', data?.webapp ? 'Available at /app/' : 'Not bundled', data?.webapp ? 'ok' : 'muted');
  }

  function renderError(err) {
    badge.textContent = 'Unreachable';
    badge.className = 'health-badge bad';
    title.textContent = 'Could not reach the API';
    sub.textContent = String(err?.message || err || 'Unknown error');
    checks.hidden = true;
    raw.textContent = '{}';
  }

  async function refresh() {
    badge.textContent = 'Checking…';
    badge.className = 'health-badge loading';
    title.textContent = 'Running diagnostics';
    sub.textContent = 'Contacting API…';
    btn.disabled = true;

    try {
      const t0 = performance.now();
      const r = await fetch('/health?format=json', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const data = await r.json();
      data._clientMs = Math.round(performance.now() - t0);
      render(data, r.ok);
    } catch (e) {
      renderError(e);
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', refresh);
  refresh();
  setInterval(refresh, 30000);
})();
