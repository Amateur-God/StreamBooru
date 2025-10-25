(function () {
  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => { if (c) el.appendChild(c); });
    return el;
  }

  function ensureStyles() {
    const id = 'account-modal-fix-styles';
    if (document.getElementById(id)) return;
    const css = `
      #account-manager .site-card .actions-row { position: relative; z-index: auto; }
      #account-manager .site-card .fields-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      #account-manager input, #account-manager select, #account-manager textarea { pointer-events: auto; user-select: text; }
      #account-manager .panel { outline: none; }
      #account-manager .badge { display:inline-block; padding:2px 6px; border-radius:999px; font-size:11px; line-height:1.6; border:1px solid rgba(255,255,255,0.15); margin-left:6px;}
      #account-manager .badge.ok { color:#52d273; border-color: rgba(82,210,115,0.35); }
      #account-manager .badge.err { color:#ff6b6b; border-color: rgba(255,107,107,0.35); }
      #account-manager .badge.muted { color:#a9b0c0; }
    `;
    const style = document.createElement('style');
    style.id = id;
    style.type = 'text/css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensureOption(selectEl, value, label) {
    if (!value) return;
    const val = String(value).replace(/\/+$/,'');
    const exists = Array.from(selectEl.options).some(o => o.value.replace(/\/+$/,'') === val);
    if (!exists) {
      const opt = h('option');
      opt.value = val;
      try {
        const host = new URL(val).host || val;
        opt.textContent = label || host;
      } catch {
        opt.textContent = label || val;
      }
      selectEl.appendChild(opt);
    }
  }

  function mkInput(ph, type = 'text') {
    const i = document.createElement('input');
    i.type = type;
    i.placeholder = ph;
    i.autocomplete = 'off';
    i.autocapitalize = 'off';
    i.spellcheck = false;
    i.tabIndex = 0;
    i.style.pointerEvents = 'auto';
    i.addEventListener('keydown', (e) => e.stopPropagation(), true);
    i.addEventListener('keypress', (e) => e.stopPropagation(), true);
    i.addEventListener('keyup', (e) => e.stopPropagation(), true);
    return i;
  }

  async function openAccountModal() {
    ensureStyles();

    const root = document.getElementById('account-manager');
    if (!root) return;

    root.innerHTML = '';
    root.classList.remove('hidden');
    root.setAttribute('aria-hidden', 'false');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('tabindex', '-1');

    const panel = h('div', { className: 'panel' });
    const title = h('h2', { text: 'Account' });

    const content = h('div', { className: 'content-scroll' });
    const card = h('div', { className: 'site-card compact' });
    const status = h('div', { className: 'hint' });

    // Server row
    const serverRow = h('div', { className: 'actions-row' });
    const serverLabel = h('label', { text: 'Server' });
    const serverSelect = h('select');
    const SERVERS = [
      //['https://streambooru.co.uk','streambooru.co.uk'],
      //['https://streambooru.com','streambooru.com'],
      ['https://streambooru.ecchibooru.uk','streambooru.ecchibooru.uk']
    ];
    SERVERS.forEach(([val, label]) => {
      const opt = h('option'); opt.value = val; opt.textContent = label; serverSelect.appendChild(opt);
    });
    const btnUseServer = h('button', { className: 'link-btn', text: 'Use Server' });
    serverRow.appendChild(serverLabel);
    serverRow.appendChild(serverSelect);
    serverRow.appendChild(btnUseServer);

    // Create account
    const rowRegister = h('div', { className: 'fields-row' });
    const regUser = mkInput('New username', 'text');
    const regPass = mkInput('New password', 'password');
    const btnRegister = h('button', { className: 'link-btn accent', text: 'Create Account' });
    rowRegister.appendChild(regUser); rowRegister.appendChild(regPass); rowRegister.appendChild(btnRegister);

    // Local login
    const rowLocal = h('div', { className: 'fields-row' });
    const userInput = mkInput('Username', 'text');
    const passInput = mkInput('Password', 'password');
    const btnLoginLocal = h('button', { className: 'link-btn', text: 'Login (Local)' });
    rowLocal.appendChild(userInput); rowLocal.appendChild(passInput); rowLocal.appendChild(btnLoginLocal);

    // OAuth / link / logout
    const rowDiscord = h('div', { className: 'actions-row' });
    const btnLinkDiscord = h('button', { className: 'link-btn', text: 'Link Discord' });
    const btnLoginDiscord = h('button', { className: 'link-btn', text: 'Login with Discord' });
    const btnLogout = h('button', { className: 'link-btn', text: 'Logout' });
    const linkBadge = h('span', { className: 'badge muted', text: '' });
    rowDiscord.appendChild(btnLinkDiscord);
    rowDiscord.appendChild(btnLoginDiscord);
    rowDiscord.appendChild(btnLogout);
    rowDiscord.appendChild(linkBadge);

    // Manual sync
    const rowInfo = h('div', { className: 'actions-row' });
    const btnPullFav = h('button', { className: 'link-btn', text: 'Pull favorites (manual)' });
    rowInfo.appendChild(btnPullFav);

    card.appendChild(status);
    card.appendChild(serverRow);
    card.appendChild(rowRegister);
    card.appendChild(rowLocal);
    card.appendChild(rowDiscord);
    card.appendChild(rowInfo);
    content.appendChild(card);

    const btns = h('div', { className: 'btns' });
    const closeBtn = h('button', { text: 'Close' });
    btns.appendChild(closeBtn);

    panel.appendChild(title);
    panel.appendChild(content);
    panel.appendChild(btns);
    root.appendChild(panel);

    const escHandler = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
    const backdropHandler = (e) => { if (e.target === root) close(); };
    function close() {
      document.removeEventListener('keydown', escHandler, true);
      root.removeEventListener('click', backdropHandler, true);
      root.classList.add('hidden');
      root.setAttribute('aria-hidden', 'true');
      root.innerHTML = '';
    }
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', escHandler, true);
    root.addEventListener('click', backdropHandler, true);

    // Events
    async function refresh() {
      const a = await (window.api.accountGet?.() || {});
      const curRaw = String(a.serverBase || '').trim();
      const cur = curRaw.replace(/\/+$/,'');
      if (cur) ensureOption(serverSelect, cur);
      if (cur && Array.from(serverSelect.options).some(o => o.value.replace(/\/+$/,'') === cur)) {
        serverSelect.value = cur;
      } else if (cur.includes('.ecchibooru.')) {
        serverSelect.value = 'https://streambooru.ecchibooru.uk';
      } else if (cur.includes('.com')) {
        serverSelect.value = 'https://streambooru.com';
      } else {
        serverSelect.value = 'https://streambooru.co.uk';
      }

      const who = a.user ? `${a.user.name || a.user.id}` : 'Not logged in';
      status.textContent = `Server: ${serverSelect.value} • ${a.loggedIn ? 'Logged in as ' + who : 'Not logged in'}`;

      // Enable/disable actions
      const linked = !!a?.user?.discord_id;
      linkBadge.textContent = linked ? 'Discord linked' : 'Discord not linked';
      linkBadge.className = 'badge ' + (linked ? 'ok' : 'muted');

      btnLinkDiscord.disabled = !a.loggedIn || linked;
      btnLoginDiscord.disabled = !serverSelect.value || a.loggedIn; // login with Discord only when not logged in
      btnLoginLocal.disabled = !serverSelect.value || a.loggedIn;
      btnRegister.disabled = !serverSelect.value || a.loggedIn;
      btnLogout.disabled = !a.loggedIn;
      btnPullFav.disabled = !a.loggedIn;

      // Focus first relevant input
      setTimeout(() => {
        if (!a.loggedIn) regUser.focus();
        else if (!linked) btnLinkDiscord.focus();
        else userInput.focus();
      }, 0);
    }

    btnUseServer.addEventListener('click', async () => {
      await window.api.accountSetServer?.(serverSelect.value);
      await refresh();
    });

    btnRegister.addEventListener('click', async () => {
      try {
        btnRegister.disabled = true;
        const u = regUser.value.trim();
        const p = regPass.value;
        if (!u || !p) { alert('Enter username and password'); return; }
        const res = await window.api.accountRegister?.(u, p);
        if (!res?.ok) alert('Register failed' + (res?.error ? `: ${res.error}` : ''));
        else { await window.api.syncOnLogin?.(); alert('Account created and synced.'); }
      } finally { btnRegister.disabled = false; await refresh(); }
    });

    btnLoginLocal.addEventListener('click', async () => {
      try {
        btnLoginLocal.disabled = true;
        const u = userInput.value.trim();
        const p = passInput.value;
        if (!u || !p) { alert('Enter username and password'); return; }
        const res = await window.api.accountLoginLocal?.(u, p);
        if (!res?.ok) alert('Login failed' + (res?.error ? `: ${res.error}` : ''));
        else { await window.api.syncOnLogin?.(); alert('Login complete. Synced.'); }
      } finally { btnLoginLocal.disabled = false; await refresh(); }
    });

    // New: Link Discord to current account
    btnLinkDiscord.addEventListener('click', async () => {
      try {
        btnLinkDiscord.disabled = true;
        const res = await window.api.accountLinkDiscord?.();
        if (!res?.ok) {
          alert('Link start failed' + (res?.error ? `: ${res.error}` : ''));
        } else {
          // If we waited for completion, res.linked may be true
          if (res.linked) {
            alert('Discord account linked.');
          } else {
            alert('Continue the Discord consent in your browser to complete linking.');
          }
        }
      } finally { btnLinkDiscord.disabled = false; await refresh(); }
    });

    // Existing: Login with Discord (not linked to local)
    btnLoginDiscord.addEventListener('click', async () => {
      try {
        btnLoginDiscord.disabled = true;
        const res = await window.api.accountLoginDiscord?.();
        if (!res?.ok) alert('Login failed' + (res?.error ? `: ${res.error}` : ''));
        else { await window.api.syncOnLogin?.(); alert('Login complete. Synced.'); }
      } finally { btnLoginDiscord.disabled = false; await refresh(); }
    });

    btnLogout.addEventListener('click', async () => {
      await window.api.accountLogout?.();
      alert('Logged out');
      await refresh();
    });

    btnPullFav.addEventListener('click', async () => {
      const res = await window.api.syncPullFavorites?.();
      if (res?.ok) alert('Pulled favorites.');
      else alert('Pull failed' + (res?.error ? `: ${res.error}` : ''));
    });

    await refresh();
    setTimeout(() => panel.focus(), 0);
  }

  function setupAccountButton() {
    const btn = document.getElementById('btn-account');
    const mnu = document.getElementById('mnu-account');
    if (btn) btn.addEventListener('click', openAccountModal);
    if (mnu) mnu.addEventListener('click', openAccountModal);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAccountButton);
  } else {
    setupAccountButton();
  }
})();