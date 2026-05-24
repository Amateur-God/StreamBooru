/**
 * Shared Referer/Origin helpers for booru CDN hotlink requirements.
 */
function hostAllowed(hostname) {
  const h = String(hostname || "").toLowerCase();
  return (
    h.endsWith("donmai.us") ||
    h === "files.yande.re" || h.endsWith("yande.re") ||
    h === "konachan.com" || h === "konachan.net" ||
    h.endsWith("e621.net") || h.endsWith("e926.net") ||
    h.endsWith("derpibooru.org") || h.endsWith("derpicdn.net") ||
    h.endsWith("gelbooru.com") || h.endsWith("safebooru.org") ||
    h.endsWith("rule34.xxx") || h.endsWith("realbooru.com") || h.endsWith("xbooru.com") ||
    h.endsWith("tbib.org") || h.endsWith("hypnohub.net")
  );
}

export function isBooruHostAllowed(url) {
  try {
    const u = new URL(url);
    const okProto = u.protocol === "https:" || u.protocol === "http:";
    return okProto && hostAllowed(u.hostname);
  } catch {
    return false;
  }
}

export function isProxyAllowed(url) {
  return isBooruHostAllowed(url);
}

export function refererFor(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.endsWith("donmai.us")) return "https://danbooru.donmai.us";
    if (h.endsWith("yande.re") || h === "files.yande.re") return "https://yande.re";
    if (h.endsWith("konachan.com")) return "https://konachan.com";
    if (h.endsWith("konachan.net")) return "https://konachan.net";
    if (h.endsWith("hypnohub.net")) return "https://hypnohub.net";
    if (h.endsWith("tbib.org")) return "https://tbib.org";
    if (h.endsWith("gelbooru.com")) return "https://gelbooru.com";
    if (h.endsWith("safebooru.org")) return "https://safebooru.org";
    if (h.endsWith("rule34.xxx")) return "https://rule34.xxx";
    if (h.endsWith("realbooru.com")) return "https://realbooru.com";
    if (h.endsWith("xbooru.com")) return "https://xbooru.com";
    if (h.endsWith("e621.net") || h.endsWith("e926.net")) return "https://e621.net";
    if (h.endsWith("derpicdn.net") || h.endsWith("derpibooru.org")) return "https://derpibooru.org";
    return "";
  } catch {
    return "";
  }
}

export function refererHeadersFor(url, refOverride = "") {
  let refFinal = "";
  if (refOverride) {
    try {
      const u = new URL(refOverride);
      if (hostAllowed(u.hostname)) refFinal = u.toString();
    } catch {
      /* ignore */
    }
  }
  if (!refFinal) refFinal = refererFor(url);

  const hdr = {};
  if (refFinal) {
    try {
      const o = new URL(refFinal);
      hdr.Referer = refFinal;
      hdr.Origin = `${o.protocol}//${o.host}`;
    } catch {
      hdr.Referer = refFinal;
    }
  }
  return hdr;
}

export const BOORU_UA =
  "Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Mobile Safari/537.36";
