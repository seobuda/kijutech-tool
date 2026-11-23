import { notFound } from 'next/navigation';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer } from '@/components/ui/page';
import { CrumbLabel } from '@/components/app-shell/crumb-label';
import { getArticle, listCategories } from '@/lib/core/knowledge';
import { needsReview, type KbLink } from '@/lib/core/knowledge-rules';
import { ArticleEditor, type ArticleData } from '../article-editor';

export const dynamic = 'force-dynamic';

// Una entrada de la base de conocimiento. El equipo lee las publicadas; Enric (admin) edita, revisa y publica.
export default async function EntradaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission('view');
  const isAdmin = (await checkPermission('admin')).ok;
  const { id } = await params;
  const a = await getArticle(user.tenantId, id);
  if (!a || (!isAdmin && a.status !== 'publicada')) notFound();
  const cats = await listCategories(user.tenantId, true);
  const notes = (Array.isArray(a.editNotes) ? a.editNotes : []) as { at: string; instruction: string }[];
  const data: ArticleData = {
    id: a.id,
    title: a.title,
    problem: a.problem,
    solution: a.solution,
    categoryId: a.categoryId ?? '',
    tags: a.tags,
    links: (a.links as KbLink[]) ?? [],
    status: a.status,
    sourceType: a.sourceType,
    sourceUrl: a.sourceUrl,
    requestedByName: a.requestedByName,
    requestText: isAdmin ? a.requestText : null,
    editNotes: isAdmin ? notes.map((n) => ({ at: n.at, instruction: n.instruction })) : [],
    timesUsed: a.timesUsed,
    helpful: a.helpfulCount,
    notHelpful: a.notHelpfulCount,
    updatedAt: a.updatedAt.toISOString(),
    reviewedAt: a.reviewedAt?.toISOString() ?? null,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    needsReview: needsReview({ status: a.status, reviewedAt: a.reviewedAt, publishedAt: a.publishedAt })
  };
  return (
    <PageContainer>
      <CrumbLabel label={a.title} />
      <ArticleEditor data={data} isAdmin={isAdmin} categories={cats.map((c) => ({ id: c.id, name: c.name, archived: Boolean(c.archivedAt) }))} />
    </PageContainer>
  );
}
