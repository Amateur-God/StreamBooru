const { normalizePost, abs } = require('./base');

// Zerochan HTML scraper with basic tag search support
class ZerochanAdapter {
  constructor(httpGetText) {
    this.httpGetText = httpGetText;
  }

  async fetchNew(site, { cursor, limit = 40, search = '' }) {
    const page = cursor?.page || 1;
    const base = site.baseUrl.replace(/\/+$/, '');
    const qpath = search ? `/${encodeURIComponent(search.trim().replace(/\s+/g, '+'))}` : '';
    const url = `${base}${qpath}?p=${page}`;
    const html = await this.httpGetText(url);
    const posts = this.#parseList(site, html).slice(0, limit);
    return { posts, nextCursor: { page: page + 1 } };
  }

  async fetchPopular(site, opts) { return this.fetchNew(site, opts); }

  #parseList(site, html) {
    if (!html) return [];
    const out = [];
    const liRegex = /<li[^>]*id="p(\d+)"[\s\S]*?<a[^>]*href="([^"]+)"[\s\S]*?<img[^>]*?(?:data-src|src)="([^"]+)"[^>]*alt="([^"]*)"/gi;
    let m;
    while ((m = liRegex.exec(html))) {
      const id = m[1];
      const href = m[2];
      const img = m[3];
      const alt = m[4] || '';
      const postUrl = abs(site.baseUrl, href);
      const preview = img.startsWith('http') || img.startsWith('//') ? abs(site.baseUrl, img) : abs(site.baseUrl, '/' + img.replace(/^\/+/, ''));
      out.push(
        normalizePost({
          id,
          created_at: null,
          score: 0,
          favorites: 0,
          preview_url: preview,
          sample_url: preview,
          file_url: preview,
          width: null,
          height: null,
          tags: alt.split(/\s+/).filter(Boolean),
          rating: '',
          source: '',
          post_url: postUrl,
          site: { name: site.name, type: site.type, baseUrl: site.baseUrl }
        })
      );
    }
    return out;
  }
}

module.exports = ZerochanAdapter;
