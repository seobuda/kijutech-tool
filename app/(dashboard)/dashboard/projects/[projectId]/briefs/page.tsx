// Proyecto → Trabajo → Briefs y artículos (plan de UX del SEO v2, fase 1, 27 nov 2026): antes era una sub-vista escondida
// en Palabras. Brief con la SERP real → artículo completo con IA → borrador en WordPress → publicado y medido.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { ArrowLeft, FileText } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { clients, projects, seoTopicQueries, seoTopics } from '@/lib/db/schema';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { listBriefs } from '@/lib/seo/contenido/briefs';
import { ProjectSeoNav } from '../seo-nav';
import { BriefsPanel } from '../palabras/briefs-panel';

export default async function BriefsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [p] = await db
    .select({ id: projects.id, name: projects.name, clientName: clients.name })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, user.tenantId)))
    .limit(1);
  if (!p) notFound();
  const [briefs, canEdit, topics] = await Promise.all([
    listBriefs(user.tenantId, projectId),
    checkPermission('edit').then((r) => r.ok),
    db
      .select({ id: seoTopics.id, topicKey: seoTopics.topicKey, name: seoTopics.name, url: seoTopics.url })
      .from(seoTopics)
      .where(and(eq(seoTopics.projectId, projectId), eq(seoTopics.tenantId, user.tenantId), eq(seoTopics.status, 'activo')))
      .orderBy(desc(sql`(${seoTopics.metrics}->>'impresiones')::float`))
      .limit(150)
  ]);
  // La búsqueda principal de cada tema (la de más impresiones), en una sola consulta.
  const top = topics.length
    ? ((await db
        .selectDistinctOn([seoTopicQueries.topicId], { topicId: seoTopicQueries.topicId, query: seoTopicQueries.query })
        .from(seoTopicQueries)
        .where(inArray(seoTopicQueries.topicId, topics.map((t) => t.id)))
        .orderBy(seoTopicQueries.topicId, desc(seoTopicQueries.impressions))) as { topicId: string; query: string }[])
    : [];
  const queryOf = new Map(top.map((t) => [t.topicId, t.query]));
  const briefTopics = topics.filter((t) => queryOf.has(t.id)).map((t) => ({ topicKey: t.topicKey, name: t.name, url: t.url, query: queryOf.get(t.id)! }));
  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader icon={FileText} title={`Briefs y artículos · ${p.clientName ?? p.name}`} description="Elige un tema o una búsqueda: el brief sale de la SERP real; el artículo, redactado con IA; y el borrador va a WordPress para revisarlo y publicarlo." />
      <ProjectSeoNav projectId={projectId} active="briefs" />
      <BriefsPanel projectId={projectId} briefs={briefs} canEdit={canEdit} topics={briefTopics} />
    </PageContainer>
  );
}
