(function () {
  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    }
    for (const c of (Array.isArray(children) ? children : [children])) if (c) el.appendChild(c);
    return el;
  }

  async function openAccountModal() {
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

    const serverRow = h('div', { className: 'actions-row' });
    const serverLabel = h('label', { text: 'Server' });
    const serverSelect = h('select');
    [
      ['https://streambooru.co.uk','streambooru.co.uk'],
      ['https://streambooru.com','streambooru.com'],
      ['https://streambooru.ecchibooru.uk','ecchibooru.uk']
    ].forEach(([val, label]) => {
      const opt = h('option'); opt.value = val; opt.textContent = label; serverSelect.appendChild(opt);
    });
    const btnUseServer = h('button', { className: 'link-btn', text: 'Use Server' });
    serverRow.appendChild(serverLabel);
    serverRow.appendChild(serverSelect);
    serverRow.appendChild(btnUseServer);

    const rowRegister = h('div', { className: 'actions-row' });
    const regUser = h('input', { placeholder: 'New username' });
    const regPass = h('input', { placeholder: 'New password' }); regPass.type = 'password';
    const btnRegister = h('button', { className: 'link-btn accent', text: 'Create Account' });
    rowRegister.appendChild(regUser); rowRegister.appendChild(regPass); rowRegister.appendChild(btnRegister);

    const rowLocal = h('div', { className: 'actions-row' });
    const userInput = h('input', { placeholder: 'Username' });
    const passInput = h('input', { placeholder: 'Password' }); passInput.type = 'password';
    const btnLoginLocal = h('button', { className: 'link-btn', text: 'Login (Local)' });
    rowLocal.appendChild(userInput); rowLocal.appendChild(passInput); rowLocal.appendChild(btnLoginLocal);

    const rowDiscord = h('div', { className: 'actions-row' });
    const btnLoginDiscord = h('button', { className: 'link-btn', text: 'Login with Discord' });
    const btnLogout = h('button', { className: 'link-btn', text: 'Logout' });
    rowDiscord.appendChild(btnLoginDiscord);
    rowDiscord.appendChild(btnLogout);

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

    async function refresh() {
      const a = await window.api.accountGet();
      const cur = String(a.serverBase || '');
      if (cur.includes('.ecchibooru.')) serverSelect.value = 'https://streambooru.ecchibooru.uk';
      else if (cur.includes('.com')) serverSelect.value = 'https://streambooru.com';
      else serverSelect.value = 'https://streambooru.co.uk';
      const who = a.user ? `${a.user.name || a.user.id}` : 'Not logged in';
      status.textContent = `Server: ${serverSelect.value} • ${a.loggedIn ? 'Logged in as ' + who : 'Not logged in'}`;
      btnLoginDiscord.disabled = !serverSelect.value || a.loggedIn;
      btnLoginLocal.disabled = !serverSelect.value || a.loggedIn;
      btnRegister.disabled = !serverSelect.value || a.loggedIn;
      btnLogout.disabled = !a.loggedIn;
      btnPullFav.disabled = !a.loggedIn;
    }

    btnUseServer.addEventListener('click', async () => {
      await window.api.accountSetServer(serverSelect.value);
      await refresh();
    });

    btnRegister.addEventListener('click', async () => {
      try {
        btnRegister.disabled = true;
        const u = regUser.value.trim();
        const p = regPass.value;
        const res = await window.api.accountRegister(u, p);
        if (!res?.ok) alert('Register failed' + (res?.error ? `: ${res.error}` : ''));
        else { await window.api.syncOnLogin(); alert('Account created and synced.'); }
      } finally { btnRegister.disabled = false; await refresh(); }
    });

    btnLoginLocal.addEventListener('click', async () => {
      try {
        btnLoginLocal.disabled = true;
        const u = userInput.value.trim();
        const p = passInput.value;
        const res = await window.api.accountLoginLocal(u, p);
        if (!res?.ok) alert('Login failed' + (res?.error ? `: ${res.error}` : ''));
        else { await window.api.syncOnLogin(); alert('Login complete. Synced.'); }
      } finally { btnLoginLocal.disabled = false; await refresh(); }
    });

    btnLoginDiscord.addEventListener('click', async () => {
      try {
        btnLoginDiscord.disabled = true;
        const res = await window.api.accountLoginDiscord();
        if (!res?.ok) alert('Login failed' + (res?.error ? `: ${res.error}` : ''));
        else { await window.api.syncOnLogin(); alert('Login complete. Synced.'); }
      } finally { btnLoginDiscord.disabled = false; await refresh(); }
    });

    btnLogout.addEventListener('click', async () => {
      await window.api.accountLogout();
      alert('Logged out');
      await refresh();
    });

    btnPullFav.addEventListener('click', async () => {
      const res = await window.api.syncPullFavorites();
      if (res?.ok) alert('Pulled favorites.');
      else alert('Pull failed' + (res?.error ? `: ${res.error}` : ''));
    });

    await refresh();
    setTimeout(() => root.focus(), 0);
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