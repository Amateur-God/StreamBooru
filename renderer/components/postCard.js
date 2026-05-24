(() => {
  const openExternal = (url) => { if (url) window.api.openExternal(url); };

  const isElectron = () => !!(window.Platform?.isElectron?.());
  const isAndroid = () => !!(window.Platform?.isAndroid?.());
  const isWebBrowser = () => !isElectron() && !isAndroid();

  const isVideoUrl = (u) => {
    try { const p = new URL(u, 'https://x/').pathname.toLowerCase(); return /\.(mp4|webm|mov|m4v)$/i.test(p); }
    catch { return /\.(mp4|webm|mov|m4v)$/i.test(String(u || '').toLowerCase()); }
  };

  function isHotlinkHost(u) {
    try {
      const h = new URL(u).hostname.toLowerCase();
      return (
        h.endsWith('donmai.us') ||
        h === 'files.yande.re' || h.endsWith('yande.re') ||
        h === 'konachan.com' || h === 'konachan.net' ||
        h.endsWith('e621.net') || h.endsWith('e926.net') ||
        h.endsWith('e621.media') || h.endsWith('e926.media') ||
        h.endsWith('derpibooru.org') || h.endsWith('derpicdn.net') ||
        h.endsWith('gelbooru.com') || h.endsWith('safebooru.org') ||
        h.endsWith('rule34.xxx') || h.endsWith('realbooru.com') || h.endsWith('xbooru.com') ||
        h.endsWith('tbib.org') || h.endsWith('hypnohub.net')
      );
    } catch { return false; }
  }

  const thumbCandidates = (post) =>
    [post.preview_url, post.sample_url, post.file_url]
      .filter(Boolean)
      .filter((u) => !isVideoUrl(u));

  const isVideoPost = (post) =>
    !!post.is_video || isVideoUrl(post.file_url || '') || isVideoUrl(post.sample_url || '');

  async function proxyIntoImg(imgEl, url) {
    if (!window.api?.proxyImage || !url || isVideoUrl(url)) return false;
    try {
      const prox = await window.api.proxyImage(url);
      if (prox?.ok && (prox.dataUrl || prox.url)) {
        imgEl.src = prox.dataUrl || prox.url;
        return imgEl.complete ? imgEl.naturalWidth > 0 : true;
      }
    } catch (e) {
      console.warn('proxyImage failed (thumb)', e);
    }
    return false;
  }

  /** Direct load first on Electron (webRequest injects Referer); proxy on error or web/Android hotlinks. */
  function attachThumbImage(imgEl, urls, onGiveUp) {
    if (!urls.length) {
      onGiveUp?.();
      return;
    }

    let idx = 0;

    const tryDirect = (url) => new Promise((resolve) => {
      const finish = (ok) => {
        imgEl.onload = null;
        imgEl.onerror = null;
        resolve(ok);
      };
      imgEl.onload = () => finish(imgEl.naturalWidth > 0);
      imgEl.onerror = () => finish(false);
      imgEl.removeAttribute('srcset');
      imgEl.src = url;

      if ((isWebBrowser() || isAndroid()) && isHotlinkHost(url)) {
        imgEl.onload = null;
        imgEl.onerror = null;
        proxyIntoImg(imgEl, url).then(resolve);
      }
    });

    const run = async () => {
      while (idx < urls.length) {
        const url = urls[idx++];
        if (await tryDirect(url)) return;
        if (await proxyIntoImg(imgEl, url)) return;
      }
      onGiveUp?.();
    };

    run();
  }

  function attachVideoThumb(thumbEl, url, onGiveUp) {
    if (!url) {
      onGiveUp?.();
      return;
    }

    thumbEl.classList.add('thumb--video');
    const vid = document.createElement('video');
    vid.className = 'thumb-video';
    vid.muted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.autoplay = true;
    vid.preload = 'auto';
    vid.setAttribute('aria-label', 'Video preview');
    vid.draggable = false;

    const play = () => { try { vid.play()?.catch(() => {}); } catch {} };

    const loadBlob = async () => {
      try {
        const blob = await window.api.fetchMediaBlob?.(url);
        if (!blob) return false;
        const objUrl = URL.createObjectURL(blob);
        vid._blobUrl = objUrl;
        vid.src = objUrl;
        return true;
      } catch {
        return false;
      }
    };

    vid.onloadeddata = play;
    vid.onerror = async () => {
      if (await loadBlob()) return;
      if (vid._blobUrl) URL.revokeObjectURL(vid._blobUrl);
      vid.remove();
      onGiveUp?.();
    };

    vid.src = url;
    thumbEl.insertBefore(vid, thumbEl.firstChild);
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

    const videoPost = isVideoPost(post);
    const staticUrls = thumbCandidates(post);
    const gridVideo = post.grid_video_url || '';

    const showPlaceholder = () => {
      thumb.classList.add('thumb--video');
      const placeholder = document.createElement('div');
      placeholder.className = 'thumb-placeholder';
      placeholder.setAttribute('aria-label', videoPost ? 'Video post' : 'No preview');
      placeholder.textContent = videoPost ? '▶' : '?';
      thumb.appendChild(placeholder);
    };

    const fallbackFromStatic = () => {
      if (gridVideo) attachVideoThumb(thumb, gridVideo, showPlaceholder);
      else showPlaceholder();
    };

    if (staticUrls.length) {
      const img = document.createElement('img');
      img.loading = index < 16 ? 'eager' : 'lazy';
      img.decoding = 'async';
      img.alt = videoPost ? 'Video preview' : String(post?.id ?? '');
      img.draggable = false;
      img.style.touchAction = 'pan-y';
      img.style.userSelect = 'none';
      img.style.webkitUserDrag = 'none';
      thumb.appendChild(img);
      attachThumbImage(img, staticUrls, () => {
        img.remove();
        fallbackFromStatic();
      });

      if (videoPost) {
        const badge = document.createElement('span');
        badge.className = 'thumb-video-badge';
        badge.textContent = '▶';
        badge.setAttribute('aria-hidden', 'true');
        thumb.appendChild(badge);
      }
    } else if (gridVideo) {
      attachVideoThumb(thumb, gridVideo, showPlaceholder);
    } else {
      showPlaceholder();
    }

    const hit = document.createElement('div');
    hit.className = 'hitbox';
    hit.setAttribute('role', 'button');
    hit.setAttribute('tabindex', '-1');
    onTap(hit, () => { if (window.openLightbox) window.openLightbox(post); });
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
