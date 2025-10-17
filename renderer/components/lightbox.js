(function () {
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
      const base = p.split('/').pop() || 'image';
      return base.includes('.') ? '_' + base : '_' + base + '.jpg';
    } catch {
      return '_image.jpg';
    }
  };

  const keyFor = function (post) {
    return `${post?.site?.baseUrl || ''}#${post?.id}`;
  };

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

    const img = document.createElement('img');
    const full = post.file_url || post.sample_url || post.preview_url || '';
    setImageWithFallback(img, full);
    img.alt = post.tags?.join(' ') || '';

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
    openBtn.textContent = 'Open Image';
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
      const nameGuess = (post.tags?.slice(0, 4).join('_') || 'image') + pathFromUrl(full);
      const res = await window.api.downloadImage({
        url: full,
        siteName: post.site?.name || post.site?.baseUrl || 'site',
        fileName: nameGuess
      });
      if (!res?.ok && !res?.cancelled) {
        alert('Download failed' + (res?.error ? `: ${res.error}` : ''));
      }
    });

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
    toolbar.appendChild(localBtn);

    content.appendChild(closeBtn);
    content.appendChild(img);
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
