import 'server-only';

// Módulo Rendimiento: lectura y escritura de sus tablas (perf_*). Sin red: la descarga está en sync.ts.
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients, perfAnnotations, perfDaily, perfGscMonthly, perfSettings, perfSync, type PerfAnnotation, type PerfSettings, type PerfSync } from '@/lib/db/schema';
import type { MetricRow, MetricTopRow } from '@/lib/core/capabilities';
import { KPIS, buildDayMap, isAnnotationKind, isYmd, type DayMap, type Source, type TopRow } from '@/lib/rendimiento/rules';

export class PerfError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

// --- Datos diarios --------------------------------------------------------------------------------------------------

/** Guarda filas diarias encima de lo que haya (Google corrige días recientes). Por tandas de 1.000. */
export async function upsertDaily(tenantId: string, clientId: string, source: Source, property: string, rows: MetricRow[]): Promise<number> {
  const clean = new Map<string, typeof perfDaily.$inferInsert>();
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(r.value)) continue;
    const v = { tenantId, clientId, source, property, date: r.date, metric: r.metric.slice(0, 40), dimType: (r.dimType ?? '').slice(0, 20), dimValue: (r.dimValue ?? '').slice(0, 120), value: r.value };
    clean.set(`${v.date}|${v.metric}|${v.dimType}|${v.dimValue}`, v); // sin duplicados dentro de la misma tanda
  }
  const all = [...clean.values()];
  for (let i = 0; i < all.length; i += 1000) {
    await db
      .insert(perfDaily)
      .values(all.slice(i, i + 1000))
      .onConflictDoUpdate({ target: [perfDaily.clientId, perfDaily.source, perfDaily.property, perfDaily.date, perfDaily.metric, perfDaily.dimType, perfDaily.dimValue], set: { value: sql`excluded.value` } });
  }
  return all.length;
}

/** Consultas o páginas de un mes: sustituye las que hubiera de ese mes (una consulta que desaparece no se queda). */
export async function replaceMonthly(tenantId: string, clientId: string, property: string, month: string, kind: 'query' | 'page', rows: MetricTopRow[]): Promise<void> {
  const seen = new Map<string, typeof perfGscMonthly.$inferInsert>();
  for (const r of rows) {
    const key = String(r.key ?? '').slice(0, 2000);
    if (!key) continue;
    seen.set(key, { tenantId, clientId, property, month, kind, key, clicks: Math.round(r.clicks) || 0, impressions: Math.round(r.impressions) || 0, ctr: Number(r.ctr) || 0, position: Number(r.position) || 0 });
  }
  await db.transaction(async (tx) => {
    await tx.delete(perfGscMonthly).where(and(eq(perfGscMonthly.clientId, clientId), eq(perfGscMonthly.property, property), eq(perfGscMonthly.month, month), eq(perfGscMonthly.kind, kind)));
    const vals = [...seen.values()];
    for (let i = 0; i < vals.length; i += 1000) await tx.insert(perfGscMonthly).values(vals.slice(i, i + 1000));
  });
}

export type PropertyRef = { source: Source; property: string };

/** Datos diarios de las propiedades indicadas entre dos fechas, listos para calcular. */
export async function loadDays(tenantId: string, clientId: string, props: PropertyRef[], from: string, to: string): Promise<DayMap> {
  if (!props.length) return new Map();
  const rows = await db
    .select({ source: perfDaily.source, property: perfDaily.property, date: perfDaily.date, metric: perfDaily.metric, dimType: perfDaily.dimType, dimValue: perfDaily.dimValue, value: perfDaily.value })
    .from(perfDaily)
    .where(
      and(
        eq(perfDaily.tenantId, tenantId),
        eq(perfDaily.clientId, clientId),
        inArray(perfDaily.source, [...new Set(props.map((p) => p.source))]),
        inArray(perfDaily.property, props.map((p) => p.property)),
        gte(perfDaily.date, from),
        lte(perfDaily.date, to)
      )
    );
  const allowed = new Set(props.map((p) => `${p.source}|${p.property}`));
  return buildDayMap(rows.filter((r) => allowed.has(`${r.source}|${r.property}`)));
}

/** Métricas que necesitan las cifras (todas las de KPIS), para acotar las consultas de todos los clientes. */
const TENANT_METRICS = [...new Set([...KPIS.flatMap((k) => k.parts.map((p) => p.split('|')[1])), 'position'].filter((m) => m !== 'posw'))];

/** Datos diarios de todos los clientes (panel central e informes), con su cliente. Totales, el canal orgánico y las visitas desde IA. */
export async function loadTenantDays(tenantId: string, props: (PropertyRef & { clientId: string })[], from: string, to: string): Promise<Map<string, DayMap>> {
  const out = new Map<string, DayMap>();
  if (!props.length) return out;
  const rows = await db
    .select({ clientId: perfDaily.clientId, source: perfDaily.source, property: perfDaily.property, date: perfDaily.date, metric: perfDaily.metric, dimType: perfDaily.dimType, dimValue: perfDaily.dimValue, value: perfDaily.value })
    .from(perfDaily)
    .where(
      and(
        eq(perfDaily.tenantId, tenantId),
        // Fuente y métrica acotadas para que use el índice (tenant, source, metric, date) y no recorra años de filas.
        inArray(perfDaily.source, [...new Set(props.map((p) => p.source))]),
        inArray(perfDaily.metric, TENANT_METRICS),
        gte(perfDaily.date, from),
        lte(perfDaily.date, to),
        sql`(${perfDaily.dimType} IN ('', 'source') OR (${perfDaily.dimType} = 'channel' AND ${perfDaily.dimValue} = 'Organic Search'))`
      )
    );
  const allowed = new Set(props.map((p) => `${p.clientId}|${p.source}|${p.property}`));
  const byClient = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!allowed.has(`${r.clientId}|${r.source}|${r.property}`)) continue;
    const list = byClient.get(r.clientId) ?? [];
    list.push(r);
    byClient.set(r.clientId, list);
  }
  for (const [c, list] of byClient) out.set(c, buildDayMap(list));
  return out;
}

/** Desglose (canal de Analytics o dispositivo de Search Console) sumado en un periodo. */
export async function breakdown(tenantId: string, clientId: string, ref: PropertyRef, metric: string, dimType: string, from: string, to: string): Promise<{ key: string; value: number }[]> {
  const rows = await db
    .select({ key: perfDaily.dimValue, value: sql<number>`sum(${perfDaily.value})` })
    .from(perfDaily)
    .where(and(eq(perfDaily.tenantId, tenantId), eq(perfDaily.clientId, clientId), eq(perfDaily.source, ref.source), eq(perfDaily.property, ref.property), eq(perfDaily.metric, metric), eq(perfDaily.dimType, dimType), gte(perfDaily.date, from), lte(perfDaily.date, to)))
    .groupBy(perfDaily.dimValue);
  return rows.map((r) => ({ key: r.key, value: Number(r.value) })).sort((a, b) => b.value - a.value);
}

export async function monthlyTop(tenantId: string, clientId: string, property: string, month: string, kind: 'query' | 'page'): Promise<TopRow[]> {
  const rows = await db
    .select({ key: perfGscMonthly.key, clicks: perfGscMonthly.clicks, impressions: perfGscMonthly.impressions, position: perfGscMonthly.position })
    .from(perfGscMonthly)
    .where(and(eq(perfGscMonthly.tenantId, tenantId), eq(perfGscMonthly.clientId, clientId), eq(perfGscMonthly.property, property), eq(perfGscMonthly.month, month), eq(perfGscMonthly.kind, kind)))
    .orderBy(desc(perfGscMonthly.clicks));
  return rows;
}

/** Meses con consultas guardadas de una propiedad (más reciente primero). */
export async function monthsWithTop(tenantId: string, clientId: string, property: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ month: perfGscMonthly.month })
    .from(perfGscMonthly)
    .where(and(eq(perfGscMonthly.tenantId, tenantId), eq(perfGscMonthly.clientId, clientId), eq(perfGscMonthly.property, property)))
    .orderBy(desc(perfGscMonthly.month));
  return rows.map((r) => r.month);
}

// --- Estado de la sincronización ------------------------------------------------------------------------------------

export async function listSync(tenantId: string, clientId?: string): Promise<PerfSync[]> {
  return db
    .select()
    .from(perfSync)
    .where(clientId ? and(eq(perfSync.tenantId, tenantId), eq(perfSync.clientId, clientId)) : eq(perfSync.tenantId, tenantId))
    .orderBy(asc(perfSync.clientId), asc(perfSync.source), desc(perfSync.updatedAt));
}

/** La propiedad que manda de cada fuente: la activa; si no hay ninguna activa, la última que tuvo datos. */
export function activeBySource(rows: PerfSync[]): Partial<Record<Source, PerfSync>> {
  const out: Partial<Record<Source, PerfSync>> = {};
  for (const r of rows) {
    const s = r.source as Source;
    const cur = out[s];
    const better = !cur || (cur.status === 'inactiva' && r.status !== 'inactiva') || (cur.status === 'inactiva' && r.status === 'inactiva' && (r.syncedUntil ?? '') > (cur.syncedUntil ?? ''));
    if (better) out[s] = r;
  }
  return out;
}

export async function updateSync(id: string, patch: Partial<typeof perfSync.$inferInsert>): Promise<void> {
  await db.update(perfSync).set({ ...patch, updatedAt: new Date() }).where(eq(perfSync.id, id));
}

/** Pide repetir ya la descarga de un cliente (botón «Sincronizar ahora»). */
export async function requestResync(tenantId: string, clientId: string): Promise<number> {
  const res = await db
    .update(perfSync)
    .set({ nextAttemptAt: null, lastDailyOn: null, updatedAt: new Date() })
    .where(and(eq(perfSync.tenantId, tenantId), eq(perfSync.clientId, clientId), ne(perfSync.status, 'inactiva')))
    .returning({ id: perfSync.id });
  return res.length;
}

// --- Hitos ----------------------------------------------------------------------------------------------------------

export async function listAnnotations(tenantId: string, clientId: string): Promise<PerfAnnotation[]> {
  return db.select().from(perfAnnotations).where(and(eq(perfAnnotations.tenantId, tenantId), eq(perfAnnotations.clientId, clientId))).orderBy(asc(perfAnnotations.date), asc(perfAnnotations.createdAt));
}

export type AnnotationInput = { id?: string | null; date: string; kind: string; title: string; notes?: string; source?: 'manual' | 'agente' | 'sistema'; createdBy?: number | null };

export function validateAnnotation(input: AnnotationInput): { date: string; kind: string; title: string; notes: string | null } {
  const date = String(input.date ?? '').trim();
  if (!isYmd(date)) throw new PerfError('La fecha del hito no es válida.');
  const title = String(input.title ?? '').trim().slice(0, 200);
  if (!title) throw new PerfError('Escribe qué pasó (título del hito).');
  const kind = isAnnotationKind(String(input.kind)) ? String(input.kind) : 'otro';
  const notes = String(input.notes ?? '').trim().slice(0, 2000) || null;
  return { date, kind, title, notes };
}

export async function saveAnnotation(tenantId: string, clientId: string, input: AnnotationInput): Promise<string> {
  const v = validateAnnotation(input);
  if (input.id) {
    const res = await db
      .update(perfAnnotations)
      .set({ ...v, updatedAt: new Date() })
      .where(and(eq(perfAnnotations.id, input.id), eq(perfAnnotations.tenantId, tenantId), eq(perfAnnotations.clientId, clientId)))
      .returning({ id: perfAnnotations.id });
    if (!res.length) throw new PerfError('Ese hito ya no existe.');
    return res[0].id;
  }
  // El cliente tiene que ser de esta cuenta (aislamiento entre cuentas).
  const [owner] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))).limit(1);
  if (!owner) throw new PerfError('Ese cliente no existe.');
  const [row] = await db
    .insert(perfAnnotations)
    .values({ tenantId, clientId, ...v, source: input.source ?? 'manual', createdBy: input.createdBy ?? null })
    .returning({ id: perfAnnotations.id });
  return row.id;
}

export async function deleteAnnotation(tenantId: string, id: string): Promise<void> {
  const res = await db.delete(perfAnnotations).where(and(eq(perfAnnotations.id, id), eq(perfAnnotations.tenantId, tenantId))).returning({ id: perfAnnotations.id });
  if (!res.length) throw new PerfError('Ese hito ya no existe.');
}

// --- Ajustes --------------------------------------------------------------------------------------------------------

export const DEFAULT_SETTINGS = { alertsEnabled: true, alertPct: 30, alertRises: true, alertMinVolume: 20, monthlyReport: true, weeklySection: true };

export async function getSettings(tenantId: string): Promise<PerfSettings> {
  const [row] = await db.select().from(perfSettings).where(eq(perfSettings.tenantId, tenantId)).limit(1);
  return row ?? { tenantId, ...DEFAULT_SETTINGS, state: {}, updatedAt: new Date(0) };
}

export type SettingsInput = Partial<typeof DEFAULT_SETTINGS>;

export async function saveSettings(tenantId: string, input: SettingsInput): Promise<void> {
  const clampInt = (v: unknown, def: number, min: number, max: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const cur = await getSettings(tenantId);
  const v = {
    alertsEnabled: input.alertsEnabled ?? cur.alertsEnabled,
    alertPct: input.alertPct !== undefined ? clampInt(input.alertPct, 30, 10, 90) : cur.alertPct,
    alertRises: input.alertRises ?? cur.alertRises,
    alertMinVolume: input.alertMinVolume !== undefined ? clampInt(input.alertMinVolume, 20, 1, 100000) : cur.alertMinVolume,
    monthlyReport: input.monthlyReport ?? cur.monthlyReport,
    weeklySection: input.weeklySection ?? cur.weeklySection
  };
  await db
    .insert(perfSettings)
    .values({ tenantId, ...v, state: cur.state })
    .onConflictDoUpdate({ target: perfSettings.tenantId, set: { ...v, updatedAt: new Date() } });
}

export async function saveSettingsState(tenantId: string, state: PerfSettings['state']): Promise<void> {
  await db
    .insert(perfSettings)
    .values({ tenantId, ...DEFAULT_SETTINGS, state })
    .onConflictDoUpdate({ target: perfSettings.tenantId, set: { state, updatedAt: new Date() } });
}

// --- Histórico del cliente (D6, 18 nov 2026) ------------------------------------------------------------------------

/** Motivo para no borrar a la ligera un cliente con histórico de Google guardado (o null si no tiene). */
export async function historyBlocker(tenantId: string, clientId: string): Promise<string | null> {
  const [d] = await db
    .select({ days: sql<number>`count(distinct ${perfDaily.date})::int`, from: sql<string | null>`min(${perfDaily.date})` })
    .from(perfDaily)
    .where(and(eq(perfDaily.tenantId, tenantId), eq(perfDaily.clientId, clientId)));
  const [m] = await db.select({ n: sql<number>`count(*)::int` }).from(perfGscMonthly).where(and(eq(perfGscMonthly.tenantId, tenantId), eq(perfGscMonthly.clientId, clientId)));
  const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(perfAnnotations).where(and(eq(perfAnnotations.tenantId, tenantId), eq(perfAnnotations.clientId, clientId)));
  if (!d?.days && !m?.n && !a?.n) return null;
  const parts = [d?.days ? `${d.days} días de datos de Google desde ${d.from}` : '', m?.n ? 'resúmenes mensuales de Search Console' : '', a?.n ? `${a.n} hito${a.n === 1 ? '' : 's'}` : ''].filter(Boolean);
  return `Tiene histórico en Rendimiento (${parts.join(', ')}); Google solo guarda 16 meses y no se puede recuperar.`;
}
