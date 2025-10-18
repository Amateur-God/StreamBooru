const { normalizePost, toIsoDate, abs, buildQueryTags } = require('./base');

class GelbooruAdapter {
  constructor(httpGetJson, httpGetText) {
    this.httpGetJson = httpGetJson;
    this.httpGetText = httpGetText; // for XML fallback
  }

  // Append API credentials if present
  #applyAuth(params, site) {
    const uid = site?.credentials?.user_id || site?.user_id;
    const key = site?.credentials?.api_key || site?.api_key;
    if (uid && key) {
      params.set('user_id', String(uid));
      params.set('api_key', String(key));
    }
  }

  // Minimal XML <post .../> parser
  #parseXmlPosts(xml) {
    const out = [];
    const re = /<post\b([^>]+?)\/?>/gi;
    let m;
    while ((m = re.exec(xml))) {
      const attrs = m[1];
      const get = (name) => {
        const mm = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(attrs);
        return mm ? mm[1] : '';
      };
      const id = get('id') || get('post_id');
      const created_at = get('created_at') || get('date') || '';
      const score = Number(get('score') || '0');
      const favorites = Number(get('fav_count') || get('favorite_count') || get('favorites') || '0');
      const tagStr = get('tags') || '';
      const tags = tagStr ? tagStr.trim().split(/\s+/).filter(Boolean) : [];
      const rating = get('rating') || '';
      const width = Number(get('width') || get('image_width') || '0') || null;
      const height = Number(get('height') || get('image_height') || '0') || null;
      const preview_url = get('preview_url') || get('preview_file_url') || get('sample_url') || get('file_url') || '';
      const sample_url = get('sample_url') || get('file_url') || '';
      const file_url = get('file_url') || get('source') || '';
      out.push({ id, created_at, score, favorites, tags, rating, width, height, preview_url, sample_url, file_url });
    }
    return out;
  }

  async #fetchJson(url) {
    try {
      const json = await this.httpGetJson(url);
      return Array.isArray(json) ? json : json?.post || [];
    } catch (e) {
      return { __error: String(e || '') };
    }
  }

  async #fetchXmlFromUrl(url) {
    // Convert the built URL to XML by removing json=1 only; keep creds and other params
    const u = new URL(url);
    u.searchParams.delete('json');
    const xml = await this.httpGetText(u.toString(), { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1' });
    return this.#parseXmlPosts(xml);
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
      this.#applyAuth(p, site);
      return p;
    };

    // Primary: plain tag search
    let params = mkParams(buildQueryTags(site, search));
    let url = `${base}/index.php?${params.toString()}`;
    let posts = await this.#fetchJson(url);

    const needFallback = (!Array.isArray(posts) || posts.length === 0 || posts.__error);

    // Fallbacks (JSON)
    if (needFallback && (search || '').trim().length > 0) {
      params = mkParams(buildQueryTags(site, 'sort:score', search));
      url = `${base}/index.php?${params.toString()}`;
      posts = await this.#fetchJson(url);
    }
    if (!Array.isArray(posts) || posts.length === 0 || posts.__error) {
      params = mkParams(buildQueryTags(site, 'order:score', search));
      url = `${base}/index.php?${params.toString()}`;
      posts = await this.#fetchJson(url);
    }

    // Final fallback: XML (requires credentials on gelbooru.com)
    if (!Array.isArray(posts) || posts.length === 0 || posts.__error) {
      posts = await this.#fetchXmlFromUrl(url);
    }

    const normalized = (posts || []).map((p) => {
      const created = p.created_at || p.date || (p.change ? toIsoDate(Number(p.change)) : null);
      const tags = Array.isArray(p.tags) ? p.tags : (typeof p.tags === 'string' ? p.tags.split(' ') : []);
      return normalizePost({
        id: p.id || p.post_id,
        created_at: created,
        score: p.score,
        favorites: p.favorites ?? p.fav_count ?? p.favorite_count ?? 0,
        preview_url: abs(site.baseUrl, p.preview_url || p.preview_file_url || p.sample_url || p.file_url),
        sample_url: abs(site.baseUrl, p.sample_url || p.file_url),
        file_url: abs(site.baseUrl, p.file_url || p.source || ''),
        width: p.width || p.image_width || null,
        height: p.height || p.image_height || null,
        tags,
        rating: p.rating || '',
        source: p.source || '',
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
    this.#applyAuth(params, site);

    let url = `${base}/index.php?${params.toString()}`;
    let posts = await this.#fetchJson(url);

    if (!Array.isArray(posts) || posts.length === 0 || posts.__error) {
      params.set('tags', buildQueryTags(site, 'order:score', search));
      url = `${base}/index.php?${params.toString()}`;
      posts = await this.#fetchJson(url);
    }
    if (!Array.isArray(posts) || posts.length === 0 || posts.__error) {
      posts = await this.#fetchXmlFromUrl(url);
    }

    const normalized = (posts || []).map((p) => {
      const created = p.created_at || p.date || (p.change ? toIsoDate(Number(p.change)) : null);
      const tags = Array.isArray(p.tags) ? p.tags : (typeof p.tags === 'string' ? p.tags.split(' ') : []);
      return normalizePost({
        id: p.id || p.post_id,
        created_at: created,
        score: p.score,
        favorites: p.favorites ?? p.fav_count ?? p.favorite_count ?? 0,
        preview_url: abs(site.baseUrl, p.preview_url || p.preview_file_url || p.sample_url || p.file_url),
        sample_url: abs(site.baseUrl, p.sample_url || p.file_url),
        file_url: abs(site.baseUrl, p.file_url || p.source || ''),
        width: p.width || p.image_width || null,
        height: p.height || p.image_height || null,
        tags,
        rating: p.rating || '',
        source: p.source || '',
        post_url: `${base}/index.php?page=post&s=view&id=${p.id || p.post_id}`,
        site: { name: site.name, type: site.type, baseUrl: site.baseUrl }
      });
    });

    return { posts: normalized, nextCursor: { pid: pid + 1 } };
  }
}

module.exports = GelbooruAdapter;
