(function () {
  const POPULAR_SITES = {
    danbooru: [
      { label: 'Danbooru (donmai.us)', url: 'https://danbooru.donmai.us' },
      { label: 'Safebooru (donmai.us)', url: 'https://safebooru.donmai.us' }
    ],
    moebooru: [
      { label: 'Yande.re', url: 'https://yande.re' },
      { label: 'Konachan.com', url: 'https://konachan.com' },
      { label: 'Konachan.net', url: 'https://konachan.net' }
    ],
    gelbooru: [
      { label: 'Safebooru.org', url: 'https://safebooru.org' },
      { label: 'Gelbooru.com', url: 'https://gelbooru.com' }
    ],
    zerochan: [{ label: 'Zerochan', url: 'https://www.zerochan.net' }]
  };

  const RATINGS = [
    { value: 'safe', label: 'Safe' },
    { value: 'questionable', label: 'Questionable' },
    { value: 'explicit', label: 'Explicit' },
    { value: 'any', label: 'Any' }
  ];

  const stripRatingTokens = function (tagsStr) {
    if (!tagsStr) return '';
    const tokens = String(tagsStr)
      .trim()
      .split(/\s+/)
      .filter((t) => !/^rating:(?:safe|questionable|explicit|any)$/i.test(t));
    return tokens.join(' ');
  };

  const accountUrlFor = function (type, baseUrl) {
    const b = (baseUrl || '').replace(/\/+$/, '');
    if (!b) return '';
    if (type === 'danbooru') return `${b}/profile`;
    if (type === 'moebooru') return `${b}/user/home`;
    if (type === 'gelbooru') return `${b}/index.php?page=account`;
    if (type === 'zerochan') return `${b}/login`;
    return b;
  };

  const helpUrlFor = function (type, baseUrl) {
    const b = (baseUrl || '').replace(/\/+$/, '');
    if (type === 'danbooru') return `${b}/help/api`;
    if (type === 'moebooru') return `${b}/help/api`;
    if (type === 'gelbooru') return `${b}/index.php?page=help`;
    if (type === 'zerochan') return `https://www.zerochan.net/`;
    return b;
  };

  const siteCard = function (site, idx, onChange, onDelete, onTest) {
    const s = {
      name: site.name || '',
      baseUrl: site.baseUrl || '',
      type: site.type || 'danbooru',
      rating: site.rating || 'safe',
      tags: stripRatingTokens(site.tags || ''),
      credentials: { ...(site.credentials || {}) }
    };

    const card = document.createElement('div');
    card.className = 'site-card compact';

    const header = document.createElement('div');
    header.className = 'row header';

    const name = document.createElement('input');
    name.placeholder = 'Name';
    name.value = s.name;

    const baseUrl = document.createElement('input');
    baseUrl.placeholder = 'Base URL (e.g., https://danbooru.donmai.us)';
    baseUrl.value = s.baseUrl;

    const type = document.createElement('select');
    ['danbooru', 'moebooru', 'gelbooru', 'zerochan'].forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (s.type === t) opt.selected = true;
      type.appendChild(opt);
    });

    const rating = document.createElement('select');
    RATINGS.forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r.value;
      opt.textContent = r.label;
      if (s.rating === r.value) opt.selected = true;
      rating.appendChild(opt);
    });

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'btn-small danger';
    del.addEventListener('click', () => onDelete(idx));

    header.appendChild(name);
    header.appendChild(baseUrl);
    header.appendChild(type);
    header.appendChild(rating);
    header.appendChild(del);

    const line = document.createElement('div');
    line.className = 'row line';

    const tags = document.createElement('input');
    tags.placeholder = 'Additional tags (e.g., landscape 1girl)';
    tags.value = s.tags;

    const picker = document.createElement('select');
    const dash = document.createElement('option');
    dash.value = '';
    dash.textContent = 'Pick popular site…';
    picker.appendChild(dash);
    (POPULAR_SITES[s.type] || []).forEach(({ label, url }) => {
      const opt = document.createElement('option');
      opt.value = url;
      opt.textContent = label;
      picker.appendChild(opt);
    });
    picker.addEventListener('change', () => {
      if (picker.value) {
        baseUrl.value = picker.value;
        s.baseUrl = picker.value;
        emitChange();
      }
    });

    line.appendChild(tags);
    line.appendChild(picker);

    const actions = document.createElement('div');
    actions.className = 'actions-row';

    const linkBtn = (label, handler, extraClass = '') => {
      const a = document.createElement('button');
      a.type = 'button';
      a.className = `link-btn ${extraClass}`.trim();
      a.textContent = label;
      a.addEventListener('click', handler);
      return a;
    };

    const openBtn = linkBtn('Open Account Page', () => {
      const url = accountUrlFor(s.type, s.baseUrl);
      if (url) window.api.openExternal(url);
    });
    const helpBtn = linkBtn('API Help', () => {
      const url = helpUrlFor(s.type, s.baseUrl);
      if (url) window.api.openExternal(url);
    });

    const testBtn = linkBtn('Test', async () => {
      // Reset badges/info
      apiBadge.textContent = 'API…'; apiBadge.className = 'badge warn';
      authBadge.textContent = 'Auth…'; authBadge.className = 'badge warn';
      infoSpan.textContent = '';
      rateBadge.textContent = '';
      rateBadge.title = '';

      // 1) API reachability
      try {
        const res = await onTest({
          name: s.name || s.baseUrl,
          baseUrl: s.baseUrl,
          type: s.type,
          rating: s.rating,
          tags: s.tags,
          credentials: s.credentials
        });
        const count = (res?.posts || []).length;
        if (count > 0) { apiBadge.textContent = 'API OK'; apiBadge.className = 'badge ok'; }
        else { apiBadge.textContent = 'No results'; apiBadge.className = 'badge warn'; }
      } catch {
        apiBadge.textContent = 'API error'; apiBadge.className = 'badge err';
      }

      // 2) Auth check (with account info)
      try {
        if (!s.credentials || Object.keys(s.credentials).length === 0) {
          authBadge.textContent = 'No creds'; authBadge.className = 'badge muted';
        } else {
          const out = await window.api.authCheck({ site: s });
          if (out?.supported === false) {
            authBadge.textContent = 'Auth n/a'; authBadge.className = 'badge muted';
          } else if (out?.ok) {
            authBadge.textContent = 'Auth OK'; authBadge.className = 'badge ok';
            if (out.info) {
              const nm = out.info.name ? String(out.info.name) : '';
              const lvl = (out.info.level !== undefined && out.info.level !== null) ? ` • level ${out.info.level}` : '';
              const id = out.info.id ? ` • id ${out.info.id}` : '';
              infoSpan.textContent = `${nm}${lvl}${id}`;
            }
          } else {
            authBadge.textContent = 'Auth fail'; authBadge.className = 'badge err';
            infoSpan.textContent = out?.reason ? String(out.reason) : '';
          }
        }
      } catch (e) {
        authBadge.textContent = 'Auth error'; authBadge.className = 'badge err';
      }

      // 3) Danbooru rate-limit peek
      try {
        if (s.type === 'danbooru') {
          const rl = await window.api.rateLimitCheck({ site: s });
          if (rl?.ok) {
            const rem = (rl.remaining ?? '').toString();
            const lim = (rl.limit ?? '').toString();
            rateBadge.textContent = lim && rem ? `RL ${rem}/${lim}` : 'RL n/a';
            // Tooltip show raw headers
            rateBadge.title = Object.entries(rl.headers || {})
              .map(([k, v]) => `${k}: ${v}`).join('\n');
          } else {
            rateBadge.textContent = 'RL err';
          }
        }
      } catch {
        rateBadge.textContent = 'RL err';
      }
    }, 'accent');

    const apiBadge = document.createElement('span'); apiBadge.className = 'badge muted'; apiBadge.textContent = '';
    const authBadge = document.createElement('span'); authBadge.className = 'badge muted'; authBadge.textContent = '';
    const rateBadge = document.createElement('span'); rateBadge.className = 'badge muted'; rateBadge.textContent = '';

    const infoSpan = document.createElement('span');
    infoSpan.className = 'hint';
    infoSpan.style.marginLeft = '6px';

    actions.appendChild(openBtn);
    actions.appendChild(helpBtn);
    actions.appendChild(testBtn);
    actions.appendChild(apiBadge);
    actions.appendChild(authBadge);
    actions.appendChild(rateBadge);
    actions.appendChild(infoSpan);

    const authWrap = document.createElement('div');
    authWrap.className = 'auth light';

    const authHint = document.createElement('div');
    authHint.className = 'hint';
    authHint.style.gridColumn = '1 / -1';
    authHint.textContent =
      s.type === 'moebooru'
        ? 'Use Login + Password Hash (from your account page).'
        : s.type === 'danbooru'
        ? 'Use Login + API Key from your profile.'
        : s.type === 'gelbooru'
        ? 'Use User ID + API Key if supported.'
        : 'No authentication for this engine.';

    const authField = function (ph, key) {
      const input = document.createElement('input');
      input.placeholder = ph;
      input.value = s.credentials[key] || '';
      input.addEventListener('change', () => {
        s.credentials[key] = input.value.trim();
        emitChange();
      });
      return input;
    };

    const rebuildAuth = function () {
      authWrap.innerHTML = '';
      authWrap.appendChild(authHint);
      if (s.type === 'danbooru') {
        authWrap.appendChild(authField('Login', 'login'));
        authWrap.appendChild(authField('API Key', 'api_key'));
      } else if (s.type === 'moebooru') {
        authWrap.appendChild(authField('Login', 'login'));
        authWrap.appendChild(authField('Password Hash', 'password_hash'));
      } else if (s.type === 'gelbooru') {
        authWrap.appendChild(authField('User ID', 'user_id'));
        authWrap.appendChild(authField('API Key', 'api_key'));
      } else {
        const note = document.createElement('div');
        note.className = 'hint';
        note.style.gridColumn = '1 / -1';
        note.textContent = 'This site does not have token login.';
        authWrap.appendChild(note);
      }
    };
    rebuildAuth();

    card.appendChild(header);
    card.appendChild(line);
    card.appendChild(actions);
    card.appendChild(authWrap);

    const emitChange = function () {
      s.tags = stripRatingTokens(s.tags);
      onChange(idx, { ...s });
    };

    [name, baseUrl, type, rating, tags].forEach((el) => {
      el.addEventListener('change', () => {
        s.name = name.value.trim();
        s.baseUrl = baseUrl.value.trim();
        s.type = type.value;
        s.rating = rating.value;
        s.tags = stripRatingTokens(tags.value);
        if (el === type) {
          while (picker.firstChild) picker.removeChild(picker.firstChild);
          const dash2 = document.createElement('option');
          dash2.value = '';
          dash2.textContent = 'Pick popular site…';
          picker.appendChild(dash2);
          (POPULAR_SITES[s.type] || []).forEach(({ label, url }) => {
            const opt = document.createElement('option');
            opt.value = url;
            opt.textContent = label;
            picker.appendChild(opt);
          });
          rebuildAuth();
        }
        emitChange();
      });
    });

    return card;
  };

  window.renderSiteManager = function (container, config, onSave, onClose) {
    try {
      container.innerHTML = '';
      container.classList.remove('hidden');
      container.setAttribute('aria-hidden', 'false');
      container.setAttribute('role', 'dialog');
      container.setAttribute('aria-modal', 'true');
      container.setAttribute('tabindex', '-1');

      const panel = document.createElement('div');
      panel.className = 'panel';
      const h2 = document.createElement('h2');
      h2.textContent = 'Manage Sites';
      panel.appendChild(h2);

      const content = document.createElement('div');
      content.className = 'content-scroll';

      const list = document.createElement('div');
      const sites = config.sites ? [...config.sites] : [];

      const rerenderList = function () {
        list.innerHTML = '';
        sites.forEach((s, i) => {
          list.appendChild(
            siteCard(
              s,
              i,
              (idx, updated) => { sites[idx] = { ...sites[idx], ...updated, tags: stripRatingTokens(updated.tags) }; },
              (idx) => { sites.splice(idx, 1); rerenderList(); },
              async (probeSite) => await window.api.fetchBooru({ site: probeSite, viewType: 'new', limit: 3, cursor: null })
            )
          );
        });
      };

      rerenderList();
      content.appendChild(list);

      const addRow = document.createElement('div');
      addRow.className = 'add-row';
      const addBtn = document.createElement('button');
      addBtn.textContent = 'Add Site';
      addBtn.className = 'btn-small';
      addBtn.addEventListener('click', () => {
        sites.push({ name: 'New Site', type: 'danbooru', baseUrl: '', rating: 'safe', tags: '', credentials: {} });
        rerenderList();
      });
      addRow.appendChild(addBtn);
      content.appendChild(addRow);

      panel.appendChild(content);

      const btns = document.createElement('div');
      btns.className = 'btns';

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';

      const save = document.createElement('button');
      save.type = 'button';
      save.textContent = 'Save';

      const hide = function () {
        container.classList.add('hidden');
        container.setAttribute('aria-hidden', 'true');
        container.innerHTML = '';
        container.removeEventListener('click', backdropHandler, true);
        document.removeEventListener('keydown', escHandler, true);
        onClose?.();
      };

      const setBusy = function (busy) {
        save.disabled = busy;
        cancel.disabled = busy;
        save.textContent = busy ? 'Saving…' : 'Save';
      };

      const escHandler = function (e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); hide(); } };
      const backdropHandler = function (e) { if (e.target === container) hide(); };

      cancel.addEventListener('click', () => hide());
      save.addEventListener('click', async () => {
        setBusy(true);
        try {
          const sanitized = (sites || [])
            .filter((s) => (s.baseUrl || '').trim().length > 0)
            .map((s) => ({
              name: s.name?.trim() || s.baseUrl,
              baseUrl: s.baseUrl?.trim(),
              type: s.type || 'danbooru',
              rating: s.rating || 'any',
              tags: stripRatingTokens(s.tags || ''),
              credentials: s.credentials || {}
            }));
          await onSave({ sites: sanitized });
          hide();
        } finally {
          setBusy(false);
        }
      });

      btns.appendChild(cancel);
      btns.appendChild(save);
      panel.appendChild(btns);

      container.appendChild(panel);

      document.addEventListener('keydown', escHandler, true);
      container.addEventListener('click', backdropHandler, true);
      setTimeout(() => container.focus(), 0);
    } catch (err) {
      console.error('renderSiteManager failed:', err);
      alert('Failed to open Manage Sites. See Console for details.');
    }
  };
})();
