import 'server-only';

// SEO · Briefs de contenido (parte 9a, 27 nov 2026; docs/DISENO-SEO-CONTENIDO.md con la auditoría Opus). Un brief se pide
// a mano (tema o idea) y se prepara en la cola («seo.brief.build»): SERP real (la guardada o una en directo con el tope),
// como mucho 5 webs de la competencia legibles (respetando su robots.txt), su contenido principal (sin menú ni pie),
// subtemas, preguntas, palabras recomendadas, datos del cliente, enlazado interno sugerido y la nota de la página de
// destino. Sin IA. Al marcarlo «usado» con la URL publicada se registra la intervención (la parte 8 la mide).
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { crawlPages, crawlRuns, projects, seoBriefs, seoDemand, seoDossierFacts, seoTopicQueries, seoTopics } from '@/lib/db/schema';
import { serpSource, workSource } from '@/lib/core/capabilities';
import { briefToText, type BriefData } from '@/lib/seo/contenido/brief-text';
import { extractMain, extractPage, sameSite, sha1 } from '@/lib/core/crawl-extract';
import { fetchPublic } from '@/lib/core/net';
import { isAllowed, parseRobots } from '@/lib/core/robots';
import { enqueueJob, registerJobKind, type JobContext } from '@/lib/core/jobs';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { markInterventionDone, recordIntervention } from '@/lib/core/interventions';
import { host } from '@/lib/seo/expediente/rules';
import { canSpend, recordDataSpend } from '@/lib/seo/gasto';
import { projectWebUrl } from '@/lib/seo/salud/audit';
import { projectLocation } from '@/lib/seo/posiciones/posiciones';
import { zoneTowns } from '@/lib/seo/posiciones/rules';
import { isNoise, keywordKey } from '@/lib/seo/demanda/rules';
import { linkSuggestions, questions, recommendedWords, scorePage, subtopics, type CompetitorPage } from '@/lib/seo/contenido/rules';

const UA = 'Mozilla/5.0 (compatible; KijutechBot/1.0; +https://kijutech.com)';
const SERP_COST = 0.002;

export class BriefError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

/** Lee como mucho «max» bytes del cuerpo (en streaming: una web hostil no llena la memoria). */
async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.byteLength;
    if (n >= max) {
      void reader.cancel().catch(() => undefined);
      break;
    }
  }
  return Buffer.concat(chunks).subarray(0, max);
}

async function readHtml(url: string, ms = 15_000): Promise<string | null> {
  try {
    const r = await fetchPublic(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(ms) });
    if ('error' in r) return null;
    if (!r.res.ok || !/html/i.test(r.res.headers.get('content-type') ?? '')) {
      void r.res.body?.cancel().catch(() => undefined);
      return null;
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(await readCapped(r.res, 600_000));
  } catch {
    return null;
  }
}

/** Solo http(s) en el puerto normal y de la web del proyecto. */
function ownPage(u: string, home: string | null): boolean {
  try {
    const x = new URL(u);
    return Boolean(home) && /^https?:$/.test(x.protocol) && (x.port === '' || x.port === '80' || x.port === '443') && sameSite(u, home!);
  } catch {
    return false;
  }
}

async function robotsAllows(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    const r = await fetchPublic(`${u.origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5_000) });
    if ('error' in r || !r.res.ok) return true;
    const txt = new TextDecoder().decode(await readCapped(r.res, 200_000));
    return isAllowed(parseRobots(txt, 'KijutechBot'), u.pathname + u.search);
  } catch {
    return true;
  }
}

export async function requestBrief(tenantId: string, projectId: string, input: { keyword: string; topicKey?: string | null; targetUrl?: string | null }, by: string): Promise<string> {
  const keyword = input.keyword.trim().slice(0, 200);
  if (keyword.length < 3) throw new BriefError('Escribe la búsqueda principal del brief.');
  let target: string | null = null;
  if (input.targetUrl) {
    const home = await projectWebUrl(tenantId, projectId);
    if (!ownPage(input.targetUrl, home)) throw new BriefError('La página de destino tiene que ser de la web del proyecto.');
    target = input.targetUrl.slice(0, 2000);
  }
  const [b] = await db.insert(seoBriefs).values({ tenantId, projectId, keyword, topicKey: input.topicKey?.slice(0, 80) ?? null, targetUrl: target, createdBy: by.slice(0, 120) }).returning({ id: seoBriefs.id });
  await enqueueJob({ tenantId, kind: 'seo.brief.build', payload: { briefId: b.id, projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 4, dedupeKey: `seo.brief:${b.id}` });
  return b.id;
}

export async function buildBrief(ctx: Pick<JobContext, 'heartbeat'>, tenantId: string, briefId: string): Promise<Record<string, unknown>> {
  const [b] = await db.select().from(seoBriefs).where(and(eq(seoBriefs.id, briefId), eq(seoBriefs.tenantId, tenantId))).limit(1);
  if (!b) return { skipped: 'brief borrado' };
  const projectId = b.projectId;
  const fail = async (msg: string) => {
    await db.update(seoBriefs).set({ status: 'fallido', error: msg, updatedAt: new Date() }).where(eq(seoBriefs.id, b.id));
    return { error: msg };
  };
  const home = await projectWebUrl(tenantId, projectId);
  const clientHost = (host(home) ?? '').replace(/^www\./, '');
  // 1. Top 10: el guardado (demanda) o una SERP en directo con el tope de gasto.
  const [d] = await db.select({ top10: seoDemand.top10Urls, intent: seoDemand.intent, pageType: seoDemand.pageType, volume: seoDemand.volume }).from(seoDemand).where(and(eq(seoDemand.projectId, projectId), eq(seoDemand.keywordKey, keywordKey(b.keyword)))).limit(1);
  let top10 = d?.top10 ?? [];
  if (!top10.length) {
    const src = serpSource();
    if (!src || !(await src.isConnected(tenantId).catch(() => false))) return fail('DataForSEO no está conectado y no hay resultados guardados de esta búsqueda.');
    if (!(await canSpend(projectId, SERP_COST)).ok) return fail('Se ha llegado al tope de gasto de datos de este mes.');
    const [z] = await db.select({ value: seoDossierFacts.value }).from(seoDossierFacts).where(and(eq(seoDossierFacts.projectId, projectId), eq(seoDossierFacts.field, 'zona'), eq(seoDossierFacts.status, 'confirmado'))).limit(1);
    const loc = await projectLocation(tenantId, typeof z?.value === 'string' ? z.value : null);
    const r = await src.search(tenantId, { keyword: b.keyword, location: loc.name, language: 'es', depth: 10 });
    await recordDataSpend(tenantId, projectId, 'serp', 'contenido: brief', r.costUsd ?? SERP_COST);
    top10 = r.organic.filter((o) => o.rank <= 10).sort((a, x) => a.rank - x.rank).map((o) => o.url);
  }
  // 2. Como mucho 5 webs legibles de la competencia (sin directorios, redes ni la web del cliente; respetando robots.txt).
  const cands = top10.filter((u) => !isNoise(u) && !(host(u) ?? '').replace(/^www\./, '').endsWith(clientHost || '@@'));
  const comp: CompetitorPage[] = [];
  for (const u of cands) {
    if (comp.length >= 5) break;
    if (!(await robotsAllows(u))) continue;
    const html = await readHtml(u);
    await ctx.heartbeat();
    if (!html) continue;
    let m: ReturnType<typeof extractMain>;
    try {
      m = extractMain(html);
    } catch {
      continue; // una web rara no tumba el brief
    }
    if (m.words < 100) continue; // pintada con JavaScript o vacía
    comp.push({ url: u, h2: m.h2, h3: m.h3, words: m.words });
  }
  const subs = subtopics(comp, b.keyword);
  const qs = questions(comp);
  const words = recommendedWords(comp);
  // 3. Datos del cliente (confirmados) y búsquedas del tema.
  const facts = await db.select({ field: seoDossierFacts.field, value: seoDossierFacts.value }).from(seoDossierFacts).where(and(eq(seoDossierFacts.projectId, projectId), eq(seoDossierFacts.status, 'confirmado'), inArray(seoDossierFacts.field, ['servicios', 'zona', 'negocio', 'publico', 'atencion'])));
  const fact = (f: string) => facts.find((x) => x.field === f)?.value ?? null;
  let related: string[] = [];
  let topicUrl: string | null = null;
  if (b.topicKey) {
    const [t] = await db.select({ id: seoTopics.id, url: seoTopics.url }).from(seoTopics).where(and(eq(seoTopics.projectId, projectId), eq(seoTopics.topicKey, b.topicKey))).limit(1);
    if (t) {
      topicUrl = t.url;
      related = (await db.select({ q: seoTopicQueries.query }).from(seoTopicQueries).where(eq(seoTopicQueries.topicId, t.id)).orderBy(desc(seoTopicQueries.impressions)).limit(12)).map((r) => r.q).filter((q) => q !== b.keyword);
    }
  }
  const target = b.targetUrl ?? topicUrl;
  // 4. Enlazado interno sugerido (último rastreo propio).
  let links: { from: string; anchor: string }[] = [];
  const [run] = await db.select({ id: crawlRuns.id }).from(crawlRuns).where(and(eq(crawlRuns.projectId, projectId), eq(crawlRuns.target, 'propio'), eq(crawlRuns.status, 'hecho'))).orderBy(desc(crawlRuns.createdAt)).limit(1);
  if (run && target) {
    const pages = await db.select({ url: crawlPages.url, urlHash: crawlPages.urlHash, title: crawlPages.title, h1: crawlPages.h1, headings: crawlPages.headings, statusCode: crawlPages.statusCode, robotsMeta: crawlPages.robotsMeta, canonical: crawlPages.canonical }).from(crawlPages).where(eq(crawlPages.runId, run.id));
    const targetHashes = [...new Set([target, target.replace(/\/+$/, ''), `${target.replace(/\/+$/, '')}/`].map(sha1))];
    const fromRows = (await db.execute(sql`SELECT DISTINCT from_hash FROM crawl_links WHERE run_id = ${run.id} AND to_hash IN (${sql.join(targetHashes.map((h) => sql`${h}`), sql`, `)})`)) as unknown as { from_hash: string }[];
    const fromSet = new Set([...fromRows].map((r) => r.from_hash));
    const linkers = new Set(pages.filter((p) => fromSet.has(p.urlHash)).map((p) => p.url));
    const okPages = pages.filter((p) => p.statusCode === 200 && !/noindex/i.test(p.robotsMeta ?? '') && (!p.canonical || p.canonical.replace(/\/+$/, '') === p.url.replace(/\/+$/, '')));
    const template = okPages.length > 0 && linkers.size / okPages.length > 0.5;
    const zona = fact('zona');
    const clicks = new Map<string, number>();
    const props = await gscPropertiesForProject(tenantId, projectId).catch(() => []);
    const prop = props.filter((p) => p.status === 'activa' && p.lastDate).sort((a, x) => Number(x.kind === 'dominio') - Number(a.kind === 'dominio'))[0];
    if (prop) {
      const rows = (await db.execute(sql`SELECT p.url, sum(d.clicks)::int AS c FROM gsc_daily d JOIN gsc_pages p ON p.id = d.page_id WHERE d.property_id = ${prop.id} AND d.search_type = 1 AND d.date >= current_date - 90 GROUP BY p.url`)) as unknown as { url: string; c: number }[];
      for (const r of rows) clicks.set(r.url, Number(r.c));
    }
    links = linkSuggestions(
      target,
      b.keyword,
      zoneTowns(typeof zona === 'string' ? zona : null),
      okPages.map((p) => ({ url: p.url, title: p.title, h1: p.h1?.[0] ?? null, headings: ((p.headings as { h2?: string[] } | null)?.h2 ?? []).slice(0, 20), ok: true })),
      linkers,
      template,
      clicks,
      [b.keyword, ...related].slice(0, 5)
    );
  }
  // 5. Nota de la página de destino (si mejora una existente).
  let score: ReturnType<typeof scorePage> | null = null;
  if (target) {
    const html = await readHtml(target);
    if (html) {
      try {
        const m = extractMain(html);
        const pg = extractPage(html, target);
        score = scorePage({ title: pg.title, h1: pg.h1[0] ?? null, text: m.text, words: m.words }, { query: b.keyword, subtopics: subs, words });
      } catch {
        score = null;
      }
    }
  }
  const data = {
    query: b.keyword,
    related,
    intent: d?.intent ?? null,
    pageType: d?.pageType ?? null,
    volume: d?.volume ?? null,
    words,
    subtopics: subs,
    questions: qs,
    references: comp.map((c) => ({ url: c.url, words: c.words })),
    readable: comp.length,
    client: { servicios: fact('servicios'), zona: fact('zona'), negocio: fact('negocio'), publico: fact('publico'), atencion: fact('atencion') },
    target,
    links,
    score,
    builtAt: new Date().toISOString()
  };
  await db.update(seoBriefs).set({ status: 'borrador', data, targetUrl: target, error: comp.length < 2 ? 'Menos de 2 webs de la competencia legibles: los subtemas son orientativos.' : null, updatedAt: new Date() }).where(eq(seoBriefs.id, b.id));
  return { readable: comp.length, subtopics: subs.length, links: links.length };
}

export async function setBriefStatus(tenantId: string, projectId: string, id: string, status: 'borrador' | 'listo' | 'archivado'): Promise<boolean> {
  const r = await db.update(seoBriefs).set({ status, updatedAt: new Date() }).where(and(eq(seoBriefs.id, id), eq(seoBriefs.projectId, projectId), eq(seoBriefs.tenantId, tenantId), inArray(seoBriefs.status, ['borrador', 'listo', 'archivado', 'fallido']))).returning({ id: seoBriefs.id });
  return r.length > 0;
}

/** Publicado: se registra la intervención (hecha hoy) para que la parte 8 mida si funcionó. */
export async function markBriefUsed(tenantId: string, projectId: string, id: string, publishedUrl: string, by: string): Promise<boolean> {
  const [b] = await db.select().from(seoBriefs).where(and(eq(seoBriefs.id, id), eq(seoBriefs.projectId, projectId), eq(seoBriefs.tenantId, tenantId))).limit(1);
  if (!b || !['borrador', 'listo'].includes(b.status)) throw new BriefError('Brief no encontrado o aún preparándose.');
  const home = await projectWebUrl(tenantId, projectId);
  if (!ownPage(publishedUrl, home)) throw new BriefError('La URL publicada tiene que ser de la web del proyecto.');
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (p?.clientId) {
    const data = (b.data ?? {}) as { related?: string[] };
    const technique = b.targetUrl ? 'contenido_ampliado' : 'pagina_demanda';
    await recordIntervention({ tenantId, clientId: p.clientId, projectId, domain: 'seo', technique, urls: [publishedUrl], queries: [b.keyword, ...(data.related ?? [])].slice(0, 20), source: 'seo.brief', sourceRef: b.id, createdBy: by });
    await markInterventionDone(tenantId, 'seo.brief', b.id, new Date());
  }
  await db.update(seoBriefs).set({ status: 'usado', publishedUrl: publishedUrl.slice(0, 2000), updatedAt: new Date() }).where(eq(seoBriefs.id, b.id));
  return Boolean(p?.clientId);
}

/** Volver a preparar un brief fallido. */
export async function retryBrief(tenantId: string, projectId: string, id: string): Promise<boolean> {
  const r = await db.update(seoBriefs).set({ status: 'preparando', error: null, updatedAt: new Date() }).where(and(eq(seoBriefs.id, id), eq(seoBriefs.projectId, projectId), eq(seoBriefs.tenantId, tenantId), eq(seoBriefs.status, 'fallido'))).returning({ id: seoBriefs.id });
  if (!r.length) return false;
  await enqueueJob({ tenantId, kind: 'seo.brief.build', payload: { briefId: id, projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 4, dedupeKey: `seo.brief:${id}:${Date.now()}` });
  return true;
}

/**
 * Encargar el brief (simulación del 27 nov, atasco 5): crea el encargo en la fuente de trabajo (Operaciones → ClickUp) con
 * el brief dentro, y registra la intervención con ese encargo: el núcleo pone la fecha de «hecho» cuando se termine y la
 * parte 8 mide si funcionó. Lista, responsable y fecha los elige Operaciones con la ficha del cliente.
 */
export async function briefToTask(tenantId: string, projectId: string, id: string, by: string): Promise<{ ok: boolean; message: string; url: string | null }> {
  const [b] = await db.select().from(seoBriefs).where(and(eq(seoBriefs.id, id), eq(seoBriefs.projectId, projectId), eq(seoBriefs.tenantId, tenantId))).limit(1);
  if (!b || !['borrador', 'listo'].includes(b.status)) throw new BriefError('Brief no encontrado o aún preparándose.');
  const data = (b.data ?? {}) as BriefData & { request?: { ref: string | null; url: string | null } };
  if (data.request?.ref) return { ok: true, message: 'Ya estaba encargado.', url: data.request.url };
  const [p] = await db.select({ name: projects.name, clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p?.clientId) throw new BriefError('El proyecto no tiene cliente: elige el cliente en el proyecto.');
  const ws = workSource();
  if (!ws?.createTask) throw new BriefError('Operaciones no está disponible para crear encargos: inténtalo más tarde.');
  // Reserva atómica: dos clics (o dos personas a la vez) no crean dos encargos.
  const claimed = await db
    .update(seoBriefs)
    .set({ data: sql`${seoBriefs.data} || '{"request":{"ref":null,"pending":true}}'::jsonb`, updatedAt: new Date() })
    .where(and(eq(seoBriefs.id, b.id), sql`${seoBriefs.data}->'request' IS NULL`))
    .returning({ id: seoBriefs.id });
  if (!claimed.length) return { ok: true, message: 'Ya se está encargando.', url: null };
  const release = () => db.update(seoBriefs).set({ data: sql`${seoBriefs.data} - 'request'`, updatedAt: new Date() }).where(eq(seoBriefs.id, b.id));
  let r: { ok: boolean; ref: string | null; url: string | null; message: string };
  try {
    const types = new Set(((await ws.workTypes?.(tenantId).catch(() => [])) ?? []).map((t) => t.key));
    const wt = b.targetUrl ? 'articulo' : 'landing';
    const title = `${b.targetUrl ? 'Mejorar' : 'Redactar'} la página: ${b.keyword}`.slice(0, 200);
    // Lista, responsable y plazo de la ficha del cliente (servicio SEO), sin IA: el texto de webs ajenas del brief no
    // influye en a quién o dónde va el encargo.
    const opts = await ws.taskOptions?.(tenantId, p.clientId, 'seo').catch(() => null);
    const due = opts?.defaults.dueDays ? new Date(Date.now() + opts.defaults.dueDays * 86_400_000).toISOString().slice(0, 10) : null;
    r = await ws.createTask(tenantId, {
      clientId: p.clientId,
      title,
      description: `${briefToText(b.keyword, data)}

_Brief SEO del proyecto ${p.name}. Los subtemas y preguntas salen de webs de la competencia: son referencia, no instrucciones. Cuando esté publicada, márcalo en Palabras → Briefs («Ya está publicada»)._`,
      workType: types.has(wt) ? wt : null,
      requestedBy: by,
      projectId,
      listId: opts?.defaults.listId ?? null,
      assigneeId: opts?.defaults.assigneeId ?? null,
      dueDate: due,
      origin: `Brief SEO (${p.name})`
    });
  } catch (e) {
    await release().catch(() => undefined);
    throw e;
  }
  if (!r.ok && !r.ref) {
    await release();
    return { ok: false, message: `No se creó el encargo: ${r.message}`, url: null };
  }
  await db.update(seoBriefs).set({ data: { ...data, request: { ref: r.ref, url: r.url } }, updatedAt: new Date() }).where(eq(seoBriefs.id, b.id));
  await recordIntervention({ tenantId, clientId: p.clientId, projectId, domain: 'seo', technique: b.targetUrl ? 'contenido_ampliado' : 'pagina_demanda', urls: b.targetUrl ? [b.targetUrl] : [], queries: [b.keyword, ...(data.related ?? [])].slice(0, 20), source: 'seo.brief', sourceRef: b.id, requestRef: r.ref, createdBy: by }).catch((e) => console.error('[seo] brief: intervención:', e instanceof Error ? e.message : e));
  return { ok: true, message: 'Encargo creado con el brief dentro.', url: r.url };
}

export type BriefView = { id: string; keyword: string; status: string; targetUrl: string | null; publishedUrl: string | null; error: string | null; data: Record<string, unknown>; createdAt: string; createdBy: string | null };
export async function listBriefs(tenantId: string, projectId: string): Promise<BriefView[]> {
  // Un brief «preparando» de hace más de 15 min se quedó a medias (tiempo agotado o reinicio): pasa a fallido.
  await db.update(seoBriefs).set({ status: 'fallido', error: 'Se cortó a medias: vuelve a intentarlo.', updatedAt: new Date() }).where(and(eq(seoBriefs.projectId, projectId), eq(seoBriefs.status, 'preparando'), sql`${seoBriefs.updatedAt} < now() - interval '15 minutes'`));
  const rows = await db.select().from(seoBriefs).where(and(eq(seoBriefs.tenantId, tenantId), eq(seoBriefs.projectId, projectId))).orderBy(desc(seoBriefs.createdAt)).limit(100);
  return rows.map((r) => ({ id: r.id, keyword: r.keyword, status: r.status, targetUrl: r.targetUrl, publishedUrl: r.publishedUrl, error: r.error, data: r.data ?? {}, createdAt: r.createdAt.toISOString(), createdBy: r.createdBy }));
}

let registered = false;
export function registerBriefJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({
    kind: 'seo.brief.build',
    timeoutS: 300,
    maxConcurrent: 2,
    maxAttempts: 1,
    run: async (ctx, payload) => {
      try {
        return await buildBrief(ctx, ctx.tenantId, String(payload.briefId ?? ''));
      } catch (e) {
        await db.update(seoBriefs).set({ status: 'fallido', error: 'No se pudo preparar el brief.', updatedAt: new Date() }).where(eq(seoBriefs.id, String(payload.briefId ?? '')));
        throw e;
      }
    }
  });
}
