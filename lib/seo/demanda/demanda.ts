import 'server-only';

// SEO · Demanda (parte 7, 27 nov 2026; docs/DISENO-SEO-DEMANDA.md con la auditoría Opus). Proceso «seo.demanda» (mensual):
// volumen (Google Ads) de las búsquedas principales de los temas, SERP en directo de los temas con más valor (intención y
// tipo de página por la SERP real, URLs del top 10) y hallazgos «misma intención» y «demanda sin página». Las ideas de
// palabras se piden a mano (botón, con su coste). Todo con el tope de gasto del proyecto.
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, findings, projects, seoDemand, seoDossierFacts, seoRankKeywords, seoTopicQueries, seoTopics } from '@/lib/db/schema';
import { serpSource } from '@/lib/core/capabilities';
import { syncFindings } from '@/lib/core/findings';
import { brandTokens, host, normText } from '@/lib/seo/expediente/rules';
import { canSpend, recordDataSpend } from '@/lib/seo/gasto';
import { projectWebUrl } from '@/lib/seo/salud/audit';
import { projectLocation } from '@/lib/seo/posiciones/posiciones';
import { kwKey, MAX_KEYWORDS } from '@/lib/seo/posiciones/rules';
import { enqueueKeywordMap, valueContext } from '@/lib/seo/mapa/mapa';
import { closestTopic, DEMANDA_KINDS, DEMANDA_SOURCE, demandWithoutPage, filterIdeas, keywordKey, sameIntentPairs, serpIntent } from '@/lib/seo/demanda/rules';

type Outcome = { status: 'ok' | 'aviso' | 'omitido'; summary: string };
const VOLUME_COST = 0.09;
const SERP_COST = 0.002;
const IDEAS_COST = 0.09;
const MAX_VOLUME_TOPICS = 300;
const MAX_SERP_TOPICS = 40;
const DAYS30 = 30 * 86_400_000;

async function zona(projectId: string): Promise<string | null> {
  const [z] = await db.select({ value: seoDossierFacts.value }).from(seoDossierFacts).where(and(eq(seoDossierFacts.projectId, projectId), eq(seoDossierFacts.field, 'zona'), eq(seoDossierFacts.status, 'confirmado'))).limit(1);
  return typeof z?.value === 'string' ? z.value : null;
}

type TopicRow = { id: string; topicKey: string; name: string; url: string | null; metrics: Record<string, unknown>; queries: string[] };
async function activeTopics(projectId: string): Promise<TopicRow[]> {
  const ts = await db.select({ id: seoTopics.id, topicKey: seoTopics.topicKey, name: seoTopics.name, url: seoTopics.url, metrics: seoTopics.metrics }).from(seoTopics).where(and(eq(seoTopics.projectId, projectId), eq(seoTopics.status, 'activo')));
  if (!ts.length) return [];
  const qs = await db.select({ topicId: seoTopicQueries.topicId, query: seoTopicQueries.query, impressions: seoTopicQueries.impressions }).from(seoTopicQueries).where(inArray(seoTopicQueries.topicId, ts.map((t) => t.id)));
  const byTopic = new Map<string, { query: string; impressions: number }[]>();
  for (const q of qs) byTopic.set(q.topicId, [...(byTopic.get(q.topicId) ?? []), q]);
  const score = (t: (typeof ts)[number]) => (Number((t.metrics as Record<string, unknown>).valor) || 1) * (Number((t.metrics as Record<string, unknown>).impresiones) || 0);
  return ts
    .filter((t) => !(t.metrics as Record<string, unknown>).esMarca)
    .sort((a, b) => score(b) - score(a))
    .map((t) => ({ id: t.id, topicKey: t.topicKey, name: t.name, url: t.url, metrics: t.metrics as Record<string, unknown>, queries: (byTopic.get(t.id) ?? []).sort((a, b) => b.impressions - a.impressions).map((q) => q.query) }));
}

async function upsertDemand(tenantId: string, projectId: string, keyword: string, set: Partial<typeof seoDemand.$inferInsert>, insertExtra: Partial<typeof seoDemand.$inferInsert> = {}): Promise<void> {
  const key = keywordKey(keyword);
  await db
    .insert(seoDemand)
    .values({ tenantId, projectId, keyword: keyword.slice(0, 200), keywordKey: key, language: 'es', origin: 'mapa', status: 'auto', ...insertExtra, ...set })
    .onConflictDoUpdate({ target: [seoDemand.projectId, seoDemand.keywordKey, seoDemand.language], set: { ...set, updatedAt: new Date() } });
}

export async function runDemanda(tenantId: string, projectId: string, heartbeat: () => Promise<void> = async () => undefined): Promise<Outcome> {
  const src = serpSource();
  if (!src || !(await src.isConnected(tenantId).catch(() => false))) return { status: 'omitido', summary: 'DataForSEO no está conectado (Agentes → Integraciones).' };
  const home = await projectWebUrl(tenantId, projectId);
  const clientHost = (host(home) ?? '').replace(/^www\./, '');
  const topics = await activeTopics(projectId);
  if (!topics.length) return { status: 'omitido', summary: 'Aún no hay mapa de palabras (hace falta Search Console).' };
  const loc = await projectLocation(tenantId, await zona(projectId));
  const parts: string[] = [];
  const existing = await db.select().from(seoDemand).where(eq(seoDemand.projectId, projectId));
  const byKey = new Map(existing.map((e) => [e.keywordKey, e]));
  const fresh = (d: Date | null | undefined) => d && Date.now() - d.getTime() < DAYS30;

  // 1. Volumen de las búsquedas principales (3 por tema) de los temas con más valor.
  if (src.volumes) {
    const want = [...new Map(topics.slice(0, MAX_VOLUME_TOPICS).flatMap((t) => t.queries.slice(0, 3)).filter((q) => q.length <= 80 && q.trim().split(/\s+/).length <= 10).map((q) => [keywordKey(q), q])).values()].filter((q) => !fresh(byKey.get(keywordKey(q))?.volumeAt));
    if (want.length && (await canSpend(projectId, VOLUME_COST)).ok) {
      // Un fallo del proveedor no tumba la pasada (la SERP y los hallazgos siguen); un fallo de la base, sí (se ve).
      let r: Awaited<ReturnType<NonNullable<typeof src.volumes>>> | null = null;
      try {
        r = await src.volumes(tenantId, want.slice(0, 1000), loc.name, 'es');
      } catch (e) {
        console.error('[seo] demanda: volumen:', e instanceof Error ? e.message : e);
        parts.push('volumen: el proveedor falló');
      }
      if (r) {
        await recordDataSpend(tenantId, projectId, 'serp', 'demanda: volumen de los temas', r.costUsd || VOLUME_COST);
        for (const q of want.slice(0, 1000)) await upsertDemand(tenantId, projectId, q, { volume: r.volumes.get(q.toLowerCase()) ?? 0, volumeAt: new Date() });
        parts.push(`volumen de ${Math.min(want.length, 1000)} búsquedas`);
      }
    }
  }
  await heartbeat();

  // 2. SERP de la búsqueda principal de los temas con más valor y de las ideas seguidas.
  const followed = existing.filter((e) => e.origin === 'idea' && e.status === 'seguida').map((e) => ({ q: e.keyword, topicKey: e.topicKey }));
  const serpList = [...topics.slice(0, MAX_SERP_TOPICS).filter((t) => t.queries[0]).map((t) => ({ q: t.queries[0], topicKey: t.topicKey })), ...followed.slice(0, 10)].filter((x) => !fresh(byKey.get(keywordKey(x.q))?.serpAt));
  let serps = 0;
  for (const x of serpList) {
    if (!(await canSpend(projectId, SERP_COST)).ok) break;
    try {
      const r = await src.search(tenantId, { keyword: x.q, location: loc.name, language: 'es', depth: 10 });
      await recordDataSpend(tenantId, projectId, 'serp', 'demanda: intención por la SERP', r.costUsd ?? SERP_COST);
      const urls = r.organic.filter((o) => o.rank <= 10).sort((a, b) => a.rank - b.rank).map((o) => o.url);
      const it = serpIntent(urls, r.localPack.length ? ['local_pack'] : [], x.q);
      await upsertDemand(tenantId, projectId, x.q, { top10Urls: urls, intent: it.intent, pageType: it.pageType, serpAt: new Date(), topicKey: x.topicKey }, { topicKey: x.topicKey });
      serps++;
    } catch (e) {
      console.error('[seo] demanda: SERP:', e instanceof Error ? e.message : e);
    }
    await heartbeat();
  }
  if (serps) parts.push(`${serps} SERP leídas`);

  // 3. Hallazgos: misma intención (temas con página) y demanda sin página (ideas).
  const all = await db.select().from(seoDemand).where(eq(seoDemand.projectId, projectId));
  const serpByKey = new Map(all.filter((d) => d.top10Urls?.length).map((d) => [d.keywordKey, d]));
  const blockedRows = await db.select({ url: findings.url, evidence: findings.evidence }).from(findings).where(and(eq(findings.projectId, projectId), eq(findings.status, 'abierto'), inArray(findings.kind, ['seo.cannibalization', 'seo.topic_unclear_page'])));
  const blocked = new Set(blockedRows.flatMap((b) => [b.url ?? '', ...(((b.evidence as { paginas?: string[] } | null)?.paginas ?? []) as string[])]).filter(Boolean));
  const topicSerps = topics
    .filter((t) => t.queries[0] && serpByKey.has(keywordKey(t.queries[0])))
    .map((t) => ({ topicKey: t.topicKey, name: t.name, url: t.url, position: typeof t.metrics.posicion === 'number' ? (t.metrics.posicion as number) : null, top10: serpByKey.get(keywordKey(t.queries[0]))!.top10Urls ?? [] }));
  const topicByKey = new Map(topics.map((t) => [t.topicKey, t]));
  const ideas = all.filter((d) => d.origin === 'idea' && (d.status === 'nueva' || d.status === 'seguida'));
  const found = [
    ...sameIntentPairs(topicSerps, clientHost, blocked),
    ...demandWithoutPage(ideas.map((i) => ({ keyword: i.keyword, volume: i.volume, topicHasPage: Boolean(i.topicKey && topicByKey.get(i.topicKey)?.url), intent: i.intent })))
  ];
  await syncFindings(tenantId, projectId, DEMANDA_SOURCE, found, DEMANDA_KINDS);
  // El mapa toma el volumen y la intención en su próxima pasada: se rehace ahora (usa la caché de embeddings).
  if (parts.length) await enqueueKeywordMap(tenantId, projectId);
  return { status: found.length ? 'aviso' : 'ok', summary: [...parts, `${found.length} hallazgo(s)`].join(' · ') };
}

// --- Ideas (bajo demanda) --------------------------------------------------------------------------------------------

export class DemandaError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

export async function generateIdeas(tenantId: string, projectId: string): Promise<number> {
  const src = serpSource();
  if (!src?.keywordIdeas || !(await src.isConnected(tenantId).catch(() => false))) throw new DemandaError('DataForSEO no está conectado (Agentes → Integraciones).');
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p) throw new DemandaError('Proyecto no encontrado');
  const facts = await db.select({ field: seoDossierFacts.field, value: seoDossierFacts.value, status: seoDossierFacts.status }).from(seoDossierFacts).where(eq(seoDossierFacts.projectId, projectId));
  const services = facts.find((f) => f.field === 'servicios' && f.status === 'confirmado')?.value;
  const seeds = (Array.isArray(services) ? services.map(String) : []).filter((s) => s.length <= 80).slice(0, 10);
  if (!seeds.length) throw new DemandaError('Confirma antes sus servicios en el Expediente: son las semillas de las ideas.');
  const check = await canSpend(projectId, IDEAS_COST);
  if (!check.ok) throw new DemandaError('Se ha llegado al tope de gasto de datos de este mes.');
  const loc = await projectLocation(tenantId, typeof facts.find((f) => f.field === 'zona' && f.status === 'confirmado')?.value === 'string' ? (facts.find((f) => f.field === 'zona' && f.status === 'confirmado')!.value as string) : null);
  const r = await src.keywordIdeas(tenantId, seeds, loc.name, 'es');
  await recordDataSpend(tenantId, projectId, 'serp', 'demanda: ideas de palabras', r.costUsd || IDEAS_COST);
  const comps = p.clientId ? await db.select({ name: clientCompetitors.name, domain: clientCompetitors.domain }).from(clientCompetitors).where(and(eq(clientCompetitors.clientId, p.clientId), eq(clientCompetitors.status, 'confirmado'))) : [];
  const competitorTokens = comps.flatMap((c) => [brandTokens([c.name]), c.domain ? [normText(c.domain.replace(/^www\./, '').split('.')[0])] : []]).filter((t) => t.length);
  const existing = await db.select({ key: seoDemand.keywordKey, origin: seoDemand.origin }).from(seoDemand).where(eq(seoDemand.projectId, projectId));
  // Lo que el cliente no quiere (memoria del cliente, «restricción»), como en el mapa.
  const ctx = await valueContext(tenantId, projectId, p.clientId, null);
  const kept = filterIdeas(r.ideas, { competitorTokens, avoid: ctx.avoid, known: new Set(existing.map((e) => e.key)) });
  const topics = await activeTopics(projectId);
  const monthlyOf = new Map(r.ideas.map((i) => [i.keyword, i.monthly]));
  for (const i of kept) {
    await upsertDemand(
      tenantId,
      projectId,
      i.keyword,
      { volume: i.volume, cpc: i.cpc, competition: i.competition, monthly: monthlyOf.get(i.keyword) ?? null, volumeAt: new Date(), seed: seeds.join(', ').slice(0, 200) },
      { origin: 'idea', status: 'nueva', topicKey: closestTopic(i.keyword, topics) }
    );
  }
  return kept.length;
}

export async function setIdeaStatus(tenantId: string, projectId: string, id: string, status: 'seguida' | 'descartada' | 'nueva'): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  const [d] = await db.select().from(seoDemand).where(and(eq(seoDemand.id, id), eq(seoDemand.projectId, projectId), eq(seoDemand.tenantId, tenantId))).limit(1);
  if (!d || d.origin !== 'idea') return { ok: false, error: 'Idea no encontrada' };
  if (status === 'seguida' && !d.rankKeywordId) {
    const active = await db.select({ n: sql<number>`count(*)::int` }).from(seoRankKeywords).where(and(eq(seoRankKeywords.projectId, projectId), eq(seoRankKeywords.status, 'activa')));
    if (Number(active[0]?.n ?? 0) >= MAX_KEYWORDS) return { ok: false, error: `Ya se siguen ${MAX_KEYWORDS} búsquedas en Posiciones: quita una antes.` };
    let [rk] = await db
      .insert(seoRankKeywords)
      .values({ tenantId, projectId, keyword: d.keyword.slice(0, 150), keywordKey: kwKey(d.keyword).slice(0, 150), origin: 'manual', language: d.language, volume: d.volume, volumeAt: d.volumeAt })
      .onConflictDoNothing()
      .returning({ id: seoRankKeywords.id });
    if (!rk) {
      // Ya existía (quizá quitada o en pausa): se reactiva y se enlaza.
      [rk] = await db
        .update(seoRankKeywords)
        .set({ status: 'activa', updatedAt: new Date() })
        .where(and(eq(seoRankKeywords.projectId, projectId), eq(seoRankKeywords.keywordKey, kwKey(d.keyword).slice(0, 150))))
        .returning({ id: seoRankKeywords.id });
    }
    await db.update(seoDemand).set({ status, rankKeywordId: rk?.id ?? null, updatedAt: new Date() }).where(eq(seoDemand.id, d.id));
    return { ok: true, message: 'Se seguirá en Posiciones desde la próxima comprobación.' };
  }
  await db.update(seoDemand).set({ status, updatedAt: new Date() }).where(eq(seoDemand.id, d.id));
  return { ok: true };
}

export type IdeaView = { id: string; keyword: string; volume: number | null; cpc: number | null; competition: string | null; status: string; intent: string | null; topicName: string | null; topicUrl: string | null; monthly: { month: string; volume: number }[] | null };
export type DemandView = { ideas: IdeaView[]; lastIdeasAt: string | null; volumes: number; serps: number; intents: Record<string, number> };
export async function getDemandView(tenantId: string, projectId: string): Promise<DemandView> {
  const rows = await db.select().from(seoDemand).where(and(eq(seoDemand.tenantId, tenantId), eq(seoDemand.projectId, projectId))).orderBy(desc(seoDemand.volume));
  const topics = await db.select({ topicKey: seoTopics.topicKey, name: seoTopics.name, url: seoTopics.url }).from(seoTopics).where(eq(seoTopics.projectId, projectId));
  const tk = new Map(topics.map((t) => [t.topicKey, t]));
  const ideas = rows.filter((r) => r.origin === 'idea');
  const intents: Record<string, number> = {};
  for (const r of rows) if (r.intent) intents[r.intent] = (intents[r.intent] ?? 0) + 1;
  return {
    ideas: ideas.filter((r) => r.status !== 'descartada').slice(0, 200).map((r) => ({ id: r.id, keyword: r.keyword, volume: r.volume, cpc: r.cpc, competition: r.competition, status: r.status, intent: r.intent, topicName: r.topicKey ? (tk.get(r.topicKey)?.name ?? null) : null, topicUrl: r.topicKey ? (tk.get(r.topicKey)?.url ?? null) : null, monthly: r.monthly ?? null })),
    lastIdeasAt: ideas.map((i) => i.createdAt).sort((a, b) => b.getTime() - a.getTime())[0]?.toISOString() ?? null,
    volumes: rows.filter((r) => r.volume != null).length,
    serps: rows.filter((r) => r.serpAt).length,
    intents
  };
}
