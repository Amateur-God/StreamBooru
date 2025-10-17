const { normalizePost, toIsoDate, abs, buildQueryTags } = require('./base');

class GelbooruAdapter {
  constructor(httpGetJson) {
    this.httpGetJson = httpGetJson;
  }

  async fetchNew(site, { cursor, limit = 40, search = '' }) {
    const pid = cursor?.pid || 0;
    const base = site.baseUrl.replace(/\/+$/, '');

    const mkParams = (tagsStr) => {
      const p = new URLSearchParams();
      p.set('page', 'dapi');
      p.set('s', 'post');
      p.set('q', 'index');
      p.set('json', '1');
      p.set('limit', String(Math.min(limit, 100)));
      p.set('pid', String(pid));
      if (tagsStr) p.set('tags', tagsStr);
      return p;
    };

    // Primary: plain tag search
    let params = mkParams(buildQueryTags(site, search));
    let url = `${base}/index.php?${params.toString()}`;
    let json;
    try {
      json = await this.httpGetJson(url);
    } catch {
      json = null;
    }
    let posts = Array.isArray(json) ? json : json?.post || [];

    // Fallback: if searching and nothing returned, try sort:score then order:score
    if ((posts?.length || 0) === 0 && (search || '').trim().length > 0) {
      try {
        params = mkParams(buildQueryTags(site, 'sort:score', search));
        url = `${base}/index.php?${params.toString()}`;
        json = await this.httpGetJson(url);
        posts = Array.isArray(json) ? json : json?.post || [];
      } catch {
        posts = [];
      }
      if ((posts?.length || 0) === 0) {
        try {
          params = mkParams(buildQueryTags(site, 'order:score', search));
          url = `${base}/index.php?${params.toString()}`;
          json = await this.httpGetJson(url);
          posts = Array.isArray(json) ? json : json?.post || [];
        } catch {
          posts = [];
        }
      }
    }

    const normalized = (posts || []).map((p) => {
      const created = p.created_at || p.date || (p.change ? toIsoDate(Number(p.change)) : null);
      const tagStr = p.tags || p.tag_string || '';
      return normalizePost({
        id: p.id || p.post_id,
        created_at: created,
        score: p.score,
        favorites: p.fav_count ?? p.favorite_count ?? p.favorites ?? 0,
        preview_url: abs(site.baseUrl, p.preview_url || p.preview_file_url || p.sample_url || p.file_url),
        sample_url: abs(site.baseUrl, p.sample_url || p.file_url),
        file_url: abs(site.baseUrl, p.file_url || p.source || ''),
        width: p.width || p.image_width,
        height: p.height || p.image_height,
        tags: typeof tagStr === 'string' ? tagStr.split(' ') : [],
        rating: p.rating,
        source: p.source,
        post_url: `${base}/index.php?page=post&s=view&id=${p.id || p.post_id}`,
        site: { name: site.name, type: site.type, baseUrl: site.baseUrl }
      });
    });

    return { posts: normalized, nextCursor: { pid: pid + 1 } };
  }

  async fetchPopular(site, { cursor, limit = 40, search = '' }) {
    const pid = cursor?.pid || 0;
    const base = site.baseUrl.replace(/\/+$/, '');
    const params = new URLSearchParams();
    params.set('page', 'dapi');
    params.set('s', 'post');
    params.set('q', 'index');
    params.set('json', '1');
    params.set('limit', String(Math.min(limit, 100)));
    params.set('pid', String(pid));
    params.set('tags', buildQueryTags(site, 'sort:score', search));

    let url = `${base}/index.php?${params.toString()}`;
    let json;
    try {
      json = await this.httpGetJson(url);
    } catch {
      params.set('tags', buildQueryTags(site, 'order:score', search));
      url = `${base}/index.php?${params.toString()}`;
      json = await this.httpGetJson(url);
    }
    const posts = Array.isArray(json) ? json : json?.post || [];

    const normalized = (posts || []).map((p) => {
      const created = p.created_at || p.date || (p.change ? toIsoDate(Number(p.change)) : null);
      const tagStr = p.tags || p.tag_string || '';
      return normalizePost({
        id: p.id || p.post_id,
        created_at: created,
        score: p.score,
        favorites: p.fav_count ?? p.favorite_count ?? p.favorites ?? 0,
        preview_url: abs(site.baseUrl, p.preview_url || p.preview_file_url || p.sample_url || p.file_url),
        sample_url: abs(site.baseUrl, p.sample_url || p.file_url),
        file_url: abs(site.baseUrl, p.file_url || p.source || ''),
        width: p.width || p.image_width,
        height: p.height || p.image_height,
        tags: typeof tagStr === 'string' ? tagStr.split(' ') : [],
        rating: p.rating,
        source: p.source,
        post_url: `${base}/index.php?page=post&s=view&id=${p.id || p.post_id}`,
        site: { name: site.name, type: site.type, baseUrl: site.baseUrl }
      });
    });

    return { posts: normalized, nextCursor: { pid: pid + 1 } };
  }
}

module.exports = GelbooruAdapter;
