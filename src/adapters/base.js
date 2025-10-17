function toIsoDate(d) {
  if (!d) return null;
  try {
    if (typeof d === 'number') {
      if (d < 1e12) return new Date(d * 1000).toISOString();
      return new Date(d).toISOString();
    }
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) return dt.toISOString();
  } catch {}
  return null;
}

function abs(baseUrl, url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return baseUrl.replace(/\/+$/, '') + url;
  return url;
}

function ratingToTag(rating) {
  switch ((rating || '').toLowerCase()) {
    case 'safe': return 'rating:safe';
    case 'questionable': return 'rating:questionable';
    case 'explicit': return 'rating:explicit';
    default: return '';
  }
}

// Accept any number of extra tag strings which are appended
function buildQueryTags(site, ...extras) {
  const parts = [ratingToTag(site.rating), site.tags || '', ...(extras || [])]
    .filter(Boolean)
    .join(' ')
    .trim()
    .split(/\s+/);
  const seen = new Set();
  const out = [];
  for (const t of parts) if (!seen.has(t)) { seen.add(t); out.push(t); }
  return out.join(' ');
}

function normalizePost({
  id, created_at, score, favorites,
  preview_url, sample_url, file_url,
  width, height, tags, rating, source, post_url, site
}) {
  return {
    id: String(id),
    created_at: toIsoDate(created_at) || null,
    score: typeof score === 'number' ? score : score ? Number(score) || 0 : 0,
    favorites: typeof favorites === 'number' ? favorites : favorites ? Number(favorites) || 0 : 0,
    preview_url: preview_url || sample_url || file_url || '',
    sample_url: sample_url || file_url || '',
    file_url: file_url || sample_url || preview_url || '',
    width: width ? Number(width) : null,
    height: height ? Number(height) : null,
    tags: Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(/\s+/).filter(Boolean) : [],
    rating: rating || '',
    source: source || '',
    post_url,
    site
  };
}

module.exports = { normalizePost, toIsoDate, abs, buildQueryTags, ratingToTag };
