// SEO · fuentes de novedades editables (27 nov 2026): reconocer lo que pega una persona (RSS, web, YouTube), leer Atom y
// las fuentes de serie. Puras (sin red ni base de datos).
import { describe, expect, it } from 'vitest';
import { commonFeedGuesses, DEFAULT_SOURCES, discoverFeedLinks, feedDomain, normalizeInput, sourceKeyFor, youtubeChannelFromHtml, youtubeChannelFromUrl, youtubeFeed } from '@/lib/seo/id/fuentes-rules';
import { feedTitle, looksLikeFeed, parseAtom, parseFeed } from '@/lib/seo/id/sources';

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>Google Search Central</title>
<entry><id>yt:video:abc</id><title>SEO Office Hours</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc"/><published>2026-11-20T10:00:00+00:00</published><media:group><media:description>Preguntas &amp; respuestas</media:description></media:group></entry>
<entry><id>yt:video:def</id><title>Core update</title><link rel="alternate" href="https://www.youtube.com/watch?v=def"/><updated>2026-11-21T10:00:00Z</updated></entry></feed>`;

describe('fuentes: lectura de Atom y RSS', () => {
  it('Atom (YouTube) con enlace, fecha y descripción; nunca cuenta como actualización de Google', () => {
    const items = parseAtom(ATOM);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ url: 'https://www.youtube.com/watch?v=abc', title: 'SEO Office Hours', summary: 'Preguntas & respuestas', kind: 'novedad' });
    expect(items[1].publishedAt?.toISOString()).toBe('2026-11-21T10:00:00.000Z');
    expect(parseFeed(ATOM)).toHaveLength(2);
    expect(feedTitle(ATOM)).toBe('Google Search Central');
    expect(looksLikeFeed(ATOM)).toBe(true);
    expect(looksLikeFeed('<!doctype html><html><head><title>x</title>')).toBe(false);
  });
  it('RSS sigue funcionando por parseFeed', () => {
    const rss = '<rss><channel><title>Blog</title><item><title>Hola</title><link>https://x.com/a</link><guid>1</guid></item></channel></rss>';
    expect(parseFeed(rss).map((i) => i.title)).toEqual(['Hola']);
    expect(feedTitle(rss)).toBe('Blog');
  });
});

describe('fuentes: reconocer lo que se pega', () => {
  it('normaliza direcciones y rechaza lo que no es una web', () => {
    expect(normalizeInput('ahrefs.com/blog')).toBe('https://ahrefs.com/blog');
    expect(normalizeInput(' https://moz.com/blog ')).toBe('https://moz.com/blog');
    expect(normalizeInput('no es una url')).toBeNull();
    expect(normalizeInput('ftp://x.com')).toBeNull();
    expect(normalizeInput('localhost')).toBeNull();
  });
  it('canales de YouTube: id en la URL, en el feed o en la página', () => {
    expect(youtubeChannelFromUrl('https://www.youtube.com/channel/UCWf2ZlNsCGDS89VBF_awNvA')).toEqual({ isYoutube: true, channelId: 'UCWf2ZlNsCGDS89VBF_awNvA' });
    expect(youtubeChannelFromUrl('https://www.youtube.com/@GoogleSearchCentral')).toEqual({ isYoutube: true, channelId: null });
    expect(youtubeChannelFromUrl('https://ahrefs.com/blog')).toEqual({ isYoutube: false, channelId: null });
    expect(youtubeChannelFromHtml('<link rel="canonical" href="https://www.youtube.com/channel/UCWquNQV8Y0_defMKnGKrFOQ">')).toBe('UCWquNQV8Y0_defMKnGKrFOQ');
    expect(youtubeChannelFromHtml('{"externalId":"UCWquNQV8Y0_defMKnGKrFOQ"}')).toBe('UCWquNQV8Y0_defMKnGKrFOQ');
    expect(youtubeFeed('UC1')).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UC1');
  });
  it('el RSS que declara una web, absoluto y sin el de comentarios; rutas típicas si no declara', () => {
    const html = `<link rel="alternate" type="application/rss+xml" title="Comentarios" href="/comments/feed/"><link type="application/rss+xml" rel="alternate" href="/blog/feed/"><link rel="alternate" type="application/atom+xml" href="https://x.com/atom.xml">`;
    expect(discoverFeedLinks(html, 'https://x.com/blog/')).toEqual(['https://x.com/blog/feed/', 'https://x.com/atom.xml']);
    expect(commonFeedGuesses('https://x.com/blog/')).toContain('https://x.com/blog/feed/');
  });
  it('claves estables sin chocar; lo oficial va a la bitácora de siempre', () => {
    expect(sourceKeyFor('https://www.example.com/feed/', new Set())).toBe('example');
    expect(sourceKeyFor('https://www.example.com/feed/', new Set(['example']))).toBe('example_2');
    expect(sourceKeyFor('https://www.youtube.com/feeds/videos.xml?channel_id=UCWquNQV8Y0_defMKnGKrFOQ', new Set())).toMatch(/^yt_/);
    expect(feedDomain('oficial')).toBe('seo');
    expect(feedDomain('reputada')).toBe('seo_ext');
  });
  it('las de serie: claves únicas, las dos de siempre se mantienen, oficiales y herramientas', () => {
    const keys = DEFAULT_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(['search_status', 'search_central_blog', 'ahrefs_blog', 'semrush_blog', 'moz_blog']));
    expect(DEFAULT_SOURCES.filter((s) => s.level === 'oficial').map((s) => s.key)).toEqual(['search_status', 'search_central_blog', 'search_central_yt', 'bing_webmaster_blog']);
    expect(DEFAULT_SOURCES.every((s) => s.feedUrl.startsWith('https://') && s.key.length <= 40)).toBe(true);
  });
});
