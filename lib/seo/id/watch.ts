import 'server-only';

// SEO · I+D fase A (Hito 1, 23 nov 2026): vigilar las fuentes oficiales de Google Search. Sin IA: cada 3 horas lee las
// fuentes, guarda lo nuevo en la bitácora del núcleo y avisa al dueño de las actualizaciones e incidencias. Los lunes,
// el resumen semanal lo redacta la IA de la base de conocimiento como propuesta de entrada (solo si hubo novedades).
import { ensureScheduleIfMissing, registerJobKind, registerProcess } from '@/lib/core/jobs';
import { fetchPublic } from '@/lib/core/net';
import { notifyFeedAlerts, saveFeedItems, weeklyDigest } from '@/lib/core/knowledge-feed';
import { SEO_SOURCES } from '@/lib/seo/id/sources';

export const ID_WATCH = 'seo.id.watch';
export const ID_DIGEST = 'seo.id.digest';

export async function watchSeoSources(tenantId: string): Promise<{ read: number; created: number; notified: number; errors: string[] }> {
  let read = 0;
  let created = 0;
  const errors: string[] = [];
  for (const s of SEO_SOURCES) {
    try {
      const r = await fetchPublic(s.url, { headers: { 'user-agent': 'KijutechBot/1.0 (+https://kijutech.com)' }, signal: AbortSignal.timeout(20_000) });
      if ('error' in r) throw new Error(r.error);
      if (!r.res.ok) throw new Error(`HTTP ${r.res.status}`);
      const items = s.parse(await r.res.text());
      if (!items.length) throw new Error('La fuente no devolvió nada legible (¿ha cambiado de formato?)');
      read += items.length;
      created += (await saveFeedItems(tenantId, 'seo', s.key, items)).created.length;
    } catch (e) {
      errors.push(`${s.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const notified = await notifyFeedAlerts(tenantId, 'seo');
  // Si todas las fuentes fallan, el trabajo falla (y se ve en la salud de la cola); si falla una, se anota.
  if (errors.length === SEO_SOURCES.length) throw new Error(errors.join(' · '));
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
  registerJobKind({ kind: ID_WATCH, timeoutS: 90, maxConcurrent: 1, maxAttempts: 2, run: async (ctx) => watchSeoSources(ctx.tenantId) });
  registerJobKind({
    kind: ID_DIGEST,
    timeoutS: 240,
    maxConcurrent: 1,
    maxAttempts: 2,
    run: async (ctx) => weeklyDigest(ctx.tenantId, 'seo', 'Novedades oficiales de Google Search. Resume qué cambia y qué debería revisar el equipo de SEO en las webs de los clientes')
  });
  registerProcess({ key: ID_WATCH, scopeType: 'cuenta', label: 'I+D SEO: vigilar fuentes oficiales de Google', defaultEveryMinutes: 180, enqueue: () => ({ kind: ID_WATCH, priority: 7 }) });
  registerProcess({ key: ID_DIGEST, scopeType: 'cuenta', label: 'I+D SEO: resumen semanal para la base de conocimiento', defaultEveryMinutes: 7 * 24 * 60, enqueue: () => ({ kind: ID_DIGEST, priority: 8 }) });
}
