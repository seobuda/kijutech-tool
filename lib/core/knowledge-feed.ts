import 'server-only';

// Núcleo: bitácora de I+D (Hito 1 SEO, 23 nov 2026; docs/DISENO-TECNICO-HITO1.md §5 y §9). Lo que publican las fuentes
// oficiales de cada departamento (Google Search hoy; Google Ads después), leído sin IA. Guarda sin repetir, avisa al dueño
// de las actualizaciones de Google y las incidencias (por la cola de avisos), las ofrece como «eventos externos» (así el
// estratega y las gráficas saben que hubo una core update) y prepara el resumen semanal, que la IA redacta como propuesta
// de entrada de la base de conocimiento (solo la publica Enric). Las fuentes las define cada módulo; este archivo no
// importa ninguno.
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { kbFeedItems, type KbFeedItem } from '@/lib/db/schema';
import { registerEventSource, telegramOutbound } from '@/lib/core/capabilities';
import { submitRequest } from '@/lib/core/knowledge';

export type FeedKind = 'core_update' | 'incidencia' | 'documentacion' | 'novedad';
export type FeedItemInput = { hash: string; url: string | null; title: string; summary: string | null; publishedAt: Date | null; kind: FeedKind; startsAt?: Date | null; endsAt?: Date | null };

/** Guarda lo leído de una fuente sin repetir. Una incidencia ya guardada se actualiza (p. ej. cuando termina). */
export async function saveFeedItems(tenantId: string, domain: string, sourceKey: string, items: FeedItemInput[]): Promise<{ created: KbFeedItem[] }> {
  const newIds: string[] = [];
  for (const it of items.slice(0, 200)) {
    const values = {
      tenantId,
      domain,
      sourceKey,
      hash: it.hash.slice(0, 64),
      url: it.url?.slice(0, 2000) ?? null,
      title: it.title.slice(0, 500),
      summary: it.summary?.slice(0, 4000) ?? null,
      publishedAt: it.publishedAt,
      kind: it.kind,
      startsAt: it.startsAt ?? null,
      endsAt: it.endsAt ?? null
    };
    // xmax = 0 solo en una fila recién insertada (no en una actualizada): así se sabe qué es nuevo.
    const [r] = await db
      .insert(kbFeedItems)
      .values(values)
      .onConflictDoUpdate({ target: [kbFeedItems.tenantId, kbFeedItems.sourceKey, kbFeedItems.hash], set: { title: values.title, summary: values.summary, endsAt: values.endsAt } })
      .returning({ id: kbFeedItems.id, inserted: sql<boolean>`(xmax = 0)` });
    if (r?.inserted) newIds.push(r.id);
  }
  const created = newIds.length ? await db.select().from(kbFeedItems).where(inArray(kbFeedItems.id, newIds)) : [];
  return { created };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LABEL: Record<FeedKind, string> = { core_update: 'Actualización de Google', incidencia: 'Incidencia de Google', documentacion: 'Cambio en la documentación', novedad: 'Novedad' };

/**
 * Avisa al dueño (cola de avisos) de las actualizaciones e incidencias recientes no avisadas. Solo las de los últimos
 * «recentDays» días: la primera lectura de una fuente no avisa de su histórico.
 */
export async function notifyFeedAlerts(tenantId: string, domain: string, recentDays = 10): Promise<number> {
  const since = new Date(Date.now() - recentDays * 86_400_000);
  const rows = await db
    .select()
    .from(kbFeedItems)
    .where(and(eq(kbFeedItems.tenantId, tenantId), eq(kbFeedItems.domain, domain), inArray(kbFeedItems.kind, ['core_update', 'incidencia']), isNull(kbFeedItems.notifiedAt), gte(kbFeedItems.publishedAt, since)))
    .limit(10);
  const tg = telegramOutbound();
  if (!rows.length || !tg) return 0;
  for (const r of rows) {
    const html = `📣 <b>${LABEL[r.kind as FeedKind]}</b>: ${esc(r.title)}${r.summary ? `\n${esc(r.summary.slice(0, 500))}` : ''}${r.url ? `\n${esc(r.url)}` : ''}\n\nLas gráficas y el estratega ya lo tienen en cuenta como evento.`;
    await tg.notifyOwner(tenantId, `kb:feed:${r.id}`, html);
    await db.update(kbFeedItems).set({ notifiedAt: new Date() }).where(eq(kbFeedItems.id, r.id));
  }
  return rows.length;
}

/** Lunes de la semana de una fecha (AAAA-MM-DD, hora UTC). */
export function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

/**
 * Resumen semanal: lo de los últimos 7 días que no entró en un resumen se pasa a la IA de la base de conocimiento, que
 * lo redacta como propuesta de entrada (Enric la revisa en Para ti / Telegram). Sin novedades, no gasta nada.
 */
export async function weeklyDigest(tenantId: string, domain: string, intro: string, now = new Date()): Promise<{ items: number; articleId: string | null }> {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await db
    .select()
    .from(kbFeedItems)
    .where(and(eq(kbFeedItems.tenantId, tenantId), eq(kbFeedItems.domain, domain), isNull(kbFeedItems.digestWeek), gte(kbFeedItems.publishedAt, since)))
    .orderBy(desc(kbFeedItems.publishedAt))
    .limit(30);
  if (!rows.length) return { items: 0, articleId: null };
  const week = weekStart(now);
  const text = [
    `${intro} (semana del ${week}).`,
    '',
    ...rows.map((r) => `- [${LABEL[r.kind as FeedKind]}] ${r.title}${r.publishedAt ? ` (${r.publishedAt.toISOString().slice(0, 10)})` : ''}${r.url ? ` ${r.url}` : ''}\n  ${(r.summary ?? '').replace(/\s+/g, ' ').slice(0, 600)}`)
  ].join('\n');
  const r = await submitRequest(tenantId, { text, source: 'agente', byName: 'I+D (bitácora)', byUserId: null, links: rows.filter((x) => x.url).slice(0, 10).map((x) => ({ title: x.title.slice(0, 200), url: x.url! })) });
  await db.update(kbFeedItems).set({ digestWeek: week, articleId: r.id }).where(inArray(kbFeedItems.id, rows.map((x) => x.id)));
  return { items: rows.length, articleId: r.id };
}

export async function listFeedItems(tenantId: string, domain: string | null, limit = 60): Promise<KbFeedItem[]> {
  return db
    .select()
    .from(kbFeedItems)
    .where(domain ? and(eq(kbFeedItems.tenantId, tenantId), eq(kbFeedItems.domain, domain)) : eq(kbFeedItems.tenantId, tenantId))
    .orderBy(desc(kbFeedItems.publishedAt))
    .limit(limit);
}

let registered = false;
/** Las actualizaciones e incidencias de Google, como eventos externos (gráficas y estratega). */
export function registerFeedEvents(): void {
  if (registered) return;
  registered = true;
  registerEventSource('kb.feed', async (tenantId, from, to) => {
    const rows = await db
      .select()
      .from(kbFeedItems)
      .where(
        and(
          eq(kbFeedItems.tenantId, tenantId),
          inArray(kbFeedItems.kind, ['core_update', 'incidencia']),
          lte(kbFeedItems.startsAt, new Date(`${to}T23:59:59Z`)),
          or(isNull(kbFeedItems.endsAt), gte(kbFeedItems.endsAt, new Date(`${from}T00:00:00Z`)))
        )
      )
      .limit(100);
    return rows.map((r) => ({
      date: (r.startsAt ?? r.publishedAt ?? r.createdAt).toISOString().slice(0, 10),
      endDate: r.endsAt ? r.endsAt.toISOString().slice(0, 10) : null,
      kind: 'google',
      title: r.title
    }));
  });
}
