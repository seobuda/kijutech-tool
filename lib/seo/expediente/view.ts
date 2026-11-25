import 'server-only';

// SEO · Expediente: datos de la pantalla (Hito 1, 23 nov 2026). Solo lectura.
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients, jobs, projects, seoDossierFacts } from '@/lib/db/schema';
import { DOSSIER_FIELDS, identity, scoreFacts, type FactSource, type Identity } from '@/lib/seo/expediente/rules';
import { gscPropertiesForProject } from '@/lib/core/gsc';

export type DossierFactView = {
  id: string;
  field: string;
  value: unknown;
  source: FactSource;
  sourceRef: string | null;
  confidence: number;
  status: 'provisional' | 'confirmado' | 'descartado';
  decidedBy: string | null;
  agrees: string[];
  conflicts: string[];
  updatedAt: string;
};
export type DossierView = {
  project: { id: string; name: string; clientId: string | null; clientName: string | null };
  fields: { field: string; label: string; client: boolean; facts: DossierFactView[] }[];
  identity: Identity;
  lastUpdate: string | null;
  collecting: boolean;
};

export async function getDossierView(tenantId: string, projectId: string): Promise<DossierView | null> {
  const [p] = await db
    .select({ id: projects.id, name: projects.name, clientId: projects.clientId, clientName: clients.name })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  if (!p) return null;
  const [rows, [running]] = await Promise.all([
    db.select().from(seoDossierFacts).where(and(eq(seoDossierFacts.projectId, projectId), eq(seoDossierFacts.tenantId, tenantId))).orderBy(desc(seoDossierFacts.confidence)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.tenantId, tenantId), eq(jobs.kind, 'seo.expediente.collect'), eq(jobs.scopeId, projectId), sql`${jobs.status} IN ('pendiente', 'en_curso')`))
  ]);
  // «Datos en Search Console desde» se guardó al reunir el expediente, pero la descarga del histórico sigue después y
  // la fecha retrocede: se enseña la de ahora (la misma que ve Salud técnica).
  const gscFirst = (await gscPropertiesForProject(tenantId, projectId).catch(() => []))
    .map((g) => g.firstDate)
    .filter((d): d is string => Boolean(d))
    .sort()[0];
  if (gscFirst) for (const r of rows) if (r.field === 'datos_search_console' && r.source === 'gsc') r.value = gscFirst;
  const live = rows.filter((r) => r.status !== 'descartado');
  const scored = scoreFacts(live.map((r) => ({ field: r.field, value: r.value, source: r.source as FactSource, id: r.id })));
  const extra = new Map(scored.map((s) => [s.id, s]));
  const facts: DossierFactView[] = rows.map((r) => ({
    id: r.id,
    field: r.field,
    value: r.value,
    source: r.source as FactSource,
    sourceRef: r.sourceRef,
    confidence: r.confidence,
    status: r.status as DossierFactView['status'],
    decidedBy: r.decidedBy,
    agrees: extra.get(r.id)?.agrees ?? [],
    conflicts: extra.get(r.id)?.conflicts ?? [],
    updatedAt: r.updatedAt.toISOString()
  }));
  const known = new Set(DOSSIER_FIELDS.map((f) => f.field));
  return {
    project: { id: p.id, name: p.name, clientId: p.clientId, clientName: p.clientName },
    fields: DOSSIER_FIELDS.map((f) => ({ ...f, facts: facts.filter((x) => x.field === f.field) })).concat(
      [...new Set(facts.filter((x) => !known.has(x.field)).map((x) => x.field))].map((field) => ({ field, label: field, client: false, facts: facts.filter((x) => x.field === field) }))
    ),
    identity: identity(live.map((r) => ({ field: r.field, value: r.value, source: r.source as FactSource }))),
    lastUpdate: rows.length ? new Date(Math.max(...rows.map((r) => r.updatedAt.getTime()))).toISOString() : null,
    collecting: Number(running?.n ?? 0) > 0
  };
}
