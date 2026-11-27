// Proyecto → Palabras (Hito 2 SEO, 24 nov 2026). El mapa de palabras sobre Search Console: cada tema con su página (o
// «página nueva»), sus cifras de 90 días y su tendencia; la parte de clics anónimos y la canibalización.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, clients, findings, jobs, projects, seoPlanItems, seoTopicQueries, seoTopics } from '@/lib/db/schema';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { ProjectSeoNav } from '../seo-nav';
import { competitorComparison } from '@/lib/seo/competencia/competencia';
import { PalabrasPanel, type OpportunityView, type TopicView } from './palabras-panel';
import { DemandaPanel } from './demanda-panel';
import { BriefsPanel } from './briefs-panel';
import { listBriefs } from '@/lib/seo/contenido/briefs';
import { getDemandView } from '@/lib/seo/demanda/demanda';

const OPP_KINDS = ['seo.topic_new_page', 'seo.topic_unclear_page', 'seo.striking_distance', 'seo.low_ctr'];

export default async function PalabrasPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [p] = await db
    .select({ id: projects.id, name: projects.name, clientId: projects.clientId, clientName: clients.name })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, user.tenantId)))
    .limit(1);
  if (!p) notFound();
  const [topics, props, canEdit, lastJobs, cannibal, oppRows, planRows] = await Promise.all([
    db.select().from(seoTopics).where(and(eq(seoTopics.projectId, projectId), eq(seoTopics.tenantId, user.tenantId))).orderBy(desc(sql`(${seoTopics.metrics}->>'impresiones')::float`)).limit(300),
    gscPropertiesForProject(user.tenantId, projectId),
    checkPermission('edit').then((r) => r.ok),
    db
      .select({ status: jobs.status, result: jobs.result, error: jobs.lastError, finishedAt: jobs.finishedAt })
      .from(jobs)
      .where(and(eq(jobs.tenantId, user.tenantId), eq(jobs.kind, 'seo.mapa.build'), eq(jobs.scopeId, projectId), lte(jobs.runAt, new Date())))
      .orderBy(desc(jobs.createdAt))
      .limit(1),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(findings)
      .where(and(eq(findings.projectId, projectId), eq(findings.source, 'seo.mapa:gsc'), eq(findings.status, 'abierto'), eq(findings.kind, 'seo.cannibalization'))),
    // Oportunidades del mapa (hallazgos abiertos) y la propuesta del plan en la que va cada una.
    db
      .select({ id: findings.id, kind: findings.kind, url: findings.url, query: findings.query, value: findings.value, evidence: findings.evidence })
      .from(findings)
      .where(and(eq(findings.projectId, projectId), eq(findings.tenantId, user.tenantId), eq(findings.source, 'seo.mapa:gsc'), eq(findings.status, 'abierto'), inArray(findings.kind, OPP_KINDS))),
    db
      .select({ title: seoPlanItems.title, status: seoPlanItems.status, findingIds: seoPlanItems.findingIds })
      .from(seoPlanItems)
      .where(and(eq(seoPlanItems.projectId, projectId), eq(seoPlanItems.tenantId, user.tenantId), inArray(seoPlanItems.status, ['pendiente', 'aprobada', 'hecha'])))
  ]);
  const planOf = new Map<string, { title: string; status: string }>();
  for (const r of planRows) for (const id of r.findingIds) if (!planOf.has(id)) planOf.set(id, { title: r.title, status: r.status });
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const weight = (o: { gain: number; valor: number | null }) => o.gain * (o.valor === null ? 1 : 0.6 + 0.2 * o.valor);
  const opps: OpportunityView[] = oppRows
    .map((f) => {
      const e = (f.evidence ?? {}) as Record<string, unknown>;
      return {
        id: f.id,
        kind: f.kind,
        url: f.url,
        query: f.query ?? '',
        gain: Number(f.value ?? 0),
        valor: num(e.valor),
        servicio: typeof e.servicio === 'string' ? e.servicio : null,
        impressions: num(e.impresiones),
        position: num(e.posicion),
        ctr: num(e.ctr),
        ctrExpected: num(e.ctrEsperado),
        plan: planOf.get(f.id) ?? null
      };
    })
    // Primero lo que más clics puede traer, pesado por el valor de negocio (si se sabe).
    .sort((a, b) => weight(b) - weight(a));
  const [comps, compJobs, comparison] = await Promise.all([
    p.clientId
      ? db.select().from(clientCompetitors).where(and(eq(clientCompetitors.clientId, p.clientId), eq(clientCompetitors.tenantId, user.tenantId))).orderBy(asc(clientCompetitors.status), desc(clientCompetitors.lastSeen))
      : Promise.resolve([]),
    db
      .select({ status: jobs.status, result: jobs.result, error: jobs.lastError })
      .from(jobs)
      .where(and(eq(jobs.tenantId, user.tenantId), eq(jobs.kind, 'seo.competencia.find'), eq(jobs.scopeId, projectId)))
      .orderBy(desc(jobs.createdAt))
      .limit(1),
    competitorComparison(user.tenantId, projectId)
  ]);
  const ids = topics.map((t) => t.id);
  const qs = ids.length
    ? await db.select().from(seoTopicQueries).where(inArray(seoTopicQueries.topicId, ids)).orderBy(desc(seoTopicQueries.impressions), asc(seoTopicQueries.query))
    : [];
  const byTopic = new Map<string, typeof qs>();
  for (const q of qs) byTopic.set(q.topicId, [...(byTopic.get(q.topicId) ?? []), q]);
  const view: TopicView[] = topics.map((t) => ({
    id: t.id,
    name: t.name,
    url: t.url,
    origin: t.origin,
    status: t.status,
    metrics: t.metrics,
    queries: (byTopic.get(t.id) ?? []).slice(0, 25).map((q) => ({ query: q.query, clicks: q.clicks, impressions: q.impressions, position: q.position }))
  }));
  const job = lastJobs[0];
  const [demand, briefs] = await Promise.all([getDemandView(user.tenantId, projectId), listBriefs(user.tenantId, projectId)]);
  const briefTopics = topics.filter((t) => t.status === 'activo' && (byTopic.get(t.id) ?? []).length).map((t) => ({ topicKey: t.topicKey, name: t.name, url: t.url, query: [...(byTopic.get(t.id) ?? [])].sort((a, b) => b.impressions - a.impressions)[0].query }));
  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader
        icon={KeyRound}
        title={`Palabras · ${p.name}`}
        description={
          <>
            {p.clientName ? `Cliente: ${p.clientName}. ` : ''}
            Las búsquedas por las que sale la web en Google (Search Console, 90 días), agrupadas en temas: cada uno con la página que Google le asigna o, si no hay ninguna clara, como «página nueva».
          </>
        }
      />
      <ProjectSeoNav projectId={projectId} active="palabras" />
      <PalabrasPanel
        projectId={projectId}
        topics={view}
        canEdit={canEdit}
        hasGsc={props.length > 0}
        job={job ? { status: job.status, result: (job.result ?? null) as Record<string, unknown> | null, error: job.error, finishedAt: job.finishedAt?.toISOString() ?? null } : null}
        cannibal={Number(cannibal[0]?.n ?? 0)}
        opportunities={opps}
        clientId={p.clientId}
        competitors={comps.map((c) => ({ id: c.id, name: c.name, domain: c.domain, status: c.status, kind: c.kind, source: c.source, evidence: c.evidence }))}
        compJob={compJobs[0] ? { status: compJobs[0].status, result: (compJobs[0].result ?? null) as Record<string, unknown> | null, error: compJobs[0].error } : null}
        comparison={comparison}
      />
      <DemandaPanel projectId={projectId} view={demand} canEdit={canEdit} />
      <BriefsPanel projectId={projectId} briefs={briefs} canEdit={canEdit} topics={briefTopics} />
    </PageContainer>
  );
}
