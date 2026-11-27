import 'server-only';

// Núcleo: tendencias por técnica de la cuenta (SEO parte 11). Lee las intervenciones medidas y aplica las reglas puras.
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { interventions } from '@/lib/db/schema';
import { techniqueTrends, type InterventionLite, type Trend } from '@/lib/core/technique-trends-rules';

export async function accountTechniqueTrends(tenantId: string, domain = 'seo'): Promise<Trend[]> {
  const rows = await db
    .select({ id: interventions.id, clientId: interventions.clientId, technique: interventions.technique, taxonomyVersion: interventions.taxonomyVersion, source: interventions.source, hypothesis: interventions.hypothesis, outcome: interventions.outcome })
    .from(interventions)
    .where(and(eq(interventions.tenantId, tenantId), eq(interventions.domain, domain), eq(interventions.status, 'hecha'), isNotNull(interventions.outcome)))
    .limit(20000);
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
