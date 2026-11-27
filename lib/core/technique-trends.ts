import 'server-only';

// Núcleo: tendencias por técnica de la cuenta (SEO parte 11). Lee las intervenciones medidas y aplica las reglas puras.
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { interventions } from '@/lib/db/schema';
import { techniqueTrends, type InterventionLite, type Trend } from '@/lib/core/technique-trends-rules';

const G = globalThis as unknown as { __kijuTrendsCache?: Map<string, { at: number; v: Trend[] }> };
const TTL = 15 * 60_000;
const MAX = 20000;

/** Con caché de 15 min por cuenta (la misma para todos los proyectos; se usa al rehacer cada plan y al abrir la pantalla). */
export async function accountTechniqueTrends(tenantId: string, domain = 'seo'): Promise<Trend[]> {
  const cache = (G.__kijuTrendsCache ??= new Map());
  const key = `${tenantId}:${domain}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const v = await computeTrends(tenantId, domain);
  cache.set(key, { at: Date.now(), v });
  return v;
}

async function computeTrends(tenantId: string, domain: string): Promise<Trend[]> {
  const rows = await db
    .select({ id: interventions.id, clientId: interventions.clientId, technique: interventions.technique, taxonomyVersion: interventions.taxonomyVersion, source: interventions.source, hypothesis: interventions.hypothesis, outcome: interventions.outcome })
    .from(interventions)
    .where(and(eq(interventions.tenantId, tenantId), eq(interventions.domain, domain), eq(interventions.status, 'hecha'), isNotNull(interventions.outcome)))
    .orderBy(asc(interventions.doneAt), asc(interventions.id))
    .limit(MAX);
  if (rows.length >= MAX) console.warn(`[núcleo] tendencias: tope de ${MAX} intervenciones alcanzado (${tenantId})`);
  const list: InterventionLite[] = rows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    technique: r.technique,
    taxonomyVersion: r.taxonomyVersion,
    source: r.source,
    windowDays: Number(r.hypothesis?.windowDays ?? 56),
    checkpoints: ((r.outcome as { checkpoints?: InterventionLite['checkpoints'] } | null)?.checkpoints ?? []) as InterventionLite['checkpoints']
  }));
  return techniqueTrends(list);
}
