import 'server-only';

// Módulo Rendimiento: descarga de los números de cada propiedad (15 nov 2026). La llama el planificador cada 30 s
// (tarea registrada en el núcleo) con un tope de tiempo por vuelta, así que el trabajo se reparte en muchas vueltas:
//   1. Descubrir: la cuenta principal de Search Console, Analytics y Business Profile de cada cliente que no está de
//      baja (de su ficha). Una propiedad nueva entra como «pendiente»; la que deja de ser la principal pasa a
//      «inactiva» (su histórico se queda).
//   2. Primer tramo (lo más reciente) en cuanto se asigna la propiedad.
//   3. Cada día desde las 7:00 de Madrid: los últimos 10 días otra vez (Google corrige días recientes). Si hubo un hueco
//      (Google caído varios días), se rellena por tramos.
//   4. Histórico hacia atrás por tramos hasta el límite de cada fuente o hasta que se acaben los datos.
//   5. Search Console: las 1.000 consultas y páginas con más clics de cada mes cerrado (del más reciente al más antiguo).
// Este módulo no habla con Google: usa las fuentes de métricas registradas en el núcleo (Agentes registra la de Google).
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { perfSync, type PerfSync } from '@/lib/db/schema';
import { metricSources, type MetricSource, type MetricSourceKind } from '@/lib/core/capabilities';
import { listPrimaryAssets } from '@/lib/core/clients';
import { addDays, addMonths, madridNow, monthEnd, monthStart, type Source } from '@/lib/rendimiento/rules';
import { listSync, replaceMonthly, updateSync, upsertDaily } from '@/lib/rendimiento/store';

export const DAILY_HOUR = 7;
export const REFRESH_DAYS = 10;
export const TOP_LIMIT = 1000;
const DISCOVER_EVERY_MS = 10 * 60_000;
const lastDiscover = new Map<string, number>();
const running = new Set<string>();
// Filas en curso, compartidas por todo el proceso (Next.js puede cargar este archivo en varios paquetes).
const GS = globalThis as unknown as { __kijuPerfBusy?: Set<string> };
const busyRows = () => (GS.__kijuPerfBusy ??= new Set<string>());

type Resolved = { src: MetricSource; kind: MetricSourceKind };

/** Fuente y tipo para una clave corta (gsc, ga4, gbp). */
function resolve(sources: MetricSource[], source: string): Resolved | null {
  for (const src of sources) {
    const kind = src.kinds.find((k) => k.source === source);
    if (kind) return { src, kind };
  }
  return null;
}

/** Último día que se pide: hoy menos el retraso de la fuente (Business Profile da ceros en días aún sin datos). */
export const lastFetchDay = (today: string, kind: MetricSourceKind) => addDays(today, -Math.max(1, kind.lagDays));

/** Mes de consultas pendiente (el más reciente sin descargar) o null. */
export function nextMonthToFetch(row: Pick<PerfSync, 'historyFrom' | 'state'>, kind: MetricSourceKind, today: string): string | null {
  if (!kind.monthlyTop || !row.historyFrom) return null;
  const done = new Set(row.state?.months ?? []);
  const oldest = monthStart(row.historyFrom > addDays(today, -kind.historyDays) ? row.historyFrom : addDays(today, -kind.historyDays));
  // Un mes se da por cerrado cuando han pasado los días de retraso de la fuente desde su último día.
  for (let m = addMonths(monthStart(today), -1); m >= oldest; m = addMonths(m, -1)) {
    if (addDays(monthEnd(m), kind.lagDays + 1) > today) continue;
    if (!done.has(m.slice(0, 7))) return m;
  }
  return null;
}

type Unit = 'first' | 'daily' | 'backfill' | 'monthly';
const PRIORITY: Record<Unit, number> = { first: 0, daily: 1, backfill: 2, monthly: 3 };

/** Qué toca hacer ahora con una propiedad (o nada). */
export function nextUnit(row: Pick<PerfSync, 'status' | 'backfillDone' | 'syncedUntil' | 'lastDailyOn' | 'historyFrom' | 'state' | 'nextAttemptAt'>, kind: MetricSourceKind, now: { date: string; hour: number }, opts: { force?: boolean; at?: Date } = {}): Unit | null {
  if (row.status === 'inactiva') return null;
  if (!opts.force && row.nextAttemptAt && row.nextAttemptAt > (opts.at ?? new Date())) return null;
  if (!row.backfillDone && !row.state?.cursor) return 'first';
  if (row.lastDailyOn !== now.date && (now.hour >= DAILY_HOUR || opts.force)) return 'daily';
  if (!row.backfillDone) return 'backfill';
  if (nextMonthToFetch(row, kind, now.date)) return 'monthly';
  return null;
}

const minD = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
const maxD = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

async function runUnit(tenantId: string, row: PerfSync, unit: Unit, r: Resolved, today: string): Promise<Partial<PerfSync>> {
  const { src, kind } = r;
  const source = row.source as Source;
  const end = lastFetchDay(today, kind);
  const limitFrom = addDays(today, -kind.historyDays);

  if (unit === 'first' || unit === 'backfill') {
    const to = row.state?.cursor ? addDays(row.state.cursor, -1) : end;
    if (to < limitFrom) return { backfillDone: true };
    const from = addDays(to, -(kind.chunkDays - 1)) > limitFrom ? addDays(to, -(kind.chunkDays - 1)) : limitFrom;
    let rows;
    try {
      rows = await src.fetchDaily(tenantId, source, row.property, from, to);
    } catch (e) {
      // Ya hay datos recientes y Google rechaza un tramo más antiguo: es el límite real de su histórico.
      if (row.state?.cursor && /\((400|404)\)/.test(e instanceof Error ? e.message : '')) return { backfillDone: true, state: { ...row.state, cursor: from } };
      throw e;
    }
    await upsertDaily(tenantId, row.clientId, source, row.property, rows);
    const dates = rows.filter((x) => x.value !== 0 || source !== 'gbp').map((x) => x.date).sort();
    const empty = dates.length ? 0 : (row.state?.empty ?? 0) + 1;
    const done = from <= limitFrom || (empty > 0 && (Boolean(row.syncedUntil) || empty >= 2));
    return {
      state: { ...row.state, cursor: from, empty },
      historyFrom: minD(row.historyFrom, dates[0] ?? null),
      syncedUntil: maxD(row.syncedUntil, dates[dates.length - 1] ?? null),
      backfillDone: done,
      ...(unit === 'first' ? { lastDailyOn: today } : {})
    };
  }

  if (unit === 'daily') {
    let from = addDays(end, -(REFRESH_DAYS - 1));
    // Hueco de más de 10 días (Google caído o el servidor parado): se rellena desde unos días antes del último dato.
    if (row.syncedUntil && addDays(row.syncedUntil, -3) < from) from = addDays(row.syncedUntil, -3);
    if (from < limitFrom) from = limitFrom;
    const to = addDays(from, kind.chunkDays - 1) < end ? addDays(from, kind.chunkDays - 1) : end;
    const rows = await src.fetchDaily(tenantId, source, row.property, from, to);
    await upsertDaily(tenantId, row.clientId, source, row.property, rows);
    const dates = rows.filter((x) => x.value !== 0 || source !== 'gbp').map((x) => x.date).sort();
    return {
      syncedUntil: maxD(row.syncedUntil, dates[dates.length - 1] ?? null),
      historyFrom: minD(row.historyFrom, dates[0] ?? null),
      // Si el hueco era más grande que un tramo, la siguiente vuelta sigue rellenando.
      ...(to >= end ? { lastDailyOn: today } : { syncedUntil: maxD(row.syncedUntil, to) })
    };
  }

  // monthly
  const m = nextMonthToFetch(row, kind, today);
  if (!m || !src.fetchTop) return {};
  const mEnd = monthEnd(m);
  const [queries, pages] = await Promise.all([src.fetchTop(tenantId, source, row.property, m, mEnd, 'query', TOP_LIMIT), src.fetchTop(tenantId, source, row.property, m, mEnd, 'page', TOP_LIMIT)]);
  await replaceMonthly(tenantId, row.clientId, row.property, m, 'query', queries);
  await replaceMonthly(tenantId, row.clientId, row.property, m, 'page', pages);
  const months = [...new Set([...(row.state?.months ?? []), m.slice(0, 7)])].sort().slice(-60);
  return { state: { ...row.state, months } };
}

/** Propiedades a descargar según las fichas: entran las nuevas, se reactivan o pasan a «inactiva». */
export async function discover(tenantId: string, sources: MetricSource[]): Promise<{ added: number; inactivated: number }> {
  const connected: MetricSource[] = [];
  for (const s of sources) if (await s.isConnected(tenantId).catch(() => false)) connected.push(s);
  const kinds = connected.flatMap((s) => s.kinds.map((k) => ({ s, k })));
  if (!kinds.length) return { added: 0, inactivated: 0 };
  const assets = await listPrimaryAssets(tenantId, kinds.map((x) => x.k.assetKind));
  const wanted = new Map<string, { clientId: string; source: string; property: string }>();
  for (const a of assets) {
    if (a.access === 'no_aplica') continue;
    const x = kinds.find((y) => y.k.assetKind === a.kind);
    if (!x) continue;
    const property = x.s.normalize(x.k.source, a.value);
    if (property) wanted.set(`${a.clientId}|${x.k.source}|${property}`, { clientId: a.clientId, source: x.k.source, property });
  }
  const managed = new Set<string>(kinds.map((x) => x.k.source));
  const existing = await listSync(tenantId);
  const have = new Set(existing.map((r) => `${r.clientId}|${r.source}|${r.property}`));
  const toAdd = [...wanted.entries()].filter(([k]) => !have.has(k)).map(([, v]) => ({ tenantId, ...v, status: 'pendiente' }));
  if (toAdd.length) await db.insert(perfSync).values(toAdd).onConflictDoNothing();
  let inactivated = 0;
  for (const r of existing) {
    if (!managed.has(r.source)) continue; // fuente desconectada: no se toca
    const key = `${r.clientId}|${r.source}|${r.property}`;
    if (wanted.has(key) && r.status === 'inactiva') await updateSync(r.id, { status: r.backfillDone ? 'al_dia' : 'descargando', nextAttemptAt: null });
    else if (!wanted.has(key) && r.status !== 'inactiva') {
      await updateSync(r.id, { status: 'inactiva' });
      inactivated++;
    }
  }
  return { added: toAdd.length, inactivated };
}

export type SyncReport = { units: number; errors: number; pending: number };

/**
 * Una vuelta de descarga con tope de tiempo. Con «clientId» solo ese cliente (botón «Sincronizar ahora»).
 * Cada propiedad hace una unidad por pasada; se repiten pasadas mientras quede tiempo y trabajo.
 */
export async function runPerformanceSync(tenantId: string, opts: { budgetMs?: number; clientId?: string; force?: boolean; now?: Date } = {}): Promise<SyncReport> {
  const report: SyncReport = { units: 0, errors: 0, pending: 0 };
  const sources = metricSources();
  if (!sources.length) return report;
  const lockKey = `${tenantId}:${opts.clientId ?? '*'}`;
  if (running.has(lockKey)) return report;
  running.add(lockKey);
  try {
    const at = opts.now ?? new Date();
    if (opts.force || Date.now() - (lastDiscover.get(tenantId) ?? 0) > DISCOVER_EVERY_MS) {
      lastDiscover.set(tenantId, Date.now());
      await discover(tenantId, sources);
    }
    const deadline = Date.now() + (opts.budgetMs ?? 8_000);
    const now = madridNow(at);
    const connected = new Map<string, boolean>();
    const isOn = async (s: MetricSource) => {
      if (!connected.has(s.provider)) connected.set(s.provider, await s.isConnected(tenantId).catch(() => false));
      return connected.get(s.provider)!;
    };
    let rows = (await listSync(tenantId, opts.clientId)).filter((r) => r.status !== 'inactiva');
    const errored = new Set<string>();
    for (let pass = 0; pass < 50 && Date.now() < deadline; pass++) {
      const work: { row: PerfSync; unit: Unit; r: Resolved }[] = [];
      for (const row of rows) {
        if (errored.has(row.id)) continue;
        const r = resolve(sources, row.source);
        if (!r || !(await isOn(r.src))) continue;
        const unit = nextUnit(row, r.kind, now, { force: opts.force, at });
        if (unit) work.push({ row, unit, r });
      }
      if (!work.length) break;
      work.sort((a, b) => PRIORITY[a.unit] - PRIORITY[b.unit]);
      for (const w of work) {
        if (Date.now() >= deadline) break;
        // Candado por propiedad: el planificador y «Sincronizar ahora» no trabajan a la vez la misma fila.
        if (busyRows().has(w.row.id)) continue;
        busyRows().add(w.row.id);
        try {
          // Se relee la fila: otra descarga puede haberla avanzado mientras tanto.
          const [fresh] = await db.select().from(perfSync).where(eq(perfSync.id, w.row.id)).limit(1);
          const unit = fresh ? nextUnit(fresh, w.r.kind, now, { force: opts.force, at }) : null;
          if (!fresh || !unit) {
            if (fresh) rows = rows.map((x) => (x.id === fresh.id ? fresh : x));
            continue;
          }
          w.row = fresh;
          w.unit = unit;
          const patch = await runUnit(tenantId, w.row, w.unit, w.r, now.date);
          const merged = { ...w.row, ...patch } as PerfSync;
          const finished = merged.backfillDone && !nextMonthToFetch(merged, w.r.kind, now.date);
          const full = { ...patch, status: finished ? 'al_dia' : 'descargando', lastRunAt: new Date(), lastError: null, errorCount: 0, nextAttemptAt: null };
          await updateSync(w.row.id, full);
          rows = rows.map((x) => (x.id === w.row.id ? ({ ...x, ...full } as PerfSync) : x));
          report.units++;
        } catch (e) {
          const msg = (e instanceof Error ? e.message : 'Error desconocido').slice(0, 300);
          const count = w.row.errorCount + 1;
          const waitMin = Math.min(10 * 2 ** (count - 1), 12 * 60);
          const patch = { status: 'error', lastError: msg, errorCount: count, lastRunAt: new Date(), nextAttemptAt: new Date(Date.now() + waitMin * 60_000) };
          await updateSync(w.row.id, patch);
          rows = rows.map((x) => (x.id === w.row.id ? ({ ...x, ...patch } as PerfSync) : x));
          errored.add(w.row.id);
          report.errors++;
          console.error(`[rendimiento] ${w.row.source} ${w.row.property}:`, msg);
        } finally {
          busyRows().delete(w.row.id);
        }
      }
    }
    for (const row of rows) {
      const r = resolve(sources, row.source);
      if (r && nextUnit(row, r.kind, now, { at }) !== null) report.pending++;
    }
    return report;
  } finally {
    running.delete(lockKey);
  }
}

/** Para las pruebas. */
export function _resetSyncState(): void {
  lastDiscover.clear();
  running.clear();
  busyRows().clear();
}
