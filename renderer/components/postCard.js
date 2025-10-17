(function () {
  const formatDate = function (iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    } catch {
      return '';
    }
  };

  const setImageWithFallback = function (img, url) {
    if (!url) return;
    img.src = url;
    img.onerror = async () => {
      try {
        const res = await window.api.proxyImage(url);
        if (res?.ok && res.dataUrl) {
          img.src = res.dataUrl;
        }
      } catch (_) {}
    };
  };

  // Compute the stable key (site baseUrl + id)
  const postKey = function (post) {
    return `${post?.site?.baseUrl || ''}#${post?.id}`;
  };

  window.PostCard = function (post, index) {
    const el = document.createElement('div');
    el.className = 'card';

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const img = document.createElement('img');
    img.loading = 'lazy';

    const thumbUrl = post.sample_url || post.file_url || post.preview_url || '';
    setImageWithFallback(img, thumbUrl);

    img.alt = post.tags?.slice(0, 16).join(' ');
    img.addEventListener('click', () => {
      if (typeof window.openLightboxAt === 'function') window.openLightboxAt(index);
      else if (typeof window.openLightbox === 'function') window.openLightbox(post);
    });
    thumb.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const left = document.createElement('div');
    const favs = typeof post.favorites === 'number' ? post.favorites : 0;
    const score = typeof post.score === 'number' ? post.score : 0;
    left.textContent = `♥ ${favs}  ★ ${score}`;
    const right = document.createElement('div');
    right.className = 'site';
    right.textContent = post.site?.name || post.site?.baseUrl || '';
    meta.appendChild(left);
    meta.appendChild(right);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const btnOpen = document.createElement('button');
    btnOpen.textContent = 'Open Post';
    btnOpen.disabled = !post.post_url;
    btnOpen.addEventListener('click', () => window.api.openExternal(post.post_url));

    const btnImage = document.createElement('button');
    btnImage.textContent = 'Open Image';
    btnImage.addEventListener('click', () => {
      if (typeof window.openLightboxAt === 'function') window.openLightboxAt(index);
      else if (typeof window.openLightbox === 'function') window.openLightbox(post);
    });

    const btnLocal = document.createElement('button');
    const setLocalBtnState = (saved) => {
      btnLocal.textContent = saved ? '♥ Saved' : '♥ Save';
    };
    setLocalBtnState(window.isLocalFavorite?.(post) === true);
    btnLocal.addEventListener('click', async () => {
      const res = await window.toggleLocalFavorite?.(post);
      setLocalBtnState(res?.favorited);
    });

    actions.appendChild(btnOpen);
    actions.appendChild(btnImage);
    actions.appendChild(btnLocal);

    el.appendChild(thumb);
    el.appendChild(meta);
    el.appendChild(actions);
    el.title = `${post.tags?.join(' ')}\n${formatDate(post.created_at)}`;

    return el;
  };
})();
