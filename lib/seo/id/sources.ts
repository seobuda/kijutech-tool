// SEO · I+D fase A (Hito 1, 23 nov 2026): fuentes oficiales de Google Search y cómo leerlas. PURO y sin IA.
// Comprobado el 23 nov 2026: el panel de incidencias devuelve JSON (incidents.json, con las core y spam updates en
// «Ranking») y el blog de Search Central publica RSS 2.0.
import { createHash } from 'crypto';
import type { FeedItemInput } from '@/lib/core/knowledge-feed';

export type SeoSource = { key: string; label: string; url: string; parse: (body: string) => FeedItemInput[] };

const sha = (s: string) => createHash('sha1').update(s).digest('hex');
const date = (s: unknown): Date | null => {
  if (typeof s !== 'string' || !s.trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
/** Solo enlaces web de verdad (revisor: un feed podría traer «javascript:» o rutas relativas). */
const webUrl = (u: string): string | null => (/^https?:\/\/[^\s]+$/i.test(u.trim()) ? u.trim() : null);
const stripTags = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

type Incident = {
  id?: string;
  begin?: string;
  end?: string;
  external_desc?: string;
  service_name?: string;
  uri?: string;
  most_recent_update?: { text?: string };
};

/** Panel de incidencias de Google Search: actualizaciones de ranking (core, spam…) e incidencias de rastreo o índice. */
export function parseStatusIncidents(body: string): FeedItemInput[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return (data as Incident[])
    .filter((x) => x && typeof x.id === 'string' && typeof x.external_desc === 'string')
    .map((x) => {
      const begin = date(x.begin);
      return {
        hash: x.id!.slice(0, 64),
        url: x.uri ? `https://status.search.google.com/${x.uri.replace(/^\//, '')}` : 'https://status.search.google.com/',
        title: x.external_desc!.trim(),
        summary: x.most_recent_update?.text ? x.most_recent_update.text.replace(/\s+/g, ' ').trim() : null,
        publishedAt: begin,
        kind: (x.service_name === 'Ranking' ? 'core_update' : 'incidencia') as FeedItemInput['kind'],
        startsAt: begin,
        endsAt: date(x.end)
      };
    });
}

/** RSS 2.0 (blog de Search Central): cada <item> con título, enlace, fecha y descripción. */
export function parseRss(body: string): FeedItemInput[] {
  const out: FeedItemInput[] = [];
  for (const m of body.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const it = m[1];
    const get = (tag: string) => it.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1] ?? '';
    const title = stripTags(get('title'));
    const link = stripTags(get('link'));
    if (!title) continue;
    const guid = stripTags(get('guid')) || link || title;
    const summary = stripTags(get('description')).slice(0, 1500) || null;
    // Un cambio en la documentación o en cómo rastrea Google pesa más que una novedad general.
    const kind: FeedItemInput['kind'] = /(core update|spam update|ranking update)/i.test(title) ? 'core_update' : /(documentation|docs|guidance|structured data|crawl|index)/i.test(`${title} ${summary ?? ''}`) ? 'documentacion' : 'novedad';
    out.push({ hash: sha(guid).slice(0, 40), url: webUrl(link), title, summary, publishedAt: date(stripTags(get('pubDate'))), kind });
  }
  return out;
}

/** Atom (YouTube, muchos blogs): cada <entry> con título, enlace, id, fecha y resumen o descripción del vídeo. */
export function parseAtom(body: string): FeedItemInput[] {
  const out: FeedItemInput[] = [];
  for (const m of body.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) {
    const it = m[1];
    const get = (tag: string) => it.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1] ?? '';
    const title = stripTags(get('title'));
    if (!title) continue;
    const link = it.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? it.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1] ?? '';
    const id = stripTags(get('id')) || link || title;
    const summary = (stripTags(get('summary')) || stripTags(get('media:description')) || stripTags(get('content'))).slice(0, 1500) || null;
    out.push({ hash: sha(id).slice(0, 40), url: webUrl(link.replace(/&amp;/g, '&')), title, summary, publishedAt: date(stripTags(get('published')) || stripTags(get('updated'))), kind: 'novedad' });
  }
  return out;
}

/** RSS 2.0 o Atom, lo que sea el documento. */
export function parseFeed(body: string): FeedItemInput[] {
  return /<entry\b/i.test(body) && !/<item\b/i.test(body) ? parseAtom(body) : parseRss(body);
}

/** ¿El documento es un feed (RSS, Atom o RDF)? */
export const looksLikeFeed = (body: string) => /<(rss|feed|rdf:RDF)\b/i.test(body.slice(0, 2000));

/** Título del feed (para sugerir el nombre de la fuente). */
export function feedTitle(body: string): string | null {
  const head = body.replace(/<(item|entry)\b[\s\S]*$/i, '');
  const t = stripTags(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  return t ? t.slice(0, 160) : null;
}

// Las fuentes ya no son una lista fija: viven en seo_sources (lib/seo/id/fuentes.ts) y las de serie en fuentes-rules.ts.

