(function () {
  // A getter your view can register to supply the current tab's posts
  let getCurrentPosts = null;

  //   window.registerResultsProvider(() => currentPostsArray);
  window.registerResultsProvider = function (fn) {
    if (typeof fn === 'function') getCurrentPosts = fn;
  };

  // Map a post object to a downloadable item
  const toDownloadItem = function(post, i) {
    // Prefer the original file if present, fallback to sample/preview
    const url = post?.file_url || post?.sample_url || post?.preview_url || '';
    if (!url) return null;

    // Build a sensible filename
    const baseName = (() => {
      try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image'); }
      catch { return 'image'; }
    })();

    const ext = (baseName.includes('.') ? baseName.split('.').pop() : 'jpg').slice(0, 10);
    const safeSite = (post?.site?.name || post?.site?.type || 'site').replace(/[^\w.-]+/g, '_');
    const idPart = String(post?.id || i).replace(/[^\w.-]+/g, '_');
    const fileName = `${safeSite}-${idPart}.${ext}`.replace(/\.+\./g, '.');

    return {
      url,
      siteName: post?.site?.name || post?.site?.baseUrl || 'unknown',
      fileName
    };
  };

  const onDownloadAllClick = async function() {
    try {
      if (!getCurrentPosts) {
        alert('No results are loaded yet.');
        return;
      }
      const posts = getCurrentPosts() || [];
      if (!Array.isArray(posts) || posts.length === 0) {
        alert('No results to download.');
        return;
      }

      // Build items list
      const items = posts
        .map(toDownloadItem)
        .filter(Boolean);

      if (items.length === 0) {
        alert('No downloadable URLs found in the current results.');
        return;
      }

      // Subfolders per site and limited concurrency
      const res = await window.api.downloadBulk(items, { subfolderBySite: true, concurrency: 3 });
      if (res?.cancelled) return;
      if (!res?.ok) {
        alert(`Download failed: ${res?.error || 'unknown error'}`);
        return;
      }

      const failedCount = (res.failed || []).length;
      const msg = `Saved ${res.saved} file(s)` + (failedCount ? `, ${failedCount} failed` : '') + (res.basePath ? `\nFolder: ${res.basePath}` : '');
      alert(msg);
    } catch (e) {
      console.error('Download all error:', e);
      alert(`Download error: ${e?.message || e}`);
    }
  };

  const btn = document.getElementById('btnDownloadAll');
  if (btn) btn.addEventListener('click', onDownloadAllClick);
})();
