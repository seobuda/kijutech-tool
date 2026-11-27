import 'server-only';

// SEO · I+D fase A (Hito 1, 23 nov 2026): vigilar las fuentes de novedades. Sin IA: cada 3 horas lee las fuentes de la
// cuenta (seo_sources, editables desde el 27 nov: oficiales, blogs y canales de YouTube; lib/seo/id/fuentes.ts), guarda lo nuevo en la bitácora del núcleo y avisa al dueño de las actualizaciones e incidencias. Los lunes,
// el resumen semanal lo redacta la IA de la base de conocimiento como propuesta de entrada (solo si hubo novedades).
import { ensureScheduleIfMissing, registerJobKind, registerProcess } from '@/lib/core/jobs';
import { notifyFeedAlerts, saveFeedItems, weeklyDigest } from '@/lib/core/knowledge-feed';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { seoSources, type SeoSourceRow } from '@/lib/db/schema';
import { parseFeed, parseStatusIncidents } from '@/lib/seo/id/sources';
import { listSeoSources, readPublic, SourceError } from '@/lib/seo/id/fuentes';
import { feedDomain, MAX_ITEMS_PER_READ } from '@/lib/seo/id/fuentes-rules';

export const ID_WATCH = 'seo.id.watch';
export const ID_DIGEST = 'seo.id.digest';

export async function watchSeoSources(tenantId: string): Promise<{ read: number; created: number; notified: number; errors: string[] }> {
  const sources = (await listSeoSources(tenantId)).filter((s) => s.active);
  let read = 0;
  let created = 0;
  const errors: string[] = [];
  // De 4 en 4 (cada lectura espera como mucho 20 s): con una docena de fuentes, menos de un minuto.
  const one = async (s: SeoSourceRow) => {
    try {
      const r = await readPublic(s.feedUrl, 20_000);
      const parsed = s.kind === 'google_status' ? parseStatusIncidents(r.body) : parseFeed(r.body);
      if (!parsed.length) throw new Error('La fuente no devolvió nada legible (¿ha cambiado de formato?)');
      // Solo el panel de incidencias y el blog de Search Central pueden decir «actualización o incidencia de Google» (avisan
      // por Telegram y marcan eventos); en cualquier otra fuente, aunque sea oficial, un titular así es una novedad más.
      const canAlert = s.kind === 'google_status' || s.key === 'search_central_blog';
      const items = parsed.slice(0, MAX_ITEMS_PER_READ).map((i) => (canAlert || (i.kind !== 'core_update' && i.kind !== 'incidencia') ? i : { ...i, kind: 'novedad' as const }));
      read += items.length;
      const n = (await saveFeedItems(tenantId, feedDomain(s.level), s.key, items)).created.length;
      created += n;
      await db.update(seoSources).set({ lastCheckedAt: new Date(), lastOkAt: new Date(), lastError: null, itemsTotal: sql`${seoSources.itemsTotal} + ${n}` }).where(eq(seoSources.id, s.id));
    } catch (e) {
      const msg = e instanceof SourceError ? e.userMessage : e instanceof Error ? e.message : String(e);
      errors.push(`${s.label}: ${msg}`);
      await db.update(seoSources).set({ lastCheckedAt: new Date(), lastError: msg.slice(0, 500) }).where(eq(seoSources.id, s.id));
    }
  };
  for (let i = 0; i < sources.length; i += 4) await Promise.all(sources.slice(i, i + 4).map(one));
  const notified = await notifyFeedAlerts(tenantId, 'seo');
  // Si todas las fuentes fallan, el trabajo falla (y se ve en la salud de la cola); si falla una, se anota en su fila.
  if (sources.length && errors.length === sources.length) throw new Error(errors.join(' · ').slice(0, 2000));
  return { read, created, notified, errors };
}

/** Da de alta la vigilancia de la cuenta (idempotente). La llaman las pantallas de SEO al usarse. */
export async function ensureSeoWatch(tenantId: string): Promise<void> {
  await ensureScheduleIfMissing(tenantId, ID_WATCH, '', 180);
  await ensureScheduleIfMissing(tenantId, ID_DIGEST, '', 7 * 24 * 60, nextMonday9());
}

function nextMonday9(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(8, 0, 0, 0); // 9:00 en Madrid (invierno)
  const add = (8 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}

let registered = false;
export function registerSeoWatch(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: ID_WATCH, timeoutS: 420, maxConcurrent: 1, maxAttempts: 2, run: async (ctx) => watchSeoSources(ctx.tenantId) });
  registerJobKind({
    kind: ID_DIGEST,
    timeoutS: 240,
    maxConcurrent: 1,
    maxAttempts: 2,
    run: async (ctx) => weeklyDigest(ctx.tenantId, 'seo', 'Novedades oficiales de Google Search. Resume qué cambia y qué debería revisar el equipo de SEO en las webs de los clientes')
  });
  registerProcess({ key: ID_WATCH, scopeType: 'cuenta', label: 'I+D SEO: vigilar las fuentes de novedades (oficiales y blogs)', defaultEveryMinutes: 180, enqueue: () => ({ kind: ID_WATCH, priority: 7 }) });
  registerProcess({ key: ID_DIGEST, scopeType: 'cuenta', label: 'I+D SEO: resumen semanal para la base de conocimiento', defaultEveryMinutes: 7 * 24 * 60, enqueue: () => ({ kind: ID_DIGEST, priority: 8 }) });
}
