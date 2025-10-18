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
  const setImageWithFallback = function (img, url) {
    if (!url) return;
    img.src = url;
    img.onerror = async () => {
      try {
        const res = await window.api.proxyImage(url);
        if (res?.ok && res.dataUrl) img.src = res.dataUrl;
      } catch (_) {}
    };
  };
  const pathFromUrl = function (u) {
    try {
      const p = new URL(u).pathname;
      const base = p.split('/').pop() || 'media';
      return base.includes('.') ? '_' + base : '_' + base + '.jpg';
    } catch {
      return '_media';
    }
  };

  // Codec support detection
  function canPlayMp4H264() {
    const v = document.createElement('video');
    // Common baseline profile string; empty string means “no”
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

  const hasRemote = (post) => typeof window.hasRemoteFavoriteSupport === 'function' && window.hasRemoteFavoriteSupport(post);
  const toggleRemote = (post) => window.toggleRemoteFavoriteRemote?.(post);

  const renderForIndex = function (lb, index) {
    const items = (typeof window.getGalleryItems === 'function') ? window.getGalleryItems() : [];
    if (!items || !items[index]) return;
    const post = items[index];

    lb.innerHTML = '';
    const content = document.createElement('div');
    content.className = 'content';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close';
    closeBtn.textContent = 'Close (Esc)';
    closeBtn.addEventListener('click', () => hide(lb));

    const full = post.file_url || post.sample_url || post.preview_url || '';
    const isVid = isVideoUrl(full);

    let mediaEl;
    let tipEl = null;

    if (isVid) {
      const mp4 = full.toLowerCase().endsWith('.mp4') || full.toLowerCase().endsWith('.m4v');
      const webm = full.toLowerCase().endsWith('.webm');

      const mp4Ok = canPlayMp4H264();
      const webmOk = canPlayWebmVp9();

      // If the current build can’t decode the format, show a tip and don’t try to auto-play.
      const unsupported =
        (mp4 && !mp4Ok) ||
        (webm && !webmOk) ||
        (!mp4 && !webm && !mp4Ok && !webmOk); // unknown extension: require at least one support

      const vid = document.createElement('video');
      vid.className = 'lb-media';
      vid.controls = true;
      vid.autoplay = !unsupported;
      vid.loop = true;
      vid.muted = true; // autoplay requirement
      vid.playsInline = true;
      vid.preload = 'auto';
      if (post.preview_url) vid.poster = post.preview_url;

      const source = document.createElement('source');
      source.src = full;
      const t = guessVideoType(full);
      if (t) source.type = t;
      vid.appendChild(source);

      const tryPlay = () => {
        try { vid.load(); } catch {}
        const p = vid.play?.();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      };

      if (!unsupported) {
        vid.addEventListener('canplay', tryPlay, { once: true });
        vid.addEventListener('loadeddata', tryPlay, { once: true });
        vid.addEventListener('stalled', tryPlay);
        vid.addEventListener('suspend', tryPlay);
        // Also trigger a play when user clicks the video area
        vid.addEventListener('click', () => {
          if (vid.paused) { tryPlay(); } else { vid.pause(); }
        });
      } else {
        tipEl = makeTip('This Electron build lacks codecs for this video. Use “Open Media” to view in your browser.');
      }

      // Proxy fallback only helps with headers; it can’t add codecs.
      let proxiedOnce = false;
      const setProxyAndTry = async () => {
        if (proxiedOnce) return;
        proxiedOnce = true;
        try {
          const res = await window.api.proxyImage(full);
          if (res?.ok && res.dataUrl) {
            vid.pause();
            while (vid.firstChild) vid.removeChild(vid.firstChild);
            const s2 = document.createElement('source');
            s2.src = res.dataUrl;
            vid.appendChild(s2);
            if (!unsupported) tryPlay();
          }
        } catch {}
      };
      vid.addEventListener('error', setProxyAndTry);

      mediaEl = vid;
    } else {
      const img = document.createElement('img');
      img.className = 'lb-media';
      setImageWithFallback(img, full);
      img.alt = post.tags?.join(' ') || '';
      mediaEl = img;
    }

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
    openBtn.addEventListener('click', () => {
      if (full) window.api.openExternal(full);
    });

    const postBtn = document.createElement('button');
    postBtn.textContent = 'View Post';
    postBtn.addEventListener('click', () => {
      if (post.post_url) window.api.openExternal(post.post_url);
    });

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
      if (!res?.ok && !res?.cancelled) {
        alert('Download failed' + (res?.error ? `: ${res.error}` : ''));
      }
    });

    // Remote favorite button (when supported)
    let remoteBtn = null;
    if (hasRemote(post)) {
      remoteBtn = document.createElement('button');
      const setTxt = (f) => { remoteBtn.textContent = f ? '♥ Favorited' : '♥ Favorite'; };
      let fav = !!(post.user_favorited || post._remote_favorited);
      setTxt(fav);
      remoteBtn.addEventListener('click', async () => {
        remoteBtn.disabled = true;
        const res = await toggleRemote(post);
        if (res?.ok) {
          fav = !!res.favorited;
          setTxt(fav);
        } else {
          alert('Favorite failed' + (res?.error ? `: ${res.error}` : ''));
        }
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
    content.appendChild(mediaEl);
    if (tipEl) content.appendChild(tipEl);
    content.appendChild(toolbar);
    lb.appendChild(content);

    const keyHandler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); hide(lb); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prevBtn.click(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); nextBtn.click(); }
    };
    document.removeEventListener('keydown', lb._keyHandler, true);
    lb._keyHandler = keyHandler;
    document.addEventListener('keydown', keyHandler, true);

    lb.onclick = (e) => { if (e.target === lb) hide(lb); };
  };

  const hide = function (lb) {
    document.removeEventListener('keydown', lb._keyHandler, true);
    lb._keyHandler = null;
    lb.classList.add('hidden');
    lb.setAttribute('aria-hidden', 'true');
    lb.innerHTML = '';
    lb.onclick = null;
  };

  window.openLightboxAt = function (index) {
    const lb = document.getElementById('lightbox');
    lb.classList.remove('hidden');
    lb.setAttribute('aria-hidden', 'false');
    renderForIndex(lb, index);
  };

  window.openLightbox = function (post) {
    const items = (typeof window.getGalleryItems === 'function') ? window.getGalleryItems() : [];
    const idx = items.findIndex((p) => `${p?.site?.baseUrl || ''}#${p?.id}` === `${post?.site?.baseUrl || ''}#${post?.id}`);
    window.openLightboxAt(idx >= 0 ? idx : 0);
  };
})();
