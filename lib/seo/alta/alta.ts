import 'server-only';

// SEO · Alta de la cartera (parte 2, 26 nov 2026; docs/DISENO-SEO-ALTA-CARTERA.md).
// - Trabajo «seo.alta.proponer»: Haiku propone a qué se dedica el cliente, sus servicios, su zona y su público desde su
//   web rastreada, su JSON-LD y sus búsquedas de Search Console. El código valida cada servicio y la zona con una cita que
//   tiene que estar en los datos (validateProposal) y lo guarda en el expediente con origen «ia», provisional (confianza
//   40): no se usa en el mapa ni en las preguntas al cliente hasta que una persona lo confirma.
// - Se encola al final de cada recogida del expediente, solo si aún no hay propuesta o si el rastreo es otro.
// - Puesta en marcha: qué le falta al proyecto (readiness) para el informe, las posiciones, el local y la medición.
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, clientContactSubscriptions, clientContacts, crawlPages, crawlRuns, jobs, projects, seoDossierFacts, seoTopics, clients, clientAssets, seoLocalPlaces } from '@/lib/db/schema';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { projectWebUrl } from '@/lib/seo/salud/audit';
import { brandTokens, isBrandQuery } from '@/lib/seo/expediente/rules';
import { candidatePages, promptBlocks, readiness, validateProposal, webLanguages, type AltaInput, type AltaPage } from '@/lib/seo/alta/rules';

export const PROPOSE_PROMPT = 'seo_proponer_ficha';
const PROPOSE_MODEL = 'claude-haiku-5-5';
const JOB = 'seo.alta.proponer';
const IA_CONFIDENCE = 40;

async function lastDoneCrawl(projectId: string) {
  const [r] = await db
    .select({ id: crawlRuns.id, rootUrl: crawlRuns.rootUrl })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.projectId, projectId), eq(crawlRuns.target, 'propio'), eq(crawlRuns.status, 'hecho')))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(1);
  return r ?? null;
}

/** Lo que se le enseña a la IA, sacado del último rastreo y de Search Console. */
async function buildInput(tenantId: string, projectId: string, runId: string, names: string[]): Promise<AltaInput> {
  const rows = await db
    .select({ url: crawlPages.url, urlHash: crawlPages.urlHash, title: crawlPages.title, h1: crawlPages.h1, headings: crawlPages.headings, statusCode: crawlPages.statusCode, contentType: crawlPages.contentType, jsonld: crawlPages.jsonld })
    .from(crawlPages)
    .where(eq(crawlPages.runId, runId));
  const ok = rows.filter((r) => r.statusCode && r.statusCode >= 200 && r.statusCode < 300 && /html/i.test(r.contentType ?? ''));
  const anchorRows = (await db.execute(sql`
    SELECT to_hash, anchor, count(*)::int AS n FROM crawl_links
    WHERE run_id = ${runId} AND from_hash <> to_hash AND anchor IS NOT NULL AND length(anchor) >= 3
    GROUP BY to_hash, anchor ORDER BY 3 DESC`)) as unknown as { to_hash: string; anchor: string; n: number }[];
  const anchors = new Map<string, { a: string[]; n: number }>();
  for (const r of anchorRows) {
    const e = anchors.get(r.to_hash) ?? { a: [], n: 0 };
    if (e.a.length < 3) e.a.push(r.anchor);
    e.n += Number(r.n);
    anchors.set(r.to_hash, e);
  }
  const pages: AltaPage[] = ok.map((r) => ({
    url: r.url,
    title: r.title,
    h1: r.h1 ?? [],
    h2: ((r.headings as { h2?: string[] } | null)?.h2 ?? []).slice(0, 6),
    anchors: anchors.get(r.urlHash)?.a ?? [],
    inlinks: anchors.get(r.urlHash)?.n ?? 0
  }));
  // JSON-LD: el de la portada o el primero que haya (dirección, área de servicio, catálogo de servicios).
  const home = ok.find((r) => r.jsonld) ?? null;
  const jsonldText = home?.jsonld ? JSON.stringify(home.jsonld).slice(0, 3000) : '';
  const nodes: Record<string, unknown>[] = [];
  const visit = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(visit);
    else if (x && typeof x === 'object') {
      nodes.push(x as Record<string, unknown>);
      const g = (x as Record<string, unknown>)['@graph'];
      if (g) visit(g);
    }
  };
  visit(home?.jsonld ?? null);
  const addr = nodes.map((n) => n.address).find((a) => a && typeof a === 'object') as Record<string, unknown> | undefined;
  const address = addr ? [addr.streetAddress, addr.postalCode, addr.addressLocality, addr.addressRegion].filter((x) => typeof x === 'string').join(', ') || null : null;
  const areaServed = nodes
    .flatMap((n) => (Array.isArray(n.areaServed) ? n.areaServed : n.areaServed ? [n.areaServed] : []))
    .map((a) => (typeof a === 'string' ? a : a && typeof a === 'object' ? String((a as Record<string, unknown>).name ?? '') : ''))
    .filter(Boolean)
    .slice(0, 20);
  // Búsquedas sin marca con más impresiones (90 días).
  const props = await gscPropertiesForProject(tenantId, projectId);
  let gscQueries: string[] = [];
  if (props.length) {
    const ids = sql.join(props.map((p) => sql`${p.id}`), sql`, `);
    const q = (await db.execute(sql`
      SELECT q.query, sum(d.impressions)::int AS impressions
      FROM gsc_daily d JOIN gsc_queries q ON q.id = d.query_id
      WHERE d.property_id IN (${ids}) AND d.search_type = 1 AND d.date >= current_date - 90
      GROUP BY q.query ORDER BY 2 DESC LIMIT 300`)) as unknown as { query: string }[];
    const tokens = brandTokens(names);
    gscQueries = [...q].map((r) => r.query).filter((x) => !isBrandQuery(x, tokens)).slice(0, 50);
  }
  return { pages: candidatePages(pages), jsonldText, address, areaServed, gscQueries };
}

async function upsertIaFact(tenantId: string, projectId: string, field: string, value: unknown, evidence: unknown) {
  const v = JSON.stringify(value);
  const ref = JSON.stringify(evidence).slice(0, 4000);
  await db
    .insert(seoDossierFacts)
    .values({ tenantId, projectId, field, value: value as object, source: 'ia', sourceRef: ref, confidence: IA_CONFIDENCE, status: 'provisional' })
    .onConflictDoUpdate({
      target: [seoDossierFacts.projectId, seoDossierFacts.field, seoDossierFacts.source],
      set: {
        value: sql`${v}::jsonb`,
        sourceRef: ref,
        // Si la propuesta no cambia, se respeta lo decidido; lo descartado sigue descartado aunque cambie.
        status: sql`CASE WHEN ${seoDossierFacts.value} = ${v}::jsonb OR ${seoDossierFacts.status} = 'descartado' THEN ${seoDossierFacts.status} ELSE 'provisional' END`,
        updatedAt: new Date()
      }
    });
}

/** La propuesta de la IA para un proyecto (una llamada a Haiku). */
export async function proposeFicha(tenantId: string, projectId: string, force = false): Promise<Record<string, unknown>> {
  const [p] = await db
    .select({ id: projects.id, name: projects.name, clientName: clients.name, aliases: clients.aliases })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  if (!p) return { skipped: 'sin proyecto' };
  const run = await lastDoneCrawl(projectId);
  if (!run) return { skipped: 'sin rastreo terminado' };
  // Solo una vez por rastreo, aunque la propuesta saliera vacía: el resultado del trabajo guarda el rastreo usado
  // (si no, una web de la que no se puede proponer nada volvería a llamar a la IA en cada recogida).
  if (!force) {
    const [done] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.tenantId, tenantId), eq(jobs.kind, JOB), eq(jobs.scopeId, projectId), eq(jobs.status, 'hecho'), sql`${jobs.result}->>'run' = ${run.id}`));
    if (Number(done?.n ?? 0) > 0) return { skipped: 'ya propuesto con este rastreo', run: run.id };
  }
  const prompt = await getPrompt(PROPOSE_PROMPT);
  if (!prompt) return { skipped: 'sin prompt' };
  const input = await buildInput(tenantId, projectId, run.id, [p.clientName ?? p.name, ...((p.aliases as string[] | null) ?? [])]);
  if (!input.pages.length) return { skipped: 'el rastreo no tiene páginas válidas' };
  const b = promptBlocks(input);
  const vals: Record<string, string> = { cliente: p.clientName ?? p.name, web: run.rootUrl, paginas: b.paginas, jsonld: b.jsonld, direccion: b.direccion, busquedas: b.busquedas };
  // Una sola pasada: el texto de la web no puede colarse en otro hueco de la plantilla.
  const fill = (t: string) => t.replace(/\{(cliente|web|paginas|jsonld|direccion|busquedas)\}/g, (_m, k: string) => vals[k] ?? '');
  const res = await callAI({
    tenantId,
    projectId,
    function: 'seo_proponer_ficha',
    promptKey: PROPOSE_PROMPT,
    model: PROPOSE_MODEL,
    preferredProvider: 'anthropic',
    maxTokens: 4000, // Haiku 5.5 piensa y el pensamiento cuenta aquí
    messages: [
      { role: 'system', content: prompt.system_prompt },
      { role: 'user', content: fill(prompt.user_prompt_template) }
    ]
  });
  const prop = validateProposal(extractJsonFromLLMResponse(res.content), input);
  const ev = (extra: unknown) => ({ run: run.id, ...((extra ?? {}) as object) });
  if (prop.servicios.length) await upsertIaFact(tenantId, projectId, 'servicios', prop.servicios.map((s) => s.nombre), ev({ items: prop.servicios.map((s) => ({ n: s.nombre, u: s.url, c: s.cita })) }));
  if (prop.zona) await upsertIaFact(tenantId, projectId, 'zona', prop.zona.texto, ev({ c: prop.zona.cita }));
  if (prop.negocio) await upsertIaFact(tenantId, projectId, 'negocio', prop.negocio, ev({ sinCita: true }));
  if (prop.publico) await upsertIaFact(tenantId, projectId, 'publico', prop.publico, ev({ sinCita: true }));
  return { run: run.id, servicios: prop.servicios.length, zona: Boolean(prop.zona), negocio: Boolean(prop.negocio), publico: Boolean(prop.publico), paginas: input.pages.length, busquedas: input.gscQueries.length };
}

export async function enqueueProposal(tenantId: string, projectId: string, force = false): Promise<void> {
  await enqueueJob({ tenantId, kind: JOB, payload: { projectId, force }, scopeType: 'proyecto', scopeId: projectId, priority: 7, dedupeKey: `${JOB}:${projectId}:${force ? 'forzada' : 'auto'}` });
}

/** Idiomas de la web (sin IA) para el expediente: del último rastreo. */
export async function crawlLanguages(projectId: string): Promise<string[]> {
  const run = await lastDoneCrawl(projectId);
  if (!run) return [];
  const rows = await db.select({ lang: crawlPages.lang, hreflang: crawlPages.hreflang }).from(crawlPages).where(eq(crawlPages.runId, run.id));
  return webLanguages(rows.map((r) => ({ lang: r.lang, hreflang: (r.hreflang as { lang: string }[] | null) ?? null })));
}

// --- Puesta en marcha ------------------------------------------------------------------------------------------------

export async function projectReadiness(tenantId: string, projectId: string) {
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p) return null;
  const [web, props, run, topics, facts, comps, subs] = await Promise.all([
    projectWebUrl(tenantId, projectId),
    gscPropertiesForProject(tenantId, projectId).catch(() => []),
    lastDoneCrawl(projectId),
    db.select({ n: sql<number>`count(*)::int` }).from(seoTopics).where(eq(seoTopics.projectId, projectId)),
    db.select({ field: seoDossierFacts.field, status: seoDossierFacts.status, source: seoDossierFacts.source }).from(seoDossierFacts).where(eq(seoDossierFacts.projectId, projectId)),
    p.clientId ? db.select({ n: sql<number>`count(*)::int` }).from(clientCompetitors).where(and(eq(clientCompetitors.clientId, p.clientId), eq(clientCompetitors.status, 'confirmado'))) : Promise.resolve([{ n: 0 }]),
    p.clientId
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(clientContactSubscriptions)
          .innerJoin(clientContacts, eq(clientContacts.id, clientContactSubscriptions.contactId))
          .where(and(eq(clientContacts.clientId, p.clientId), inArray(clientContactSubscriptions.kind, ['informes', 'todo']), sql`${clientContacts.email} IS NOT NULL AND ${clientContacts.email} <> ''`))
      : Promise.resolve([{ n: 0 }])
  ]);
  // Un dato cuenta si está confirmado (por una persona, el cliente o pasado a la ficha) o viene de la ficha.
  const confirmed = (field: string) => facts.some((f) => f.field === field && (f.status === 'confirmado' || f.source === 'ficha'));
  return readiness({
    web: Boolean(web),
    gscAssigned: props.length > 0,
    gscHasData: props.some((g) => Boolean(g.lastDate)),
    audited: Boolean(run),
    mapBuilt: Number(topics[0]?.n ?? 0) > 0,
    negocio: confirmed('negocio'),
    servicios: confirmed('servicios'),
    zona: confirmed('zona'),
    atencion: confirmed('atencion'),
    idiomas: confirmed('idiomas'),
    contacto: Number(subs[0]?.n ?? 0) > 0,
    competencia: Number(comps[0]?.n ?? 0),
    ficha: p.clientId ? (await db.select({ id: seoLocalPlaces.id }).from(seoLocalPlaces).where(and(eq(seoLocalPlaces.clientId, p.clientId), eq(seoLocalPlaces.role, 'cliente'), eq(seoLocalPlaces.status, 'confirmada'))).limit(1)).length > 0 : false,
    accesoWeb: p.clientId ? (await db.select({ id: clientAssets.id }).from(clientAssets).where(and(eq(clientAssets.clientId, p.clientId), eq(clientAssets.kind, 'web'), eq(clientAssets.access, 'si'))).limit(1)).length > 0 : false
  });
}

let registered = false;
export function registerAltaJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: JOB, timeoutS: 180, maxConcurrent: 1, maxAttempts: 2, run: async (ctx, payload) => proposeFicha(ctx.tenantId, String(payload.projectId ?? ''), payload.force === true) });
}
