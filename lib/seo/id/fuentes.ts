import 'server-only';

// SEO · fuentes de novedades editables (27 nov 2026, petición de Enric). Cada cuenta tiene sus fuentes en seo_sources: las
// de serie (oficiales de Google y Bing, y blogs y canales de las herramientas SEO de referencia) se crean solas, y un
// administrador añade más pegando una URL: un RSS o Atom, una web o blog (su RSS se busca solo) o un canal de YouTube.
// Antes de guardarla se lee una vez: si no se puede leer o no trae nada, no se añade.
// Lo oficial va a la bitácora de siempre (avisos de actualizaciones de Google y resumen semanal); lo demás (reputada o
// comunidad) se guarda aparte («seo_ext») como opinión, nunca como criterio, y no avisa por Telegram.
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { seoSources, type SeoSourceRow } from '@/lib/db/schema';
import { fetchPublic } from '@/lib/core/net';
import { feedTitle, looksLikeFeed, parseFeed } from '@/lib/seo/id/sources';
import {
  commonFeedGuesses,
  DEFAULT_SOURCES,
  discoverFeedLinks,
  MAX_SOURCES,
  normalizeInput,
  sourceKeyFor,
  youtubeChannelFromHtml,
  youtubeChannelFromUrl,
  youtubeFeed,
  type SourceKind,
  type SourceLevel
} from '@/lib/seo/id/fuentes-rules';

export class SourceError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}
const UA = { 'user-agent': 'KijutechBot/1.0 (+https://kijutech.com)' };
const MAX_BODY = 3_000_000;

/** Lee una URL pública (con la protección de siempre contra direcciones internas) y devuelve su texto. */
export async function readPublic(url: string, ms = 15_000): Promise<{ url: string; body: string; type: string }> {
  const r = await fetchPublic(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if ('error' in r) throw new SourceError(r.error);
  if (!r.res.ok) throw new SourceError(r.res.status === 403 ? 'La web bloquea a los robots (403): no se puede leer automáticamente.' : `La web respondió con un error (HTTP ${r.res.status}).`);
  const body = (await r.res.text()).slice(0, MAX_BODY);
  return { url: r.url, body, type: r.res.headers.get('content-type') ?? '' };
}

let seeded = new Set<string>();
/** Crea las fuentes de serie que falten (la primera vez o si se añaden nuevas al código). No toca las existentes. */
export async function ensureDefaultSources(tenantId: string): Promise<void> {
  if (seeded.has(tenantId)) return;
  await db
    .insert(seoSources)
    .values(DEFAULT_SOURCES.map((s) => ({ tenantId, key: s.key, label: s.label, kind: s.kind, inputUrl: s.inputUrl, feedUrl: s.feedUrl, level: s.level, builtin: true, createdBy: 'Kijutech (de serie)' })))
    .onConflictDoNothing();
  seeded.add(tenantId);
}
/** Solo para las pruebas. */
export function _resetSeeded(): void {
  seeded = new Set();
}

export async function listSeoSources(tenantId: string): Promise<SeoSourceRow[]> {
  await ensureDefaultSources(tenantId);
  return db.select().from(seoSources).where(eq(seoSources.tenantId, tenantId)).orderBy(sql`CASE ${seoSources.level} WHEN 'oficial' THEN 0 WHEN 'reputada' THEN 1 ELSE 2 END`, asc(seoSources.label));
}

export type ResolvedSource = { kind: SourceKind; feedUrl: string; title: string | null; items: number; sample: string[] };

/** De lo que pega una persona a un feed que se puede leer: RSS/Atom directo, canal de YouTube o web con su RSS. */
export async function resolveSource(raw: string): Promise<ResolvedSource> {
  const url = normalizeInput(raw);
  if (!url) throw new SourceError('Pega una dirección web (por ejemplo https://ahrefs.com/blog/ o un canal de YouTube).');
  const tryFeed = async (feedUrl: string, kind: SourceKind): Promise<ResolvedSource | null> => {
    const r = await readPublic(feedUrl).catch(() => null);
    if (!r || !looksLikeFeed(r.body)) return null;
    const items = parseFeed(r.body);
    if (!items.length) return null;
    return { kind, feedUrl, title: feedTitle(r.body), items: items.length, sample: items.slice(0, 3).map((i) => i.title) };
  };
  const yt = youtubeChannelFromUrl(url);
  if (yt.isYoutube) {
    let id = yt.channelId;
    if (!id) {
      const page = await readPublic(url);
      id = youtubeChannelFromHtml(page.body);
    }
    if (!id) throw new SourceError('No encuentro el canal de YouTube en esa página. Pega la URL del canal (…/@nombre o …/channel/UC…).');
    const r = await tryFeed(youtubeFeed(id), 'youtube');
    if (!r) throw new SourceError('El canal no tiene vídeos públicos que se puedan leer.');
    return r;
  }
  const first = await readPublic(url);
  if (looksLikeFeed(first.body)) {
    const items = parseFeed(first.body);
    if (!items.length) throw new SourceError('El RSS está vacío o no se entiende.');
    return { kind: 'rss', feedUrl: first.url, title: feedTitle(first.body), items: items.length, sample: items.slice(0, 3).map((i) => i.title) };
  }
  // Una web o un blog: el RSS que declara la página y, si no declara ninguno, las rutas típicas.
  for (const f of [...discoverFeedLinks(first.body, first.url), ...commonFeedGuesses(first.url)].slice(0, 9)) {
    const r = await tryFeed(f, 'rss');
    if (r) return r;
  }
  throw new SourceError('Esa web no publica RSS (ni lo declara ni está en las rutas habituales). Si tiene uno, pega su dirección directamente.');
}

/** Añade una fuente nueva tras comprobar que se lee. Solo administradores (lo comprueba la acción). */
export async function addSource(tenantId: string, input: { url: string; label?: string; level: SourceLevel }, by: string): Promise<{ id: string; label: string; items: number }> {
  if (!['oficial', 'reputada', 'comunidad'].includes(input.level)) throw new SourceError('Nivel no válido.');
  const existing = await listSeoSources(tenantId);
  if (existing.length >= MAX_SOURCES) throw new SourceError(`Como mucho ${MAX_SOURCES} fuentes por cuenta.`);
  const r = await resolveSource(input.url);
  if (existing.some((s) => s.feedUrl === r.feedUrl)) throw new SourceError('Esa fuente ya está en la lista.');
  const key = sourceKeyFor(r.feedUrl, new Set(existing.map((s) => s.key)));
  const label = (input.label?.trim() || r.title || key).slice(0, 160);
  const [row] = await db
    .insert(seoSources)
    .values({ tenantId, key, label, kind: r.kind, inputUrl: normalizeInput(input.url) ?? input.url, feedUrl: r.feedUrl, level: input.level, createdBy: by.slice(0, 120) })
    .returning({ id: seoSources.id });
  return { id: row.id, label, items: r.items };
}

export async function updateSource(tenantId: string, id: string, patch: { label?: string; level?: SourceLevel; active?: boolean }): Promise<void> {
  const set: Partial<typeof seoSources.$inferInsert> = { updatedAt: new Date() };
  if (patch.label !== undefined) {
    const l = patch.label.trim();
    if (l.length < 2) throw new SourceError('Pon un nombre a la fuente.');
    set.label = l.slice(0, 160);
  }
  if (patch.level !== undefined) {
    if (!['oficial', 'reputada', 'comunidad'].includes(patch.level)) throw new SourceError('Nivel no válido.');
    set.level = patch.level;
  }
  if (patch.active !== undefined) set.active = Boolean(patch.active);
  const r = await db.update(seoSources).set(set).where(and(eq(seoSources.id, id), eq(seoSources.tenantId, tenantId))).returning({ id: seoSources.id });
  if (!r.length) throw new SourceError('Esa fuente no existe.');
}

/** Quita una fuente añadida a mano. Las de serie no se borran (se desactivan). Lo ya leído se queda en la bitácora. */
export async function deleteSource(tenantId: string, id: string): Promise<void> {
  const [s] = await db.select({ builtin: seoSources.builtin }).from(seoSources).where(and(eq(seoSources.id, id), eq(seoSources.tenantId, tenantId))).limit(1);
  if (!s) throw new SourceError('Esa fuente no existe.');
  if (s.builtin) throw new SourceError('Las fuentes de serie no se borran: desactívala.');
  await db.delete(seoSources).where(and(eq(seoSources.id, id), eq(seoSources.tenantId, tenantId)));
}
