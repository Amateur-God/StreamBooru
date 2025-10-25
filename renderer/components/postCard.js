(() => {
  const openExternal = (url) => { if (url) window.api.openExternal(url); };
  const isAndroid = () => !!(window.Platform && typeof window.Platform.isAndroid === 'function' && window.Platform.isAndroid());

  const isVideoUrl = (u) => {
    try { const p = new URL(u, 'https://x/').pathname.toLowerCase(); return /\.(mp4|webm|mov|m4v)$/i.test(p); }
    catch { return /\.(mp4|webm|mov|m4v)$/i.test(String(u || '').toLowerCase()); }
  };

  // Prefer preview image for any video post to avoid putting video into <img>
  const pickThumb = (post) => {
    const f = post.file_url || '';
    const s = post.sample_url || '';
    const p = post.preview_url || '';
    if ((isVideoUrl(f) || isVideoUrl(s)) && p) return p;
    return s || f || p || '';
  };

  function isHotlinkHost(u) {
    try {
      const h = new URL(u).hostname;
      return (
        h.endsWith('donmai.us') ||
        h === 'files.yande.re' ||
        h === 'konachan.com' || h === 'konachan.net' ||
        h.endsWith('e621.net') || h.endsWith('e926.net') ||
        h.endsWith('derpibooru.org') || h.endsWith('derpicdn.net') ||
        h.endsWith('gelbooru.com') || h.endsWith('safebooru.org') ||
        h.endsWith('rule34.xxx') || h.endsWith('realbooru.com') || h.endsWith('xbooru.com') ||
        h.endsWith('tbib.org') || h.endsWith('hypnohub.net')
      );
    } catch { return false; }
  }

  // tap (pointer-first with touch fallback)
  function onTap(el, handler, opts = {}) {
    const maxMove = opts.maxMove ?? 10;
    const maxTime = opts.maxTime ?? 350;
    let startX = 0, startY = 0, t0 = 0, moved = 0, active = false;

    const down = (e) => {
      active = true;
      const p = e.touches ? e.touches[0] : e;
      startX = p.clientX; startY = p.clientY; t0 = Date.now(); moved = 0;
    };
    const move = (e) => {
      if (!active) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - startX, dy = p.clientY - startY;
      moved = Math.max(moved, Math.hypot(dx, dy));
    };
    const up = () => {
      if (!active) return;
      active = false;
      const dt = Date.now() - t0;
      if (moved <= maxMove && dt <= maxTime) handler();
    };

    el.addEventListener('pointerdown', down, { passive: true });
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerup', up, { passive: true });
    el.addEventListener('pointercancel', () => { active = false; }, { passive: true });

    if (!('onpointerdown' in window)) {
      el.addEventListener('touchstart', down, { passive: true });
      el.addEventListener('touchmove', move, { passive: true });
      el.addEventListener('touchend', up, { passive: true });
      el.addEventListener('click', () => handler());
    }
  }

  async function tryProxyImage(imgEl, url, post) {
    try {
      if (!window.api?.proxyImage || !url || imgEl._proxiedOnce) return;
      // Never try to proxy a video into <img>
      if (isVideoUrl(url)) return;
      imgEl._proxiedOnce = true;
      const prox = await window.api.proxyImage(url);
      if (prox?.ok && (prox.url || prox.dataUrl)) {
        imgEl.src = prox.url || prox.dataUrl;
        imgEl.removeAttribute('srcset');
      }
    } catch (e) { console.warn('proxyImage failed (thumb)', e); }
  }

  const buildActions = (post, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'actions';

    const btnOpenPost = document.createElement('button');
    btnOpenPost.textContent = 'Open Post';
    btnOpenPost.addEventListener('click', () => openExternal(post.post_url));

    const mediaUrl = post.file_url || post.sample_url || post.preview_url || '';
    const btnOpenMedia = document.createElement('button');
    btnOpenMedia.textContent = 'Open Media';
    btnOpenMedia.addEventListener('click', () => openExternal(mediaUrl));

    const btnFav = document.createElement('button');
    btnFav.textContent = window.isLocalFavorite(post) ? '♥ Saved' : '♥ Save';
    btnFav.addEventListener('click', async () => {
      await window.toggleLocalFavorite(post);
      btnFav.textContent = window.isLocalFavorite(post) ? '♥ Saved' : '♥ Save';
    });

    const btnDownload = document.createElement('button');
    btnDownload.textContent = 'Download';
    btnDownload.addEventListener('click', async () => {
      try {
        if (!mediaUrl) return;
        const siteName = post?.site?.name || post?.site?.baseUrl || 'unknown';
        const fileName = (window.getFileNameForPost ? window.getFileNameForPost(post, idx) : null);
        await window.api.downloadImage({ url: mediaUrl, siteName, fileName });
      } catch (e) {
        console.error('Download error:', e);
        alert('Failed to download this media.');
      }
    });

    wrap.appendChild(btnOpenPost);
    wrap.appendChild(btnOpenMedia);
    wrap.appendChild(btnFav);
    wrap.appendChild(btnDownload);
    return wrap;
  };

  window.PostCard = (post, index = 0) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.key = `${post?.site?.baseUrl || ''}#${post?.id}`;

    const thumb = document.createElement('div');
    thumb.className = 'thumb';

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = String(post?.id ?? '');
    img.draggable = false;
    img.style.touchAction = 'pan-y';
    img.style.userSelect = 'none';
    img.style.webkitUserDrag = 'none';

    const thumbUrl = pickThumb(post);
    img.src = thumbUrl;

    // Only include image URLs in srcset (skip video URLs)
    const candidates = [];
    if (post.sample_url && !isVideoUrl(post.sample_url)) candidates.push(`${post.sample_url} 1x`);
    if (post.file_url && post.file_url !== post.sample_url && !isVideoUrl(post.file_url)) candidates.push(`${post.file_url} 2x`);
    if (candidates.length) img.srcset = candidates.join(', ');

    img.addEventListener('error', () => tryProxyImage(img, thumbUrl, post));
    if (isAndroid() && thumbUrl) {
      if (isHotlinkHost(thumbUrl)) {
        tryProxyImage(img, thumbUrl, post);
      } else {
        let t = setTimeout(() => tryProxyImage(img, thumbUrl, post), 1500);
        const clear = () => { if (t) { clearTimeout(t); t = null; } };
        img.addEventListener('load', clear, { once: true });
        img.addEventListener('error', clear, { once: true });
      }
    }

    // Full-coverage hitbox for reliable taps
    const hit = document.createElement('div');
    hit.className = 'hitbox';
    hit.setAttribute('role', 'button');
    hit.setAttribute('tabindex', '-1');
    onTap(hit, () => { if (window.openLightbox) window.openLightbox(post); });

    thumb.appendChild(img);
    thumb.appendChild(hit);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const left = document.createElement('div');
    const favs = Number.isFinite(post.favorites) ? post.favorites : 0;
    const score = Number.isFinite(post.score) ? post.score : 0;
    left.textContent = `♡ ${favs} ★ ${score}`;
    const right = document.createElement('div');
    const siteA = document.createElement('a');
    siteA.href = '#';
    siteA.className = 'site';
    siteA.textContent = post?.site?.name || post?.site?.type || 'site';
    siteA.addEventListener('click', (e) => { e.preventDefault(); if (post.post_url) openExternal(post.post_url); });
    right.appendChild(siteA);
    meta.appendChild(left);
    meta.appendChild(right);

    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(buildActions(post, index));

    return card;
  };
})();