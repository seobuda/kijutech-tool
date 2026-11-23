import 'server-only';

// SEO · Competencia (Hito 2, 24 nov 2026; docs/DISENO-TECNICO-HITO2.md §1). Busca en Google (fuente de búsquedas del
// núcleo: DataForSEO, registrada por Agentes) las búsquedas semilla del proyecto y propone los dominios que más salen.
// Se guardan en la lista de competidores del cliente (núcleo, client_competitors) como «propuesto»: una persona confirma.
// Lo confirmado o descartado nunca lo cambia la búsqueda; solo se ponen al día sus datos.
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, clientLocations, clients, projects, seoTopics } from '@/lib/db/schema';
import { serpSource } from '@/lib/core/capabilities';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { projectWebUrl } from '@/lib/seo/salud/audit';
import { host } from '@/lib/seo/expediente/rules';
import { parseServices } from '@/lib/seo/local/rules';
import { rankCompetitors, rootDomain, seedQueries } from '@/lib/seo/competencia/rules';

const MAX_SEARCHES = 15;

export class CompetenciaError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

export async function findCompetitors(tenantId: string, projectId: string): Promise<{ searches: number; candidates: number; created: number; costUsd: number }> {
  const src = serpSource();
  if (!src || !(await src.isConnected(tenantId))) throw new CompetenciaError('DataForSEO no está conectado (Agentes → Integraciones): hace falta para ver quién sale en Google.');
  const [p] = await db
    .select({ clientId: projects.clientId, offerings: clients.offerings })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  if (!p?.clientId) throw new CompetenciaError('El proyecto no tiene cliente.');
  const [topics, [loc], web] = await Promise.all([
    db
      .select({ name: seoTopics.name, metrics: seoTopics.metrics })
      .from(seoTopics)
      .where(and(eq(seoTopics.projectId, projectId), eq(seoTopics.status, 'activo')))
      .orderBy(desc(sql`(${seoTopics.metrics}->>'impresiones')::float`))
      .limit(40),
    db.select({ city: clientLocations.city }).from(clientLocations).where(eq(clientLocations.clientId, p.clientId)).orderBy(desc(clientLocations.isPrimary), asc(clientLocations.createdAt)).limit(1),
    projectWebUrl(tenantId, projectId)
  ]);
  const seeds = seedQueries(
    {
      topics: topics.map((t) => ({ name: t.name, isBrand: Number((t.metrics as Record<string, number | null>).marca ?? 0) > 0, impressions: Number((t.metrics as Record<string, number | null>).impresiones ?? 0) })),
      services: parseServices(p.offerings),
      city: loc?.city ?? null
    },
    MAX_SEARCHES
  );
  if (!seeds.length) throw new CompetenciaError('No hay búsquedas de partida: calcula antes el mapa de palabras o pon los servicios en la ficha («Qué vende u ofrece»).');
  const results = [];
  let cost = 0;
  for (const q of seeds) {
    const serp = await src.search(tenantId, { keyword: q, location: 'Spain', language: 'es', depth: 20 });
    cost += serp.costUsd ?? 0;
    results.push({ query: q, serp });
  }
  const own = [host(web)].filter((x): x is string => Boolean(x));
  const candidates = rankCompetitors(results, own);

  const existing = await db.select().from(clientCompetitors).where(and(eq(clientCompetitors.clientId, p.clientId), eq(clientCompetitors.tenantId, tenantId)));
  const byDomain = new Map(existing.filter((c) => c.domain).map((c) => [rootDomain(c.domain!.replace(/^https?:\/\//, '').split('/')[0]), c]));
  let created = 0;
  for (const c of candidates) {
    const evidence = { busquedas: c.queries, apariciones: c.appearances, de: results.length, posicionMedia: c.avgPosition, enPaqueteLocal: c.inLocalPack, valoracion: c.rating, resenas: c.reviews };
    const ex = byDomain.get(c.domain);
    if (ex) {
      await db.update(clientCompetitors).set({ evidence, lastSeen: new Date(), projectId: ex.projectId ?? projectId }).where(eq(clientCompetitors.id, ex.id));
    } else {
      await db.insert(clientCompetitors).values({
        tenantId,
        clientId: p.clientId,
        projectId,
        name: (c.localName ?? c.domain).slice(0, 255),
        domain: c.domain,
        source: c.inLocalPack > 0 && c.appearances <= c.inLocalPack ? 'local' : 'serp',
        status: 'propuesto',
        kind: c.kind,
        evidence,
        lastSeen: new Date()
      });
      created++;
    }
  }
  return { searches: results.length, candidates: candidates.length, created, costUsd: Math.round(cost * 1000) / 1000 };
}

export async function enqueueCompetitors(tenantId: string, projectId: string): Promise<void> {
  await enqueueJob({ tenantId, kind: 'seo.competencia.find', payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 6, dedupeKey: `seo.competencia:${projectId}` });
}

let registered = false;
export function registerCompetenciaJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: 'seo.competencia.find', timeoutS: 300, maxConcurrent: 1, maxAttempts: 1, run: async (ctx, payload) => findCompetitors(ctx.tenantId, String(payload.projectId ?? '')) });
}
