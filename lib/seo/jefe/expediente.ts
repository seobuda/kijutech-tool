import 'server-only';

// SEO · Jefe SEO, D1: expediente estratégico (docs/PLAN-SEO-JEFE.md §4-§5, con la auditoría Opus). Todo lo que se sabe de
// un proyecto, en datos con CLAVE ESTABLE (evidence.ts) y con los pronósticos calculados por el código (forecast.ts). Lo
// usarán el plan maestro (D2, una llamada a Opus sin herramientas), el Jefe SEO en el debate (D3) y las propuestas de
// ciclo (D4). Solo tablas propias: 0 $ de IA. Lo ajeno (títulos, búsquedas, novedades) va delimitado como dato no fiable.
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, clientMemory, clients, findings, kbFeedItems, projects, seoCycleLines, seoCycles, seoDemand, seoRankKeywords, seoTopics } from '@/lib/db/schema';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { accountTechniqueTrends } from '@/lib/core/technique-trends';
import { SEO_KINDS } from '@/lib/seo/salud/kinds';
import { gatherFacts } from '@/lib/seo/arranque/arranque';
import { connections, GSC_CLASS_LABEL } from '@/lib/seo/arranque/rules';
import { eligibilityContext } from '@/lib/seo/estrategia/ciclos';
import { availableHours, eligibility, PLAYBOOKS } from '@/lib/seo/estrategia/playbooks';
import { confirmedFacts } from '@/lib/seo/posiciones/posiciones';
import { evidenceId, evidenceLine, type Evidence } from '@/lib/seo/jefe/evidence';
import { forecastNewContent, forecastStriking, forecastText, projectCurve, type CtrPoint } from '@/lib/seo/jefe/forecast';

const KIND = new Map(SEO_KINDS.map((k) => [k.kind, k]));
const SEV: Record<string, number> = { critico: 0, importante: 1, aviso: 2, info: 3 };
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

export type StrategicDossier = {
  projectId: string;
  generatedAt: string;
  evidence: Map<string, Evidence>;
  /** Texto para el prompt, por secciones, con los identificadores entre corchetes. */
  text: string;
  summary: { client: string; gsc: string; monthlyHours: number | null; dataGaps: string[]; eligible: string[] };
};

export async function buildStrategicDossier(tenantId: string, projectId: string): Promise<StrategicDossier> {
  const [p] = await db.select({ name: projects.name, clientId: projects.clientId, monthlyHours: projects.monthlyHours }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p) throw new Error('Proyecto no encontrado');
  const [client] = p.clientId ? await db.select({ name: clients.name, businessType: clients.businessType }).from(clients).where(eq(clients.id, p.clientId)).limit(1) : [];
  const [facts, setupFacts, elig, props, topics, open, comps, rank, demand, feed, memory, trends, cycles] = await Promise.all([
    confirmedFacts(projectId),
    gatherFacts(tenantId, projectId).catch(() => null),
    eligibilityContext(tenantId, projectId),
    gscPropertiesForProject(tenantId, projectId).catch(() => []),
    db.select({ key: seoTopics.topicKey, name: seoTopics.name, url: seoTopics.url, metrics: seoTopics.metrics }).from(seoTopics).where(and(eq(seoTopics.projectId, projectId), eq(seoTopics.status, 'activo'))).orderBy(desc(sql`coalesce((${seoTopics.metrics}->>'valor')::float, 1) * coalesce((${seoTopics.metrics}->>'impresiones')::float, 0)`)).limit(25),
    db.select({ kind: findings.kind, severity: findings.severity, url: findings.url, query: findings.query, value: findings.value, dedupeKey: findings.dedupeKey, evidence: findings.evidence }).from(findings).where(and(eq(findings.projectId, projectId), eq(findings.status, 'abierto'))).limit(3000),
    p.clientId ? db.select({ name: clientCompetitors.name, domain: clientCompetitors.domain }).from(clientCompetitors).where(and(eq(clientCompetitors.clientId, p.clientId), eq(clientCompetitors.status, 'confirmado'))).limit(8) : Promise.resolve([]),
    db.select({ keyword: seoRankKeywords.keyword, volume: seoRankKeywords.volume, origin: seoRankKeywords.origin }).from(seoRankKeywords).where(and(eq(seoRankKeywords.projectId, projectId), eq(seoRankKeywords.status, 'activa'))).orderBy(desc(sql`coalesce(${seoRankKeywords.volume}, 0)`)).limit(20),
    db.select({ keyword: seoDemand.keyword, volume: seoDemand.volume }).from(seoDemand).where(and(eq(seoDemand.projectId, projectId), sql`coalesce(${seoDemand.volume}, 0) > 0`)).orderBy(desc(seoDemand.volume)).limit(15),
    db.select({ id: kbFeedItems.id, title: kbFeedItems.title, kind: kbFeedItems.kind, at: kbFeedItems.publishedAt, url: kbFeedItems.url }).from(kbFeedItems).where(and(eq(kbFeedItems.domain, 'seo'), gte(kbFeedItems.createdAt, new Date(Date.now() - 90 * 86_400_000)))).orderBy(desc(kbFeedItems.createdAt)).limit(8),
    p.clientId ? db.select({ id: clientMemory.id, kind: clientMemory.kind, text: clientMemory.text }).from(clientMemory).where(and(eq(clientMemory.clientId, p.clientId), eq(clientMemory.status, 'aceptado'))).orderBy(desc(clientMemory.createdAt)).limit(15) : Promise.resolve([]),
    accountTechniqueTrends(tenantId).catch(() => []),
    db.select({ id: seoCycles.id, name: seoCycles.name, status: seoCycles.status, startsOn: seoCycles.startsOn, endsOn: seoCycles.endsOn }).from(seoCycles).where(eq(seoCycles.projectId, projectId)).orderBy(desc(seoCycles.seq)).limit(6)
  ]);
  const ev = new Map<string, Evidence>();
  const add = (e: Evidence) => ev.set(e.id, e);
  const sections: string[] = [];

  // Search Console: totales 90 días frente a los 90 anteriores, y curva de CTR del proyecto.
  const prop = [...props].sort((a, b) => Number(b.kind === 'dominio') - Number(a.kind === 'dominio'))[0];
  let curve: { curve: number[]; source: 'proyecto' | 'referencia' } = projectCurve([]);
  if (prop) {
    const [t] = (await db.execute(sql`
      SELECT coalesce(sum(clicks) FILTER (WHERE date >= current_date - 90), 0)::int AS c90, coalesce(sum(impressions) FILTER (WHERE date >= current_date - 90), 0)::int AS i90,
             coalesce(sum(clicks) FILTER (WHERE date < current_date - 90 AND date >= current_date - 180), 0)::int AS cp, coalesce(sum(impressions) FILTER (WHERE date < current_date - 90 AND date >= current_date - 180), 0)::int AS ip
      FROM gsc_daily_totals WHERE property_id = ${prop.id} AND search_type = 1`)) as unknown as { c90: number; i90: number; cp: number; ip: number }[];
    const pts = (await db.execute(sql`
      SELECT round(sum(position * impressions) / nullif(sum(impressions), 0))::int AS position, sum(impressions)::int AS impressions, sum(clicks)::int AS clicks
      FROM gsc_daily WHERE property_id = ${prop.id} AND search_type = 1 AND date >= current_date - 90 GROUP BY query_id HAVING sum(impressions) > 20 LIMIT 2000`)) as unknown as CtrPoint[];
    curve = projectCurve(pts.map((x) => ({ position: num(x.position), impressions: num(x.impressions), clicks: num(x.clicks) })));
    add({ id: 'S:gsc', type: 'S', label: 'Search Console 90 días', data: { clics: t?.c90, impresiones: t?.i90, clicsAnteriores: t?.cp, impresionesAnteriores: t?.ip, curva: curve.source } });
  }

  const gscLabel = setupFacts ? GSC_CLASS_LABEL[setupFacts.gsc] : 'desconocido';
  const conns = setupFacts ? connections(setupFacts).filter((c) => c.status === 'falta' || c.status === 'error').map((c) => c.key) : [];
  const dataGaps = [...(setupFacts && setupFacts.gsc !== 'con_datos' ? [`Search Console: ${gscLabel}`] : []), ...conns.map((c) => `Falta: ${c}`), ...(topics.length ? [] : ['Sin mapa de palabras']), ...(comps.length ? [] : ['Sin competencia confirmada'])];
  const el = eligibility(elig);
  sections.push(
    `## Proyecto\nCliente: ${client?.name ?? p.name}${client?.businessType ? ` · tipo de negocio: ${client.businessType}` : ''}\nServicios confirmados: ${facts.services.join(', ') || '(sin confirmar)'}\nZona: ${facts.zona ?? '(sin confirmar)'} · idiomas: ${facts.langs.join(', ')}\nHoras al mes: ${p.monthlyHours ?? '(sin poner)'} · horas para estrategia en un trimestre (30 % de reserva): ${availableHours(p.monthlyHours != null ? Number(p.monthlyHours) : null, 3) ?? '—'}\nSearch Console: ${gscLabel}\nLo que falta o no se sabe: ${dataGaps.join('; ') || 'nada relevante'}\nLíneas del catálogo que se pueden hacer: ${el.eligible.map((k) => `${k} (${PLAYBOOKS[k].label})`).join(', ') || 'ninguna'}\nNo se pueden hacer: ${el.blocked.map((b) => `${b.key}: ${b.why}`).join('; ') || '—'}`
  );
  if (ev.has('S:gsc')) sections.push(`## Search Console\n${evidenceLine(ev.get('S:gsc')!)}`);

  // Problemas abiertos por tipo (clave estable por tipo).
  const byKind = new Map<string, { n: number; sev: string }>();
  for (const f of open) byKind.set(f.kind, { n: (byKind.get(f.kind)?.n ?? 0) + 1, sev: f.severity });
  const kinds = [...byKind].sort((a, b) => (SEV[a[1].sev] ?? 9) - (SEV[b[1].sev] ?? 9) || b[1].n - a[1].n).slice(0, 15);
  for (const [k, v] of kinds) add({ id: evidenceId('H', k), type: 'H', label: KIND.get(k)?.title ?? k, data: { gravedad: v.sev, casos: v.n } });
  if (kinds.length) sections.push(`## Problemas técnicos y de contenido abiertos (por tipo)\n${kinds.map(([k]) => evidenceLine(ev.get(evidenceId('H', k))!)).join('\n')}`);

  // Lo que ya posiciona cerca del top (con pronóstico) y lo que pierde tráfico.
  const striking = open.filter((f) => f.kind === 'seo.striking_distance' && f.query).slice(0, 12);
  for (const f of striking) {
    const e = (f.evidence ?? {}) as Record<string, unknown>;
    const fc = forecastStriking({ impressions90: num(e.impresiones ?? e.impressions), position: num(e.posicion ?? e.position ?? f.value), curve: curve.curve, curveSource: curve.source });
    add({ id: evidenceId('Q', f.query!), type: 'Q', label: f.query!, data: { url: f.url, posicion: num(e.posicion ?? e.position ?? f.value), impresiones90: num(e.impresiones ?? e.impressions), pronostico: forecastText(fc) } });
  }
  const decay = open.filter((f) => f.kind === 'seo.content_decay' && f.url).slice(0, 8);
  for (const f of decay) add({ id: evidenceId('U', f.url!), type: 'U', label: f.url!, data: { perdida: (f.evidence as Record<string, unknown>)?.caidaPct ?? f.value, causa: (f.evidence as Record<string, unknown>)?.causa } });
  if (striking.length) sections.push(`## Cerca del top 3 (pronóstico calculado por código)\n${striking.map((f) => evidenceLine(ev.get(evidenceId('Q', f.query!))!, true)).join('\n')}`);
  if (decay.length) sections.push(`## Páginas que pierden tráfico\n${decay.map((f) => evidenceLine(ev.get(evidenceId('U', f.url!))!, true)).join('\n')}`);

  // Temas del mapa.
  for (const t of topics) {
    const m = (t.metrics ?? {}) as Record<string, unknown>;
    add({ id: evidenceId('T', t.key), type: 'T', label: t.name, data: { url: t.url ?? 'sin página', impresiones: m.impresiones, clics: m.clics, posicion: m.posicion, valor: m.valor, marca: m.esMarca ? 'sí' : undefined } });
  }
  if (topics.length) sections.push(`## Temas del mapa de palabras (los de más valor)\n${topics.map((t) => evidenceLine(ev.get(evidenceId('T', t.key))!, true)).join('\n')}`);

  // Demanda (contenido nuevo, con pronóstico) y búsquedas seguidas.
  for (const d of demand) add({ id: evidenceId('Q', d.keyword), type: 'Q', label: d.keyword, data: { volumen: d.volume, pronosticoContenidoNuevo: forecastText(forecastNewContent({ monthlyVolume: d.volume, curve: curve.curve })) } });
  if (demand.length) sections.push(`## Demanda con volumen\n${demand.map((d) => evidenceLine(ev.get(evidenceId('Q', d.keyword))!, true)).join('\n')}`);
  for (const r of rank) add({ id: evidenceId('P', r.keyword), type: 'P', label: r.keyword, data: { volumen: r.volume, origen: r.origin } });
  if (rank.length) sections.push(`## Búsquedas que se siguen en Posiciones\n${rank.map((r) => evidenceLine(ev.get(evidenceId('P', r.keyword))!, true)).join('\n')}`);

  // Competencia, novedades, memoria, tendencias y ciclos.
  for (const c of comps) if (c.domain) add({ id: evidenceId('C', c.domain), type: 'C', label: c.name, data: { dominio: c.domain } });
  if (comps.length) sections.push(`## Competencia confirmada\n${comps.filter((c) => c.domain).map((c) => evidenceLine(ev.get(evidenceId('C', c.domain!))!, true)).join('\n')}`);
  for (const n of feed) add({ id: evidenceId('N', n.id), type: 'N', label: n.title, data: { tipo: n.kind, fecha: n.at ? n.at.toISOString().slice(0, 10) : null } });
  if (feed.length) sections.push(`## Novedades de Google de los últimos 90 días (fuentes oficiales)\n${feed.map((n) => evidenceLine(ev.get(evidenceId('N', n.id))!, true)).join('\n')}`);
  for (const m of memory) add({ id: evidenceId('M', m.id), type: 'M', label: m.text.slice(0, 200), data: { tipo: m.kind } });
  if (memory.length) sections.push(`## Memoria del cliente y criterio de la agencia\n${memory.map((m) => evidenceLine(ev.get(evidenceId('M', m.id))!, true)).join('\n')}`);
  const tr = trends.filter((t) => t.n > 0).slice(0, 12);
  for (const t of tr) add({ id: evidenceId('X', `${t.technique}:${t.metric}`), type: 'X', label: t.technique, data: { casos: t.n, clientes: t.clients, efectoPct: t.effectPct, etiqueta: t.label } });
  sections.push(
    tr.length
      ? `## Qué ha funcionado en la agencia (tendencias por técnica; con «pocos casos» es anecdótico)\n${tr.map((t) => evidenceLine(ev.get(evidenceId('X', `${t.technique}:${t.metric}`))!)).join('\n')}`
      : '## Qué ha funcionado en la agencia\nAún no hay casos medidos: no hay aprendizaje entre clientes (dilo, no lo inventes).'
  );
  if (cycles.length) {
    const lines = await db.select({ cycleId: seoCycleLines.cycleId, playbook: seoCycleLines.playbook }).from(seoCycleLines).where(inArray(seoCycleLines.cycleId, cycles.map((c) => c.id)));
    for (const c of cycles) add({ id: evidenceId('S', `ciclo:${c.id}`), type: 'S', label: c.name, data: { estado: c.status, desde: c.startsOn, hasta: c.endsOn, lineas: lines.filter((l) => l.cycleId === c.id).map((l) => l.playbook).join('+') } });
    sections.push(`## Estrategias anteriores de este proyecto\n${cycles.map((c) => evidenceLine(ev.get(evidenceId('S', `ciclo:${c.id}`))!)).join('\n')}`);
  }

  return {
    projectId,
    generatedAt: new Date().toISOString(),
    evidence: ev,
    text: sections.join('\n\n'),
    summary: { client: client?.name ?? p.name, gsc: gscLabel, monthlyHours: p.monthlyHours != null ? Number(p.monthlyHours) : null, dataGaps, eligible: el.eligible }
  };
}
