import 'server-only';

// SEO · Local, tanda 5b: geo-grid del mapa de Google (27 nov 2026; docs/DISENO-SEO-GEOGRID.md con la auditoría Opus).
// Cuadrícula 5×5 alrededor de la ficha confirmada del cliente, hasta 3 búsquedas (sus servicios sin la población, o la
// categoría de su ficha), con DataForSEO Maps en cola por el núcleo (serpSource.postMapsTasks/getMapsTask):
// - solo en días laborables de 10 a 12 (Maps favorece a los abiertos); fuera de esa franja se aplaza;
// - zoom fijo y guardado, search_this_area: false; mismo patrón de cobro que posiciones (filas pendientes, tope antes,
//   gasto al enviar, recogida por id, caducidad a 48 h, filas huérfanas cerradas);
// - hallazgos: búsqueda principal débil (estado), caída frente a la ejecución comparable anterior, nombres sospechosos.
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects, seoDossierFacts, seoGeogridPoints, seoGeogridRuns, seoLocalPlaces, seoLocalSnapshots } from '@/lib/db/schema';
import { serpSource } from '@/lib/core/capabilities';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { syncFindings } from '@/lib/core/findings';
import { canSpend, recordDataSpend } from '@/lib/seo/gasto';
import { zoneTowns } from '@/lib/seo/posiciones/rules';
import { clientRank, comparable, coordinate, gridDrop, gridParams, gridPoints, GEOGRID_SOURCE, inSendWindow, nextSendWindow, stripTowns, summarize, suspiciousName } from '@/lib/seo/local/geogrid-rules';

const COLLECT = 'seo.geogrid.recoger';
const COST_PER_TASK = 0.0006;
const EXPIRE_H = 48;
export const GEOGRID_KIND_KEYS = ['seo.geogrid_weak', 'seo.geogrid_drop', 'seo.maps_spam'];

type Outcome = { status: 'ok' | 'aviso' | 'omitido'; summary: string };

async function confirmedFact(projectId: string, field: string): Promise<unknown> {
  const rows = await db
    .select({ value: seoDossierFacts.value, status: seoDossierFacts.status, source: seoDossierFacts.source, confidence: seoDossierFacts.confidence })
    .from(seoDossierFacts)
    .where(and(eq(seoDossierFacts.projectId, projectId), eq(seoDossierFacts.field, field)));
  return rows.filter((r) => r.status === 'confirmado' || r.source === 'ficha').sort((a, b) => Number(b.status === 'confirmado') - Number(a.status === 'confirmado') || b.confidence - a.confidence)[0]?.value;
}

async function clientPlace(tenantId: string, projectId: string) {
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p?.clientId) return null;
  const [place] = await db.select().from(seoLocalPlaces).where(and(eq(seoLocalPlaces.clientId, p.clientId), eq(seoLocalPlaces.role, 'cliente'), eq(seoLocalPlaces.status, 'confirmada'))).limit(1);
  if (!place) return null;
  const [snap] = await db.select().from(seoLocalSnapshots).where(eq(seoLocalSnapshots.placeRowId, place.id)).orderBy(desc(seoLocalSnapshots.takenAt)).limit(1);
  return { place, snap: snap ?? null };
}

/** Hasta 3 búsquedas: los servicios confirmados sin poblaciones; si no hay, la categoría de la ficha. */
async function gridKeywords(projectId: string, category: string | null): Promise<string[]> {
  const services = await confirmedFact(projectId, 'servicios');
  const zona = await confirmedFact(projectId, 'zona');
  const towns = zoneTowns(typeof zona === 'string' ? zona : null);
  const list = (Array.isArray(services) ? services.map(String) : []).map((s) => stripTowns(s, towns)).filter((s) => s.length >= 3);
  const out = [...new Set(list.map((s) => s.toLowerCase()))].slice(0, 3);
  if (!out.length && category) out.push(category.toLowerCase());
  return out;
}

async function enqueueCollect(tenantId: string, projectId: string, minutes: number) {
  const slot = Math.floor((Date.now() + minutes * 60_000) / 600_000);
  await enqueueJob({ tenantId, kind: COLLECT, payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 6, runAt: new Date(Date.now() + minutes * 60_000), dedupeKey: `${COLLECT}:${projectId}:${slot}` });
}

/** Proceso mensual (y «Consultar ahora»): prepara la cuadrícula, comprueba el tope y envía. */
export async function runGeogrid(tenantId: string, projectId: string, _heartbeat?: () => Promise<void>, now = new Date()): Promise<Outcome> {
  const src = serpSource();
  if (!src?.postMapsTasks || !(await src.isConnected(tenantId).catch(() => false))) return { status: 'omitido', summary: 'DataForSEO no está conectado (Agentes → Integraciones).' };
  const cp = await clientPlace(tenantId, projectId);
  if (!cp) return { status: 'omitido', summary: 'Falta confirmar la ficha de Google del cliente (pestaña Local).' };
  if (cp.snap?.lat == null || cp.snap?.lng == null) return { status: 'omitido', summary: 'Su ficha de Google no tiene ubicación (negocio a domicilio sin dirección visible): no se puede centrar la cuadrícula.' };
  const atencion = await confirmedFact(projectId, 'atencion');
  const params = gridParams(typeof atencion === 'string' ? atencion : null);
  if (!params) return { status: 'omitido', summary: 'El negocio atiende solo online: el mapa por zonas no aplica.' };
  // Franja de envío: días laborables de 10 a 12 en Madrid. Fuera de ella se aplaza (clave propia: la del proceso sigue abierta).
  if (!inSendWindow(now)) {
    const at = nextSendWindow(now);
    await enqueueJob({ tenantId, kind: 'seo.geogrid', payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 6, runAt: at, dedupeKey: `seo.geogrid.aplazado:${projectId}` });
    return { status: 'omitido', summary: `Aplazado a ${at.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })}: el mapa se mide en horario comercial.` };
  }
  // Filas que no llegaron a enviarse hace más de 1 h: se cierran (no bloquean).
  const runIds = (await db.select({ id: seoGeogridRuns.id }).from(seoGeogridRuns).where(eq(seoGeogridRuns.projectId, projectId))).map((r) => r.id);
  if (runIds.length) {
    await db.update(seoGeogridPoints).set({ status: 'fallida', error: 'no se llegó a enviar' }).where(and(inArray(seoGeogridPoints.runId, runIds), eq(seoGeogridPoints.status, 'pendiente'), isNull(seoGeogridPoints.taskId), lt(seoGeogridPoints.createdAt, new Date(Date.now() - 3_600_000))));
    const [open] = await db.select({ n: sql<number>`count(*)::int` }).from(seoGeogridPoints).where(and(inArray(seoGeogridPoints.runId, runIds), inArray(seoGeogridPoints.status, ['pendiente', 'enviada'])));
    if (Number(open?.n ?? 0) > 0) {
      await enqueueCollect(tenantId, projectId, 1);
      return { status: 'omitido', summary: 'Ya hay una medición en curso: se recoge sola.' };
    }
  }
  const keywords = await gridKeywords(projectId, cp.snap.category);
  if (!keywords.length) return { status: 'omitido', summary: 'No hay búsquedas: confirma los servicios en el Expediente.' };
  const points = gridPoints(cp.snap.lat, cp.snap.lng, params.stepKm);
  const total = keywords.length * points.length;
  const budget = await canSpend(projectId, total * COST_PER_TASK);
  if (!budget.ok) return { status: 'aviso', summary: `No se midió: este proyecto ya lleva ${budget.spent.toFixed(2)} $ de ${budget.budget} $ en datos este mes.` };
  const batchId = randomUUID();
  const rows: { id: string; keyword: string; lat: number; lng: number }[] = [];
  for (const keyword of keywords) {
    const [run] = await db.insert(seoGeogridRuns).values({ tenantId, projectId, placeRowId: cp.place.id, batchId, keyword, lat: cp.snap.lat, lng: cp.snap.lng, stepKm: params.stepKm, zoom: params.zoom }).returning({ id: seoGeogridRuns.id });
    const inserted = await db
      .insert(seoGeogridPoints)
      .values(points.map((pt) => ({ tenantId, runId: run.id, row: pt.row, col: pt.col, lat: pt.lat, lng: pt.lng })))
      .returning({ id: seoGeogridPoints.id, lat: seoGeogridPoints.lat, lng: seoGeogridPoints.lng });
    rows.push(...inserted.map((x) => ({ ...x, keyword })));
  }
  let posted: Awaited<ReturnType<NonNullable<typeof src.postMapsTasks>>>;
  try {
    posted = await src.postMapsTasks(
      tenantId,
      rows.map((r) => ({ keyword: r.keyword, coordinate: coordinate(r.lat, r.lng, params.zoom), language: 'es', tag: `${tenantId.slice(0, 8)}:${r.id}` }))
    );
  } catch (e) {
    await db.update(seoGeogridPoints).set({ status: 'fallida', error: `error al enviar: ${e instanceof Error ? e.message.slice(0, 200) : 'desconocido'}` }).where(inArray(seoGeogridPoints.id, rows.map((r) => r.id)));
    await recordDataSpend(tenantId, projectId, 'serp', 'local: mapa por zonas (envío sin confirmar, estimado)', total * COST_PER_TASK);
    return { status: 'aviso', summary: 'No se pudo enviar la medición: se reintentará en la próxima.' };
  }
  let cost = 0;
  let errors = 0;
  for (const p of posted) {
    const id = p.tag.split(':')[1];
    const c = p.id ? (p.costUsd > 0 ? p.costUsd : COST_PER_TASK) : p.costUsd;
    cost += c;
    if (p.id) await db.update(seoGeogridPoints).set({ taskId: p.id, status: 'enviada', costUsd: c.toFixed(5), postedAt: new Date() }).where(eq(seoGeogridPoints.id, id));
    else {
      errors++;
      await db.update(seoGeogridPoints).set({ status: 'fallida', error: p.error ?? 'error', postedAt: new Date() }).where(eq(seoGeogridPoints.id, id));
    }
  }
  if (cost > 0) await recordDataSpend(tenantId, projectId, 'serp', 'local: mapa por zonas', cost);
  await enqueueCollect(tenantId, projectId, 10);
  return { status: errors ? 'aviso' : 'ok', summary: `Mapa por zonas enviado: ${keywords.length} búsqueda(s) × ${points.length} puntos (± ${Math.round(params.stepKm * 2 * 10) / 10} km)${errors ? `, ${errors} con error` : ''}. Se recoge en unos minutos.` };
}

/** Recoge por id; caduca a las 48 h; al terminar el lote, resúmenes y hallazgos. */
export async function collectGeogrid(tenantId: string, projectId: string): Promise<Record<string, unknown>> {
  const src = serpSource();
  if (!src?.getMapsTask) return { skipped: 'sin proveedor' };
  const runs = await db.select().from(seoGeogridRuns).where(eq(seoGeogridRuns.projectId, projectId)).orderBy(desc(seoGeogridRuns.createdAt)).limit(30);
  if (!runs.length) return { skipped: 'sin mediciones' };
  const ids = runs.map((r) => r.id);
  await db.update(seoGeogridPoints).set({ status: 'caducada', error: `sin respuesta en ${EXPIRE_H} h` }).where(and(inArray(seoGeogridPoints.runId, ids), eq(seoGeogridPoints.status, 'enviada'), lt(seoGeogridPoints.postedAt, new Date(Date.now() - EXPIRE_H * 3_600_000))));
  const sent = await db.select({ id: seoGeogridPoints.id, runId: seoGeogridPoints.runId, taskId: seoGeogridPoints.taskId }).from(seoGeogridPoints).where(and(inArray(seoGeogridPoints.runId, ids), eq(seoGeogridPoints.status, 'enviada')));
  const placeOf = new Map<string, { cid: string; placeId: string | null }>();
  for (const r of runs) {
    if (placeOf.has(r.placeRowId)) continue;
    const [pl] = await db.select({ cid: seoLocalPlaces.cid, placeId: seoLocalPlaces.placeId }).from(seoLocalPlaces).where(eq(seoLocalPlaces.id, r.placeRowId)).limit(1);
    if (pl) placeOf.set(r.placeRowId, pl);
  }
  let done = 0;
  let pending = 0;
  for (const p of sent) {
    if (!p.taskId) continue;
    const r = await src.getMapsTask(tenantId, p.taskId).catch(() => ({ status: 'pendiente' as const }));
    if (r.status === 'pendiente') {
      pending++;
      continue;
    }
    if (r.status === 'error') {
      await db.update(seoGeogridPoints).set({ status: 'fallida', error: r.error, checkedAt: new Date() }).where(eq(seoGeogridPoints.id, p.id));
      continue;
    }
    const run = runs.find((x) => x.id === p.runId)!;
    const pl = placeOf.get(run.placeRowId);
    const rank = pl ? clientRank(r.items, pl.cid, pl.placeId) : null;
    const top = r.items.slice(0, 20).map((i) => ({ r: i.rank, c: i.cid, t: i.title.slice(0, 120), d: i.domain, v: i.rating, n: i.votes, k: i.category }));
    await db.update(seoGeogridPoints).set({ status: 'hecha', rank: rank !== null && rank <= 100 ? rank : null, results: top, checkedAt: new Date() }).where(eq(seoGeogridPoints.id, p.id));
    done++;
  }
  if (pending) await enqueueCollect(tenantId, projectId, 10);
  else await finalize(tenantId, projectId, runs[0].batchId);
  return { recogidos: done, pendientes: pending };
}

/** Resúmenes del lote y hallazgos (débil, caída frente a la comparable anterior, nombres sospechosos). */
async function finalize(tenantId: string, projectId: string, batchId: string): Promise<void> {
  const runs = await db.select().from(seoGeogridRuns).where(and(eq(seoGeogridRuns.projectId, projectId), eq(seoGeogridRuns.batchId, batchId))).orderBy(seoGeogridRuns.createdAt);
  if (!runs.length) return;
  const services = await confirmedFact(projectId, 'servicios');
  const zona = await confirmedFact(projectId, 'zona');
  const towns = zoneTowns(typeof zona === 'string' ? zona : null);
  const pl = (await db.select({ cid: seoLocalPlaces.cid }).from(seoLocalPlaces).where(eq(seoLocalPlaces.id, runs[0].placeRowId)).limit(1))[0];
  const found: Parameters<typeof syncFindings>[3] = [];
  const spamCount = new Map<string, { t: string; d: string | null; n: number; signals: string[] }>();
  for (const [i, run] of runs.entries()) {
    const pts = await db.select().from(seoGeogridPoints).where(eq(seoGeogridPoints.runId, run.id)).orderBy(seoGeogridPoints.row, seoGeogridPoints.col);
    const ranks = pts.map((p) => (p.status === 'hecha' ? p.rank : undefined));
    const sum = summarize(ranks);
    await db.update(seoGeogridRuns).set({ summary: sum }).where(eq(seoGeogridRuns.id, run.id));
    if (i === 0 && sum.measured >= pts.length * 0.8 && sum.top3Pct < 30) found.push({ kind: 'seo.geogrid_weak', dedupeKey: `seo.geogrid_weak:${run.keyword}`, query: run.keyword, metric: 'top3_pct', value: sum.top3Pct, evidence: { avg: sum.avg } });
    // Caída frente a la ejecución anterior comparable de la misma búsqueda.
    const [prev] = await db
      .select()
      .from(seoGeogridRuns)
      .where(and(eq(seoGeogridRuns.projectId, projectId), eq(seoGeogridRuns.keyword, run.keyword), lt(seoGeogridRuns.createdAt, run.createdAt)))
      .orderBy(desc(seoGeogridRuns.createdAt))
      .limit(1);
    if (prev && comparable(run, prev)) {
      const pp = await db.select().from(seoGeogridPoints).where(eq(seoGeogridPoints.runId, prev.id)).orderBy(seoGeogridPoints.row, seoGeogridPoints.col);
      if (gridDrop(pts.map((p) => (p.status === 'hecha' ? p.rank : null)), pp.map((p) => (p.status === 'hecha' ? p.rank : null)))) {
        found.push({ kind: 'seo.geogrid_drop', dedupeKey: `seo.geogrid_drop:${run.keyword}`, query: run.keyword, metric: 'media', value: sum.avg, evidence: { before: summarize(pp.map((p) => (p.status === 'hecha' ? p.rank : undefined))).avg, now: sum.avg } });
      }
    }
    for (const p of pts) {
      for (const it of (p.results ?? []).filter((x) => x.r <= 3 && x.c && x.c !== pl?.cid)) {
        const s = suspiciousName(it.t, it.d, Array.isArray(services) ? services.map(String) : [], towns);
        if (!s.suspicious) continue;
        const cur = spamCount.get(it.c!) ?? { t: it.t, d: it.d, n: 0, signals: s.signals };
        cur.n++;
        spamCount.set(it.c!, cur);
      }
    }
  }
  for (const [cid, v] of spamCount) if (v.n >= 5) found.push({ kind: 'seo.maps_spam', dedupeKey: `seo.maps_spam:${cid}`, url: `https://maps.google.com/?cid=${cid}`, metric: 'puntos_top3', value: v.n, evidence: { title: v.t, signals: v.signals } });
  await syncFindings(tenantId, projectId, GEOGRID_SOURCE, found, GEOGRID_KIND_KEYS);
}

let registered = false;
export function registerGeogridJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: COLLECT, timeoutS: 240, maxConcurrent: 2, maxAttempts: 2, run: async (ctx, payload) => collectGeogrid(ctx.tenantId, String(payload.projectId ?? '')) });
}
