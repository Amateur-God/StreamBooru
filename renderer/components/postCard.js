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

  const isVideoUrl = function (u) {
    if (!u) return false;
    try {
      const path = new URL(u, 'https://x/').pathname.toLowerCase();
      return /\.(mp4|webm|mov|m4v)$/i.test(path);
    } catch {
      return /\.(mp4|webm|mov|m4v)$/i.test(String(u).toLowerCase());
    }
  };

  const postKey = function (post) {
    return `${post?.site?.baseUrl || ''}#${post?.id}`;
  };

  window.PostCard = function (post, index) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.key = postKey(post); // anchor for scroll preservation

    const thumb = document.createElement('div');
    thumb.className = 'thumb';

    // Prefer a sharp image for the grid (sample/file if image; fallback to preview)
    const sample = post.sample_url || '';
    const file = post.file_url || '';
    const preview = post.preview_url || '';
    const thumbUrl = (!isVideoUrl(sample) && sample) ? sample
                    : (!isVideoUrl(file) && file) ? file
                    : preview;

    const img = document.createElement('img');
    img.loading = 'lazy';
    setImageWithFallback(img, thumbUrl);

    // Hint if the underlying media is a video
    const isVideo = isVideoUrl(post.file_url || post.sample_url || '');
    img.alt = post.tags?.slice(0, 16).join(' ');
    img.title = (isVideo ? '▶ Video • ' : '') + (post.tags?.slice(0, 16).join(' ') || '');

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

    const btnMedia = document.createElement('button');
    btnMedia.textContent = 'Open Media';
    btnMedia.addEventListener('click', () => {
      if (typeof window.openLightboxAt === 'function') window.openLightboxAt(index);
      else if (typeof window.openLightbox === 'function') window.openLightbox(post);
    });

    // Remote favorite (site API) if available (renderer exposes helpers)
    const canRemoteFav = typeof window.hasRemoteFavoriteSupport === 'function' && window.hasRemoteFavoriteSupport(post);
    let btnRemote;
    if (canRemoteFav) {
      btnRemote = document.createElement('button');
      const setRemoteTxt = (f) => { btnRemote.textContent = f ? '♥ Favorited' : '♥ Favorite'; };
      let remoteFav = !!(post.user_favorited || post._remote_favorited);
      setRemoteTxt(remoteFav);
      btnRemote.addEventListener('click', async () => {
        if (!window.toggleRemoteFavoriteRemote) return;
        btnRemote.disabled = true;
        const res = await window.toggleRemoteFavoriteRemote(post);
        if (res?.ok) {
          remoteFav = !!res.favorited;
          setRemoteTxt(remoteFav);
        } else {
          alert('Favorite failed' + (res?.error ? `: ${res.error}` : ''));
        }
        btnRemote.disabled = false;
      });
    }

    // Local favorites
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
    actions.appendChild(btnMedia);
    if (btnRemote) actions.appendChild(btnRemote);
    actions.appendChild(btnLocal);

    el.appendChild(thumb);
    el.appendChild(meta);
    el.appendChild(actions);
    el.title = `${post.tags?.join(' ')}\n${formatDate(post.created_at)}`;

    return el;
  };
})();
