import 'server-only';

// SEO · Posiciones (parte 4, 26 nov 2026; docs/DISENO-SEO-POSICIONES.md con la auditoría Opus).
// - Semilla por proyecto (seo_rank_keywords): GSC sin marca + servicio × población (confirmados) + marca + manuales;
//   solo se añade, nunca se reactiva lo que una persona quitó; como mucho 50 activas.
// - Cada semana (proceso «seo.posiciones»): una fila «pendiente» por búsqueda y ejecución (clave única: un reintento no
//   paga dos veces), tope de gasto comprobado ANTES, envío a la cola asíncrona de DataForSEO (por el núcleo: serpSource)
//   y gasto apuntado AL ENVIAR (es cuando se cobra).
// - Recogida («seo.posiciones.recoger»): task_get por el id guardado (gratis 30 días), solo mientras queden enviadas;
//   lo que no llega en 48 h caduca. Al terminar, hallazgos con margen (caída del top 10 y salida del mapa).
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients, crawlPages, crawlRuns, findings, projects, seoDossierFacts, seoRankChecks, seoRankKeywords } from '@/lib/db/schema';
import { serpSource } from '@/lib/core/capabilities';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { syncFindings } from '@/lib/core/findings';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { projectWebUrl } from '@/lib/seo/salud/audit';
import { brandTokens, host, isBrandQuery, normText } from '@/lib/seo/expediente/rules';
import { missingZonePages } from '@/lib/seo/local/citas-zonas-rules';
import { canSpend, recordDataSpend } from '@/lib/seo/gasto';
import { buildSeed, isImportant, keywordLanguage, kwKey, lostLocalPackState, MAX_KEYWORDS, pickLocation, rankDropState, readSerp, zoneTowns, type HistoryPoint } from '@/lib/seo/posiciones/rules';

export const POSICIONES_SOURCE = 'seo.posiciones:serp';
const COLLECT = 'seo.posiciones.recoger';
const DEPTH = 20;
/** Coste estimado por tarea en cola estándar: 2 páginas de 10 (0,0012 $) + AI Overview asíncrono (0,0006 $) [precios del 26 nov]. */
const COST_PER_TASK = 0.0018;
const EXPIRE_H = 48;

type Outcome = { status: 'ok' | 'aviso' | 'omitido'; summary: string };

/** Lo confirmado del expediente (o de la ficha): servicios, zona e idiomas. La IA sin confirmar no cuenta. */
async function confirmedFacts(projectId: string) {
  const rows = await db.select({ field: seoDossierFacts.field, value: seoDossierFacts.value, source: seoDossierFacts.source, status: seoDossierFacts.status, confidence: seoDossierFacts.confidence }).from(seoDossierFacts).where(eq(seoDossierFacts.projectId, projectId));
  const best = (field: string) =>
    rows
      .filter((r) => r.field === field && r.status !== 'descartado' && (r.status === 'confirmado' || r.source === 'ficha'))
      .sort((a, b) => Number(b.status === 'confirmado') - Number(a.status === 'confirmado') || b.confidence - a.confidence)[0]?.value;
  const services = best('servicios');
  const zona = best('zona');
  const langs = best('idiomas') ?? rows.find((r) => r.field === 'idiomas')?.value;
  return {
    services: Array.isArray(services) ? services.map(String).filter((s) => s.split(/\s+/).length <= 4) : [],
    zona: typeof zona === 'string' ? zona : null,
    langs: Array.isArray(langs) ? langs.map(String) : ['es']
  };
}

async function projectBasics(tenantId: string, projectId: string) {
  const [p] = await db
    .select({ id: projects.id, clientName: clients.name, aliases: clients.aliases })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  if (!p) return null;
  const web = await projectWebUrl(tenantId, projectId);
  const domain = host(web);
  const names = [p.clientName ?? '', ...((p.aliases as string[] | null) ?? [])].filter(Boolean);
  return { domain, names, brand: p.clientName ?? null };
}

/** Pone al día la semilla (solo añade). Devuelve cuántas añadió y si hay zona y servicios confirmados. */
export async function syncSeed(tenantId: string, projectId: string): Promise<{ added: number; hasLocal: boolean }> {
  const basics = await projectBasics(tenantId, projectId);
  if (!basics) return { added: 0, hasLocal: false };
  const facts = await confirmedFacts(projectId);
  const existing = await db.select({ key: seoRankKeywords.keywordKey, status: seoRankKeywords.status }).from(seoRankKeywords).where(eq(seoRankKeywords.projectId, projectId));
  const active = existing.filter((e) => e.status === 'activa').length;
  if (active >= MAX_KEYWORDS) return { added: 0, hasLocal: Boolean(facts.zona && facts.services.length) };
  const props = await gscPropertiesForProject(tenantId, projectId).catch(() => []);
  let gsc: { query: string; impressions: number }[] = [];
  if (props.length) {
    const ids = sql.join(props.map((p) => sql`${p.id}`), sql`, `);
    const rows = (await db.execute(sql`
      SELECT q.query, sum(d.impressions)::int AS impressions FROM gsc_daily d JOIN gsc_queries q ON q.id = d.query_id
      WHERE d.property_id IN (${ids}) AND d.search_type = 1 AND d.date >= current_date - 90
      GROUP BY q.query ORDER BY 2 DESC LIMIT 200`)) as unknown as { query: string; impressions: number }[];
    const tokens = brandTokens(basics.names);
    gsc = [...rows].filter((r) => !isBrandQuery(r.query, tokens)).map((r) => ({ query: r.query, impressions: Number(r.impressions) }));
  }
  const seed = buildSeed({ gscQueries: gsc, services: facts.services, zona: facts.zona, brand: basics.brand, manual: [] });
  const known = new Set(existing.map((e) => e.key));
  const fresh = seed.filter((s) => !known.has(kwKey(s.keyword))).slice(0, MAX_KEYWORDS - active);
  if (fresh.length) {
    await db
      .insert(seoRankKeywords)
      .values(fresh.map((s) => ({ tenantId, projectId, keyword: s.keyword, keywordKey: kwKey(s.keyword).slice(0, 150), origin: s.origin, language: keywordLanguage(s.keyword, facts.langs), impressions: s.impressions ?? null })))
      .onConflictDoNothing();
  }
  return { added: fresh.length, hasLocal: Boolean(facts.zona && facts.services.length) };
}

async function projectLocation(tenantId: string, zona: string | null): Promise<{ name: string; approx: boolean }> {
  const src = serpSource();
  const towns = zoneTowns(zona);
  if (!src?.locations || !towns.length) return { name: 'Spain', approx: true };
  const list = await src.locations(tenantId, 'es').catch(() => []);
  return pickLocation(towns, list);
}

/** Volumen mensual de las búsquedas activas que no lo tienen o lo tienen de hace más de 30 días (una llamada por idioma). */
async function refreshVolumes(tenantId: string, projectId: string, location: string): Promise<number> {
  const src = serpSource();
  if (!src?.volumes) return 0;
  const stale = await db
    .select({ id: seoRankKeywords.id, keyword: seoRankKeywords.keyword, language: seoRankKeywords.language })
    .from(seoRankKeywords)
    .where(and(eq(seoRankKeywords.projectId, projectId), eq(seoRankKeywords.status, 'activa'), sql`(${seoRankKeywords.volumeAt} IS NULL OR ${seoRankKeywords.volumeAt} < now() - interval '30 days')`));
  if (!stale.length) return 0;
  let cost = 0;
  for (const lang of [...new Set(stale.map((s) => s.language))]) {
    const group = stale.filter((s) => s.language === lang);
    // Volumen de Google Ads: 0,06-0,075 $ por llamada [NV]; se comprueba el tope antes.
    if (!(await canSpend(projectId, 0.08)).ok) break;
    const r = await src.volumes(tenantId, group.map((g) => g.keyword), location, lang);
    cost += r.costUsd;
    if (r.costUsd > 0) await recordDataSpend(tenantId, projectId, 'serp', 'posiciones: volumen de búsqueda', r.costUsd);
    for (const g of group) await db.update(seoRankKeywords).set({ volume: r.volumes.get(g.keyword.toLowerCase()) ?? 0, volumeAt: new Date(), updatedAt: new Date() }).where(eq(seoRankKeywords.id, g.id));
  }
  return cost > 0 ? stale.length : 0;
}

/** Consulta semanal: semilla, volumen, filas pendientes, tope y envío. */
export async function runPositions(tenantId: string, projectId: string, heartbeat: () => Promise<void> = async () => undefined): Promise<Outcome> {
  const src = serpSource();
  if (!src?.postTasks || !(await src.isConnected(tenantId).catch(() => false))) return { status: 'omitido', summary: 'DataForSEO no está conectado (Agentes → Integraciones).' };
  const basics = await projectBasics(tenantId, projectId);
  if (!basics?.domain) return { status: 'omitido', summary: 'El proyecto no tiene web en su alcance.' };
  // Filas que se quedaron «pendiente» sin llegar a enviarse (el proceso cayó a mitad) hace más de 1 h: se cierran, para
  // que no bloqueen el proyecto para siempre.
  await db
    .update(seoRankChecks)
    .set({ status: 'fallida', error: 'no se llegó a enviar' })
    .where(and(eq(seoRankChecks.projectId, projectId), eq(seoRankChecks.status, 'pendiente'), isNull(seoRankChecks.taskId), lt(seoRankChecks.createdAt, new Date(Date.now() - 3_600_000))));
  // Si hay una consulta en curso (enviada hace menos de 48 h), no se envía otra.
  const [open] = await db.select({ n: sql<number>`count(*)::int` }).from(seoRankChecks).where(and(eq(seoRankChecks.projectId, projectId), inArray(seoRankChecks.status, ['pendiente', 'enviada'])));
  if (Number(open?.n ?? 0) > 0) {
    await enqueueCollect(tenantId, projectId, 1);
    return { status: 'omitido', summary: 'Ya hay una consulta en curso: se recoge sola.' };
  }
  const seed = await syncSeed(tenantId, projectId);
  const facts = await confirmedFacts(projectId);
  const loc = await projectLocation(tenantId, facts.zona);
  await heartbeat();
  await refreshVolumes(tenantId, projectId, loc.name).catch((e) => console.error('[seo] posiciones: volumen:', e instanceof Error ? e.message : e));
  const kws = await db.select().from(seoRankKeywords).where(and(eq(seoRankKeywords.projectId, projectId), eq(seoRankKeywords.status, 'activa')));
  if (!kws.length) return { status: 'omitido', summary: 'Aún no hay búsquedas que seguir (hace falta Search Console con datos, o servicios y zona confirmados en el Expediente).' };
  const runId = randomUUID();
  await db
    .insert(seoRankChecks)
    .values(kws.map((k) => ({ tenantId, projectId, keywordId: k.id, runId, status: 'pendiente', locationName: loc.name, language: k.language, device: k.device })))
    .onConflictDoNothing();
  const budget = await canSpend(projectId, kws.length * COST_PER_TASK);
  if (!budget.ok) {
    await db.update(seoRankChecks).set({ status: 'fallida', error: 'tope de gasto del mes' }).where(and(eq(seoRankChecks.runId, runId), eq(seoRankChecks.status, 'pendiente')));
    return { status: 'aviso', summary: `No se consultó: este proyecto ya lleva ${budget.spent.toFixed(2)} $ de ${budget.budget} $ en datos este mes.` };
  }
  const posted = await postPending(tenantId, projectId, runId);
  await enqueueCollect(tenantId, projectId, 10);
  return { status: posted.errors ? 'aviso' : 'ok', summary: `${posted.sent} búsqueda(s) enviada(s) a Google${posted.errors ? `, ${posted.errors} con error` : ''}; se recogen en unos minutos. Ubicación: ${loc.name}${loc.approx ? ' (aproximada: confirma la zona en el Expediente)' : ''}.${seed.added ? ` ${seed.added} búsqueda(s) nueva(s).` : ''}${seed.hasLocal ? '' : ' Sin servicios y zona confirmados no hay búsquedas «servicio + población».'}` };
}

/** Envía las filas pendientes (sin task_id) de una ejecución y apunta el gasto al enviar. */
async function postPending(tenantId: string, projectId: string, runId: string): Promise<{ sent: number; errors: number }> {
  const src = serpSource()!;
  const rows = await db
    .select({ id: seoRankChecks.id, keyword: seoRankKeywords.keyword, location: seoRankChecks.locationName, language: seoRankChecks.language, device: seoRankChecks.device })
    .from(seoRankChecks)
    .innerJoin(seoRankKeywords, eq(seoRankKeywords.id, seoRankChecks.keywordId))
    .where(and(eq(seoRankChecks.runId, runId), eq(seoRankChecks.status, 'pendiente'), isNull(seoRankChecks.taskId)));
  if (!rows.length) return { sent: 0, errors: 0 };
  let res: Awaited<ReturnType<NonNullable<typeof src.postTasks>>>;
  try {
    res = await src.postTasks!(
      tenantId,
      rows.map((r) => ({ keyword: r.keyword, location: r.location ?? 'Spain', language: r.language ?? 'es', device: (r.device as 'mobile' | 'desktop') ?? 'mobile', depth: DEPTH, tag: `${tenantId.slice(0, 8)}:${projectId.slice(0, 8)}:${r.id}` }))
    );
  } catch (e) {
    // No se sabe si DataForSEO llegó a aceptar (y cobrar) el lote: se marca fallido y se apunta el coste estimado,
    // para que el tope no se quede corto. La próxima ejecución lo vuelve a intentar.
    await db.update(seoRankChecks).set({ status: 'fallida', error: `error al enviar: ${e instanceof Error ? e.message.slice(0, 200) : 'desconocido'}` }).where(and(eq(seoRankChecks.runId, runId), eq(seoRankChecks.status, 'pendiente')));
    await recordDataSpend(tenantId, projectId, 'serp', 'posiciones: envío sin confirmar (estimado)', rows.length * COST_PER_TASK);
    return { sent: 0, errors: rows.length };
  }
  let cost = 0;
  let errors = 0;
  for (const p of res) {
    const id = p.tag.split(':')[2];
    // Si el proveedor no dice el coste de una tarea aceptada, se apunta el estimado (mejor de más que de menos).
    const c = p.id ? (p.costUsd > 0 ? p.costUsd : COST_PER_TASK) : p.costUsd;
    cost += c;
    if (p.id) await db.update(seoRankChecks).set({ taskId: p.id, status: 'enviada', costUsd: c.toFixed(5), postedAt: new Date() }).where(eq(seoRankChecks.id, id));
    else {
      errors++;
      await db.update(seoRankChecks).set({ status: 'fallida', error: p.error ?? 'error', postedAt: new Date() }).where(eq(seoRankChecks.id, id));
    }
  }
  if (cost > 0) await recordDataSpend(tenantId, projectId, 'serp', 'posiciones: consulta semanal', cost);
  return { sent: res.length - errors, errors };
}

async function enqueueCollect(tenantId: string, projectId: string, minutes: number) {
  // Clave por franja de 10 min: el trabajo que se está ejecutando no impide encolar el siguiente.
  const slot = Math.floor((Date.now() + minutes * 60_000) / 600_000);
  await enqueueJob({ tenantId, kind: COLLECT, payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 6, runAt: new Date(Date.now() + minutes * 60_000), dedupeKey: `${COLLECT}:${projectId}:${slot}` });
}

/** Recoge lo enviado por su id; caduca lo que no llega en 48 h; si queda algo, se vuelve a mirar en 10 min. */
export async function collectPositions(tenantId: string, projectId: string): Promise<Record<string, unknown>> {
  const src = serpSource();
  if (!src?.getTask) return { skipped: 'sin proveedor' };
  const basics = await projectBasics(tenantId, projectId);
  const domain = basics?.domain ?? '';
  const tokens = brandTokens(basics?.names ?? []).map((t) => normText(t)).filter(Boolean);
  await db.update(seoRankChecks).set({ status: 'caducada', error: `sin respuesta en ${EXPIRE_H} h` }).where(and(eq(seoRankChecks.projectId, projectId), eq(seoRankChecks.status, 'enviada'), lt(seoRankChecks.postedAt, new Date(Date.now() - EXPIRE_H * 3_600_000))));
  const sent = await db.select({ id: seoRankChecks.id, taskId: seoRankChecks.taskId }).from(seoRankChecks).where(and(eq(seoRankChecks.projectId, projectId), eq(seoRankChecks.status, 'enviada')));
  let done = 0;
  let pending = 0;
  for (const c of sent) {
    if (!c.taskId) continue;
    const r = await src.getTask(tenantId, c.taskId).catch((e) => ({ status: 'pendiente' as const, e }));
    if (r.status === 'pendiente') {
      pending++;
      continue;
    }
    if (r.status === 'error') {
      await db.update(seoRankChecks).set({ status: 'fallida', error: r.error, checkedAt: new Date() }).where(eq(seoRankChecks.id, c.id));
      continue;
    }
    const row = readSerp(r, domain, tokens);
    await db
      .update(seoRankChecks)
      .set({ status: 'hecha', position: row.position, url: row.url, clientUrls: row.clientUrls, localPack: row.localPack, localRank: row.localRank, aio: row.aio, aioCites: row.aioCites, features: row.features, top10: row.top10, checkedAt: new Date() })
      .where(eq(seoRankChecks.id, c.id));
    done++;
  }
  if (pending) await enqueueCollect(tenantId, projectId, 10);
  else await evaluateFindings(tenantId, projectId);
  return { recogidas: done, pendientes: pending };
}

/** Hallazgos con margen (rankDropState / lostLocalPackState) para las búsquedas importantes. */
async function evaluateFindings(tenantId: string, projectId: string): Promise<void> {
  const kws = await db.select().from(seoRankKeywords).where(and(eq(seoRankKeywords.projectId, projectId), eq(seoRankKeywords.status, 'activa')));
  const openRows = await db.select({ dedupeKey: findings.dedupeKey }).from(findings).where(and(eq(findings.projectId, projectId), eq(findings.source, POSICIONES_SOURCE), eq(findings.status, 'abierto')));
  const open = new Set(openRows.map((r) => r.dedupeKey));
  const out: Parameters<typeof syncFindings>[3] = [];
  for (const k of kws.filter(isImportant)) {
    const hist = await db
      .select({ position: seoRankChecks.position, localPack: seoRankChecks.localPack, localRank: seoRankChecks.localRank, status: seoRankChecks.status, url: seoRankChecks.url })
      .from(seoRankChecks)
      .where(and(eq(seoRankChecks.keywordId, k.id), inArray(seoRankChecks.status, ['hecha', 'fallida', 'caducada'])))
      .orderBy(desc(seoRankChecks.createdAt))
      .limit(6);
    const h: HistoryPoint[] = hist.map((x) => ({ position: x.position, localPack: Boolean(x.localPack), localRank: x.localRank, ok: x.status === 'hecha' }));
    const dropKey = `seo.rank_drop:${k.id}`;
    if (rankDropState(h, open.has(dropKey))) out.push({ kind: 'seo.rank_drop', dedupeKey: dropKey, query: k.keyword, url: hist.find((x) => x.url)?.url ?? null, metric: 'posicion', value: h.find((x) => x.ok)?.position ?? null, evidence: { history: h.filter((x) => x.ok).map((x) => x.position) } });
    const packKey = `seo.lost_local_pack:${k.id}`;
    if (lostLocalPackState(h, open.has(packKey))) out.push({ kind: 'seo.lost_local_pack', dedupeKey: packKey, query: k.keyword, evidence: { history: h.filter((x) => x.ok).map((x) => x.localRank) } });
  }
  // Páginas de zona: null = no se pudo decidir (error o sin rastreo) → sus avisos abiertos se quedan como están.
  const zone = await zoneFindings(tenantId, projectId, kws).catch((e) => {
    console.error('[seo] posiciones: páginas de zona:', e instanceof Error ? e.message : e);
    return null;
  });
  if (zone) out.push(...zone);
  await syncFindings(tenantId, projectId, POSICIONES_SOURCE, out, zone ? ['seo.rank_drop', 'seo.lost_local_pack', 'seo.zone_page_missing'] : ['seo.rank_drop', 'seo.lost_local_pack']);
}

/**
 * Páginas de zona con demanda (parte 5c): búsquedas «servicio + población» con volumen o impresiones, fuera del top 10,
 * cuya población (validada en la lista de ubicaciones) no tiene página propia. Solo si el negocio va a domicilio.
 */
async function zoneFindings(tenantId: string, projectId: string, kws: (typeof seoRankKeywords.$inferSelect)[]): Promise<Parameters<typeof syncFindings>[3] | null> {
  const facts = await db.select({ field: seoDossierFacts.field, value: seoDossierFacts.value, status: seoDossierFacts.status }).from(seoDossierFacts).where(eq(seoDossierFacts.projectId, projectId));
  const atencion = facts.find((f) => f.field === 'atencion' && f.status === 'confirmado')?.value;
  if (atencion !== 'domicilio' && atencion !== 'ambos') return [];
  const { zona } = await confirmedFacts(projectId);
  let towns = zoneTowns(zona);
  const src = serpSource();
  if (src?.locations && towns.length) {
    const list = await src.locations(tenantId, 'es').catch(() => []);
    const cities = new Set(list.filter((l) => /city|municipality/i.test(l.type)).map((l) => normText(l.name.split(',')[0])));
    if (cities.size) towns = towns.filter((t) => cities.has(normText(t)));
  }
  if (!towns.length) return [];
  const sz = kws.filter((k) => k.origin === 'servicio_zona');
  if (!sz.length) return [];
  const latest = await db
    .select({ keywordId: seoRankChecks.keywordId, position: seoRankChecks.position, createdAt: seoRankChecks.createdAt })
    .from(seoRankChecks)
    .where(and(eq(seoRankChecks.projectId, projectId), eq(seoRankChecks.status, 'hecha'), inArray(seoRankChecks.keywordId, sz.map((k) => k.id))))
    .orderBy(desc(seoRankChecks.createdAt));
  const posOf = new Map<string, number | null>();
  for (const l of latest) if (!posOf.has(l.keywordId)) posOf.set(l.keywordId, l.position);
  const [run] = await db.select({ id: crawlRuns.id }).from(crawlRuns).where(and(eq(crawlRuns.projectId, projectId), eq(crawlRuns.target, 'propio'), eq(crawlRuns.status, 'hecho'))).orderBy(desc(crawlRuns.createdAt)).limit(1);
  if (!run) return null;
  const pages = (await db.select({ url: crawlPages.url, title: crawlPages.title, h1: crawlPages.h1, statusCode: crawlPages.statusCode, robotsMeta: crawlPages.robotsMeta }).from(crawlPages).where(eq(crawlPages.runId, run.id))).filter((p) => p.statusCode === 200 && !/noindex/i.test(p.robotsMeta ?? ''));
  const missing = missingZonePages(sz.filter((k) => posOf.has(k.id)).map((k) => ({ keyword: k.keyword, volume: k.volume, impressions: k.impressions, position: posOf.get(k.id) ?? null })), towns, pages.map((p) => ({ url: p.url, title: p.title, h1: p.h1 ?? [] })));
  return missing.map((m) => ({ kind: 'seo.zone_page_missing', dedupeKey: `seo.zone_page_missing:${normText(m.town)}`, query: m.keyword, evidence: { town: m.town, keyword: m.keyword } }));
}

let registered = false;
export function registerPosicionesJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: COLLECT, timeoutS: 240, maxConcurrent: 2, maxAttempts: 2, run: async (ctx, payload) => collectPositions(ctx.tenantId, String(payload.projectId ?? '')) });
}
