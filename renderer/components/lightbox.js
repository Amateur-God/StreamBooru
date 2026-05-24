(function () {
  const isVideoUrl = function (u) {
    if (!u) return false;
    try {
      const path = new URL(u, 'https://x/').pathname.toLowerCase();
      return /\.(mp4|webm|mov|m4v)$/i.test(path);
    } catch {
      return /\.(mp4|webm|mov|m4v)$/i.test(String(u).toLowerCase());
    }
  };
  const guessVideoType = function (u) {
    try {
      const path = new URL(u, 'https://x/').pathname.toLowerCase();
      if (path.endsWith('.mp4') || path.endsWith('.m4v')) return 'video/mp4';
      if (path.endsWith('.webm')) return 'video/webm';
      if (path.endsWith('.mov')) return 'video/quicktime';
    } catch {}
    return '';
  };

  const isAndroid = () => !!(window.Platform && typeof window.Platform.isAndroid === 'function' && window.Platform.isAndroid());
  const isElectron = () => !!(window.Platform && typeof window.Platform.isElectron === 'function' && window.Platform.isElectron());
  const isWebBrowser = () => !isElectron() && !isAndroid();

  function isHotlinkHost(u) {
    try {
      const h = new URL(u).hostname;
      return (
        h.endsWith('donmai.us') ||
        h === 'files.yande.re' ||
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

  const setImageWithFallback = function (img, url) {
    if (!url) return;
    img.src = url;
    const proxy = async () => {
      try {
        const res = await window.api.proxyImage(url);
        if (res?.ok && res.dataUrl) img.src = res.dataUrl;
      } catch (_) {}
    };
    img.onerror = proxy;
    if ((isAndroid() || isWebBrowser()) && isHotlinkHost(url)) proxy();
  };

  async function setVideoWithFallback(vid, url, sourceEl) {
    if (!url) return;
    const needsProxy = (isAndroid() || isWebBrowser()) && isHotlinkHost(url);

    const loadDirect = () => {
      if (sourceEl) {
        sourceEl.src = url;
        const t = guessVideoType(url);
        if (t) sourceEl.type = t;
      } else {
        vid.src = url;
      }
      try { vid.load(); } catch {}
    };

    const loadProxied = async () => {
      try {
        const blob = await window.api.fetchMediaBlob?.(url);
        if (!blob) throw new Error('proxy unavailable');
        const objUrl = URL.createObjectURL(blob);
        vid._blobUrl = objUrl;
        if (sourceEl) {
          sourceEl.src = objUrl;
          sourceEl.type = blob.type || guessVideoType(url) || 'video/mp4';
        } else {
          vid.src = objUrl;
        }
        try { vid.load(); } catch {}
        const p = vid.play?.();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {
        console.warn('video proxy fallback failed', e);
        loadDirect();
      }
    };

    if (needsProxy) {
      await loadProxied();
    } else {
      loadDirect();
    }

    vid.addEventListener('error', () => {
      if (!vid._proxyRetried && window.api?.fetchMediaBlob) {
        vid._proxyRetried = true;
        loadProxied();
      }
    }, { once: true });
  }

  const pathFromUrl = function (u) {
    try {
      const p = new URL(u).pathname;
      const base = p.split('/').pop() || 'media';
      return base.includes('.') ? '_' + base : '_' + base + '.jpg';
    } catch {
      return '_media';
    }
  };

  function canPlayMp4H264() {
    const v = document.createElement('video');
    return !!v.canPlayType && !!v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
  }
  function canPlayWebmVp9() {
    const v = document.createElement('video');
    return !!v.canPlayType && !!v.canPlayType('video/webm; codecs="vp9,opus"');
  }

  function makeTip(msg) {
    const tip = document.createElement('div');
    tip.style.fontSize = '12px';
    tip.style.color = '#a9b0c0';
    tip.style.marginTop = '4px';
    tip.style.textAlign = 'center';
    tip.textContent = msg;
    return tip;
  }

  function createZoomController(viewport, mediaEl) {
    const state = { scale: 1, tx: 0, ty: 0, dragging: false, lastX: 0, lastY: 0 };

    const apply = () => {
      mediaEl.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
      viewport.classList.toggle('lb-zoomed', state.scale > 1.01);
    };

    const clampPan = () => {
      const maxX = Math.max(0, (viewport.clientWidth * (state.scale - 1)) / 2);
      const maxY = Math.max(0, (viewport.clientHeight * (state.scale - 1)) / 2);
      state.tx = Math.max(-maxX, Math.min(maxX, state.tx));
      state.ty = Math.max(-maxY, Math.min(maxY, state.ty));
    };

    const setScale = (next, originX, originY) => {
      const prev = state.scale;
      state.scale = Math.max(1, Math.min(4, next));
      if (state.scale === 1) {
        state.tx = 0;
        state.ty = 0;
      } else if (originX != null && originY != null && prev !== state.scale) {
        const rect = viewport.getBoundingClientRect();
        const cx = originX - rect.left - rect.width / 2;
        const cy = originY - rect.top - rect.height / 2;
        state.tx -= cx * (state.scale / prev - 1);
        state.ty -= cy * (state.scale / prev - 1);
        clampPan();
      }
      apply();
    };

    const reset = () => setScale(1);

    viewport.addEventListener('wheel', (e) => {
      if (mediaEl.tagName !== 'IMG') return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setScale(state.scale + delta, e.clientX, e.clientY);
    }, { passive: false });

    mediaEl.addEventListener('dblclick', (e) => {
      if (mediaEl.tagName !== 'IMG') return;
      e.preventDefault();
      if (state.scale > 1.01) reset();
      else setScale(2, e.clientX, e.clientY);
    });

    mediaEl.addEventListener('pointerdown', (e) => {
      if (state.scale <= 1.01) return;
      state.dragging = true;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      mediaEl.setPointerCapture?.(e.pointerId);
    });
    mediaEl.addEventListener('pointermove', (e) => {
      if (!state.dragging) return;
      state.tx += e.clientX - state.lastX;
      state.ty += e.clientY - state.lastY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      clampPan();
      apply();
    });
    mediaEl.addEventListener('pointerup', () => { state.dragging = false; });
    mediaEl.addEventListener('pointercancel', () => { state.dragging = false; });

    return {
      zoomIn: () => setScale(state.scale + 0.25),
      zoomOut: () => setScale(state.scale - 0.25),
      reset,
      handleKey(key) {
        if (key === '+' || key === '=') { zoomIn(); return true; }
        if (key === '-' || key === '_') { zoomOut(); return true; }
        if (key === '0') { reset(); return true; }
        return false;
      }
    };
  }

  const hasRemote = (post) => typeof window.hasRemoteFavoriteSupport === 'function' && window.hasRemoteFavoriteSupport(post);
  const toggleRemote = (post) => window.toggleRemoteFavoriteRemote?.(post);

  const pickFullUrl = function (post) {
    const f = post.file_url || '';
    const s = post.sample_url || '';
    const p = post.preview_url || '';
    const hot = (isAndroid() || isWebBrowser()) && (isHotlinkHost(f) || isHotlinkHost(s));
    const order = hot ? [s, f, p] : [f, s, p];
    for (const u of order) if (u) return u;
    return '';
  };

  const renderForIndex = function (lb, index) {
    const items = (typeof window.getGalleryItems === 'function') ? window.getGalleryItems() : [];
    if (!items || !items[index]) return;
    const post = items[index];

    if (lb._blobUrl) {
      try { URL.revokeObjectURL(lb._blobUrl); } catch {}
      lb._blobUrl = null;
    }

    lb.innerHTML = '';
    const content = document.createElement('div');
    content.className = 'content';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close';
    closeBtn.textContent = 'Close (Esc)';
    closeBtn.addEventListener('click', () => hide(lb));

    const full = pickFullUrl(post);
    const isVid = isVideoUrl(full);

    const viewport = document.createElement('div');
    viewport.className = 'lb-viewport';

    let mediaEl;
    let tipEl = null;
    let zoomCtl = null;

    if (isVid) {
      const mp4 = full.toLowerCase().endsWith('.mp4') || full.toLowerCase().endsWith('.m4v');
      const webm = full.toLowerCase().endsWith('.webm');

      const mp4Ok = canPlayMp4H264();
      const webmOk = canPlayWebmVp9();

      const unsupported =
        (mp4 && !mp4Ok) ||
        (webm && !webmOk) ||
        (!mp4 && !webm && !mp4Ok && !webmOk);

      const vid = document.createElement('video');
      vid.className = 'lb-media';
      vid.controls = true;
      vid.autoplay = !unsupported;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = 'auto';
      if (post.preview_url) vid.poster = post.preview_url;

      const source = document.createElement('source');
      vid.appendChild(source);

      const tryPlay = () => {
        try { vid.load(); } catch {}
        const p = vid.play?.();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      };

      if (!unsupported) {
        vid.addEventListener('canplay', tryPlay, { once: true });
        vid.addEventListener('loadeddata', tryPlay, { once: true });
        vid.addEventListener('click', () => {
          if (vid.paused) { tryPlay(); } else { vid.pause(); }
        });
        setVideoWithFallback(vid, full, source).then(() => {
          if (vid._blobUrl) lb._blobUrl = vid._blobUrl;
        });
      } else {
        tipEl = makeTip('This environment cannot decode this video. Use “Open Media”.');
      }

      mediaEl = vid;
    } else {
      const img = document.createElement('img');
      img.className = 'lb-media';
      setImageWithFallback(img, full);
      img.alt = post.tags?.join(' ') || '';
      mediaEl = img;
      zoomCtl = createZoomController(viewport, img);
    }

    viewport.appendChild(mediaEl);

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '← Prev';
    prevBtn.addEventListener('click', () => {
      const next = index - 1 >= 0 ? index - 1 : 0;
      renderForIndex(lb, next);
    });

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next →';
    nextBtn.addEventListener('click', () => {
      const next = index + 1 < items.length ? index + 1 : items.length - 1;
      renderForIndex(lb, next);
    });

    const openBtn = document.createElement('button');
    openBtn.textContent = 'Open Media';
    openBtn.addEventListener('click', () => { if (full) window.api.openExternal(full); });

    const postBtn = document.createElement('button');
    postBtn.textContent = 'View Post';
    postBtn.addEventListener('click', () => { if (post.post_url) window.api.openExternal(post.post_url); });

    const dlBtn = document.createElement('button');
    dlBtn.textContent = 'Download';
    dlBtn.addEventListener('click', async () => {
      if (!full) return;
      const nameGuess = (post.tags?.slice(0, 4).join('_') || 'media') + pathFromUrl(full);
      const res = await window.api.downloadImage({
        url: full,
        siteName: post.site?.name || post.site?.baseUrl || 'site',
        fileName: nameGuess
      });
      if (!res?.ok && !res?.cancelled) { alert('Download failed' + (res?.error ? `: ${res.error}` : '')); }
    });

    if (zoomCtl) {
      const zoomInBtn = document.createElement('button');
      zoomInBtn.textContent = 'Zoom +';
      zoomInBtn.addEventListener('click', () => zoomCtl.zoomIn());
      const zoomOutBtn = document.createElement('button');
      zoomOutBtn.textContent = 'Zoom −';
      zoomOutBtn.addEventListener('click', () => zoomCtl.zoomOut());
      const zoomResetBtn = document.createElement('button');
      zoomResetBtn.textContent = 'Reset';
      zoomResetBtn.addEventListener('click', () => zoomCtl.reset());
      toolbar.appendChild(zoomInBtn);
      toolbar.appendChild(zoomOutBtn);
      toolbar.appendChild(zoomResetBtn);
    }

    let remoteBtn = null;
    if (hasRemote(post)) {
      remoteBtn = document.createElement('button');
      const setTxt = (f) => { remoteBtn.textContent = f ? '♥ Favourited' : '♥ Favourite'; };
      let fav = !!(post.user_favorited || post._remote_favorited);
      setTxt(fav);
      remoteBtn.addEventListener('click', async () => {
        remoteBtn.disabled = true;
        const res = await toggleRemote(post);
        if (res?.ok) { fav = !!res.favorited; setTxt(fav); }
        else { alert('Favourite failed' + (res?.error ? `: ${res.error}` : '')); }
        remoteBtn.disabled = false;
      });
    }

    const localBtn = document.createElement('button');
    const setLocal = (saved) => { localBtn.textContent = saved ? '♥ Saved (local)' : '♥ Save (local)'; };
    setLocal(window.isLocalFavorite?.(post) === true);
    localBtn.addEventListener('click', async () => {
      const res = await window.toggleLocalFavorite?.(post);
      setLocal(res?.favorited);
    });

    toolbar.appendChild(prevBtn);
    toolbar.appendChild(nextBtn);
    toolbar.appendChild(openBtn);
    toolbar.appendChild(postBtn);
    toolbar.appendChild(dlBtn);
    if (remoteBtn) toolbar.appendChild(remoteBtn);
    toolbar.appendChild(localBtn);

    content.appendChild(closeBtn);
    content.appendChild(viewport);
    if (tipEl) content.appendChild(tipEl);
    content.appendChild(toolbar);
    lb.appendChild(content);

    const keyHandler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); hide(lb); return; }
      if (zoomCtl?.handleKey(e.key)) { e.preventDefault(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prevBtn.click(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); nextBtn.click(); }
    };
    document.removeEventListener('keydown', lb._keyHandler, true);
    lb._keyHandler = keyHandler;
    document.addEventListener('keydown', keyHandler, true);

    const guardUntil = Date.now() + 350;
    lb._openGuardUntil = guardUntil;
    lb.onclick = (e) => {
      if (Date.now() < (lb._openGuardUntil || 0)) return;
      if (e.target === lb) hide(lb);
    };
  };

  const hide = function (lb) {
    document.removeEventListener('keydown', lb._keyHandler, true);
    lb._keyHandler = null;
    if (lb._blobUrl) {
      try { URL.revokeObjectURL(lb._blobUrl); } catch {}
      lb._blobUrl = null;
    }
    lb.classList.add('hidden');
    lb.setAttribute('aria-hidden', 'true');
    lb.innerHTML = '';
    lb.onclick = null;
  };

  window.openLightboxAt = function (index) {
    const lb = document.getElementById('lightbox');
    lb.classList.remove('hidden');
    lb.setAttribute('aria-hidden', 'false');
    lb._openGuardUntil = Date.now() + 350;
    renderForIndex(lb, index);
  };

  window.openLightbox = function (post) {
    const items = (typeof window.getGalleryItems === 'function') ? window.getGalleryItems() : [];
    const idx = items.findIndex((p) => `${p?.site?.baseUrl || ''}#${p?.id}` === `${post?.site?.baseUrl || ''}#${post?.id}`);
    window.openLightboxAt(idx >= 0 ? idx : 0);
  };
})();
