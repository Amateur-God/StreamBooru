(function () {
  function openExternal(url) {
    if (url) window.api.openExternal(url);
  }

  function buildActions(post, idx) {
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
  }

  window.PostCard = function (post, index = 0) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.key = `${post?.site?.baseUrl || ''}#${post?.id}`;

    const thumb = document.createElement('div');
    thumb.className = 'thumb';

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = String(post?.id ?? '');
    img.src = post.preview_url || post.sample_url || post.file_url || '';
    img.addEventListener('click', () => {
      if (window.openLightbox) window.openLightbox(post);
    });
    thumb.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const left = document.createElement('div');
    left.textContent = `♡ ${isFinite(post.favorites) ? post.favorites : 0} ★ ${isFinite(post.score) ? post.score : 0}`;
    const right = document.createElement('div');
    const siteA = document.createElement('a');
    siteA.href = '#';
    siteA.className = 'site';
    siteA.textContent = post?.site?.name || post?.site?.type || 'site';
    siteA.addEventListener('click', (e)=>{ e.preventDefault(); if (post.post_url) openExternal(post.post_url); });
    right.appendChild(siteA);
    meta.appendChild(left);
    meta.appendChild(right);

    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(buildActions(post, index));

    return card;
  };
})();
