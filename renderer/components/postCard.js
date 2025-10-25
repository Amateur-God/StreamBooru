(() => {
  const openExternal = (url) => {
    if (url) window.api.openExternal(url);
  };

  const isAndroid = () => !!(window.Platform && typeof window.Platform.isAndroid === 'function' && window.Platform.isAndroid());

  // Prefer larger sample/large image; preview last.
  const pickThumb = (post) => post.sample_url || post.file_url || post.preview_url || '';

  // Hosts that commonly hotlink-block
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

  // Tap helper: only fire on “true tap” (short + minimal move), not while scrolling
  function onTap(el, handler, opts = {}) {
    const maxMove = opts.maxMove ?? 10;   // px
    const maxTime = opts.maxTime ?? 350;  // ms
    let startX = 0, startY = 0, t0 = 0, moved = 0, active = false;

    const onDown = (e) => {
      active = true;
      const p = e.touches ? e.touches[0] : e;
      startX = p.clientX; startY = p.clientY; t0 = Date.now(); moved = 0;
    };
    const onMove = (e) => {
      if (!active) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - startX;
      const dy = p.clientY - startY;
      moved = Math.max(moved, Math.hypot(dx, dy));
    };
    const onUp = (e) => {
      if (!active) return;
      active = false;
      const dt = Date.now() - t0;
      if (moved <= maxMove && dt <= maxTime) handler(e);
    };

    el.addEventListener('pointerdown', onDown, { passive: true });
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerup', onUp, { passive: true });
    el.addEventListener('pointercancel', () => { active = false; }, { passive: true });
  }

  // Try to proxy an image that failed due to hotlink/CORS using native HTTP -> data URL
  async function tryProxyImage(imgEl, url) {
    try {
      if (!window.api || typeof window.api.proxyImage !== 'function') return;
      if (!url) return;
      if (imgEl._proxiedOnce) return;
      imgEl._proxiedOnce = true;
      const prox = await window.api.proxyImage(url);
      if (prox && prox.ok && (prox.url || prox.dataUrl)) {
        imgEl.src = prox.url || prox.dataUrl;
        imgEl.removeAttribute('srcset');
      }
    } catch (e) {
      console.error('proxyImage failed', e);
    }
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
        const url = mediaUrl;
        if (!url) return;
        const siteName = post?.site?.name || post?.site?.baseUrl || 'unknown';
        const fileName = (window.getFileNameForPost ? window.getFileNameForPost(post, idx) : null);
        await window.api.downloadImage({ url, siteName, fileName });
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

    const candidates = [];
    if (post.sample_url) candidates.push(`${post.sample_url} 1x`);
    if (post.file_url && post.file_url !== post.sample_url) candidates.push(`${post.file_url} 2x`);
    if (candidates.length) img.srcset = candidates.join(', ');

    img.addEventListener('error', () => tryProxyImage(img, thumbUrl));

    // Android proactive proxy for hotlinking hosts or if loading stalls
    if (isAndroid() && thumbUrl) {
      if (isHotlinkHost(thumbUrl)) {
        tryProxyImage(img, thumbUrl);
      } else {
        let timer = setTimeout(() => tryProxyImage(img, thumbUrl), 1500);
        const clearAll = () => { clearTimeout(timer); timer = null; };
        img.addEventListener('load', clearAll, { once: true });
        img.addEventListener('error', clearAll, { once: true });
      }
    }

    // Primary: robust pointer tap
    onTap(img, () => { if (window.openLightbox) window.openLightbox(post); });

    // Android fallback: some WebViews miss pointerup on certain sites (e.g., Yande.re)
    if (isAndroid()) {
      img.addEventListener('click', () => { if (window.openLightbox) window.openLightbox(post); });
    }

    thumb.appendChild(img);

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
    siteA.addEventListener('click', (e) => {
      e.preventDefault();
      if (post.post_url) openExternal(post.post_url);
    });
    right.appendChild(siteA);
    meta.appendChild(left);
    meta.appendChild(right);

    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(buildActions(post, index));

    return card;
  };
})();