// SEO · fuentes de novedades (27 nov 2026, petición de Enric): qué fuentes vienen de serie y cómo se reconoce lo que pega
// una persona (un RSS, una web o blog cuyo RSS se busca solo, o un canal de YouTube). PURO: tests/seo-fuentes.test.ts.

export type SourceKind = 'google_status' | 'rss' | 'youtube';
export type SourceLevel = 'oficial' | 'reputada' | 'comunidad';
export const LEVEL_LABEL: Record<SourceLevel, string> = { oficial: 'Oficial', reputada: 'Reputada', comunidad: 'Comunidad' };
export const KIND_LABEL: Record<SourceKind, string> = { google_status: 'Panel de Google', rss: 'Blog / RSS', youtube: 'YouTube' };
/** Elementos que se guardan como mucho de cada fuente en cada lectura. */
export const MAX_ITEMS_PER_READ = 30;
export const MAX_SOURCES = 60;

export type DefaultSource = { key: string; label: string; kind: SourceKind; inputUrl: string; feedUrl: string; level: SourceLevel };

/**
 * Fuentes de serie (comprobadas el 27 nov 2026 desde el servidor). Search Engine Land y Screaming Frog bloquean a los
 * robots (Cloudflare): no se incluyen. Las dos primeras claves son las de siempre (lo ya guardado no se repite).
 */
export const DEFAULT_SOURCES: DefaultSource[] = [
  { key: 'search_status', label: 'Panel de incidencias de Google Search', kind: 'google_status', inputUrl: 'https://status.search.google.com/', feedUrl: 'https://status.search.google.com/incidents.json', level: 'oficial' },
  { key: 'search_central_blog', label: 'Blog de Google Search Central', kind: 'rss', inputUrl: 'https://developers.google.com/search/blog', feedUrl: 'https://developers.google.com/search/blog/feed.xml', level: 'oficial' },
  { key: 'search_central_yt', label: 'Google Search Central (YouTube)', kind: 'youtube', inputUrl: 'https://www.youtube.com/@GoogleSearchCentral', feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCWf2ZlNsCGDS89VBF_awNvA', level: 'oficial' },
  { key: 'bing_webmaster_blog', label: 'Blog de Bing Webmaster', kind: 'rss', inputUrl: 'https://blogs.bing.com/webmaster', feedUrl: 'https://blogs.bing.com/webmaster/feed/', level: 'oficial' },
  { key: 'ahrefs_blog', label: 'Blog de Ahrefs', kind: 'rss', inputUrl: 'https://ahrefs.com/blog/', feedUrl: 'https://ahrefs.com/blog/feed/', level: 'reputada' },
  { key: 'ahrefs_yt', label: 'Ahrefs (YouTube)', kind: 'youtube', inputUrl: 'https://www.youtube.com/@AhrefsCom', feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCWquNQV8Y0_defMKnGKrFOQ', level: 'reputada' },
  { key: 'semrush_blog', label: 'Blog de Semrush', kind: 'rss', inputUrl: 'https://www.semrush.com/blog/', feedUrl: 'https://www.semrush.com/blog/feed/', level: 'reputada' },
  { key: 'moz_blog', label: 'Blog de Moz', kind: 'rss', inputUrl: 'https://moz.com/blog', feedUrl: 'https://moz.com/posts/rss/blog', level: 'reputada' },
  { key: 'sistrix_es', label: 'Blog de SISTRIX (español)', kind: 'rss', inputUrl: 'https://www.sistrix.es/blog/', feedUrl: 'https://www.sistrix.es/feed/', level: 'reputada' },
  { key: 'seranking_blog', label: 'Blog de SE Ranking', kind: 'rss', inputUrl: 'https://seranking.com/blog/', feedUrl: 'https://seranking.com/blog/feed/', level: 'reputada' },
  { key: 'yoast_blog', label: 'Blog de Yoast', kind: 'rss', inputUrl: 'https://yoast.com/seo-blog/', feedUrl: 'https://yoast.com/feed/', level: 'reputada' },
  { key: 'backlinko', label: 'Backlinko', kind: 'rss', inputUrl: 'https://backlinko.com/blog', feedUrl: 'https://backlinko.com/feed', level: 'reputada' },
  { key: 'search_engine_journal', label: 'Search Engine Journal', kind: 'rss', inputUrl: 'https://www.searchenginejournal.com/', feedUrl: 'https://www.searchenginejournal.com/feed/', level: 'reputada' },
  { key: 'seroundtable', label: 'Search Engine Roundtable', kind: 'rss', inputUrl: 'https://www.seroundtable.com/', feedUrl: 'https://www.seroundtable.com/index.xml', level: 'reputada' }
];

/** Lo oficial va a la bitácora de siempre (avisos de actualizaciones de Google y resumen semanal); lo demás, aparte. */
export const feedDomain = (level: string) => (level === 'oficial' ? 'seo' : 'seo_ext');

/** Normaliza lo que pega una persona: sin espacios y con https:// si no lo lleva. Null si no es una URL web. */
export function normalizeInput(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 500 || /\s/.test(t)) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const YT_HOST = /(^|\.)youtube\.com$/i;
/** Canal de YouTube en la URL (…/channel/UC…) o null si hay que mirar la página (…/@nombre, …/c/nombre). */
export function youtubeChannelFromUrl(url: string): { isYoutube: boolean; channelId: string | null } {
  try {
    const u = new URL(url);
    if (!YT_HOST.test(u.hostname)) return { isYoutube: false, channelId: null };
    const fromFeed = u.pathname.startsWith('/feeds/videos.xml') ? u.searchParams.get('channel_id') : null;
    const id = fromFeed ?? u.pathname.match(/^\/channel\/(UC[\w-]{22})/)?.[1] ?? null;
    return { isYoutube: true, channelId: id };
  } catch {
    return { isYoutube: false, channelId: null };
  }
}
/** Id del canal dentro del HTML de su página (canonical, meta o JSON incrustado). */
export function youtubeChannelFromHtml(html: string): string | null {
  return (
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})/i)?.[1] ??
    html.match(/<meta[^>]+itemprop=["'](?:channelId|identifier)["'][^>]+content=["'](UC[\w-]{22})/i)?.[1] ??
    html.match(/"(?:externalId|channelId|browseId)":"(UC[\w-]{22})"/)?.[1] ??
    null
  );
}
export const youtubeFeed = (channelId: string) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

/** Enlaces a RSS o Atom que declara una página (<link rel="alternate" type="application/rss+xml" …>), absolutos. */
export function discoverFeedLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href || /comments/i.test(href)) continue;
    try {
      const abs = new URL(href.replace(/&amp;/g, '&'), baseUrl).toString();
      if (/^https?:/.test(abs) && !out.includes(abs)) out.push(abs);
    } catch {
      /* enlace roto: se ignora */
    }
  }
  return out;
}
/** Rutas típicas de RSS que se prueban si la página no declara ninguno. */
export function commonFeedGuesses(url: string): string[] {
  const u = new URL(url);
  const base = `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  const list = [`${base}/feed/`, `${base}/rss.xml`, `${base}/feed.xml`, `${base}/index.xml`, `${u.origin}/feed/`, `${u.origin}/blog/feed/`, `${u.origin}/rss.xml`];
  return [...new Set(list)];
}

/** Clave estable para una fuente nueva a partir del dominio (y el canal), sin chocar con las que ya hay. */
export function sourceKeyFor(feedUrl: string, taken: Set<string>): string {
  let base = 'fuente';
  try {
    const u = new URL(feedUrl);
    const yt = u.searchParams.get('channel_id');
    base = (yt ? `yt_${yt.slice(-10)}` : u.hostname.replace(/^www\./, '').replace(/\.[a-z]{2,6}$/i, '')).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'fuente';
  } catch {
    /* sin URL válida: «fuente» */
  }
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`.slice(0, 40);
  return key;
}
