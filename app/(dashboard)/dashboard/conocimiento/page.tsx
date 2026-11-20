import { Library } from 'lucide-react';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { countByStatus, listArticles, listCategories } from '@/lib/core/knowledge';
import { isKbStatus, needsReview, type KbStatus } from '@/lib/core/knowledge-rules';
import { kbImportStatus, kbSpaceOptions } from '@/lib/operaciones/kb-import';
import { ConocimientoView, type ArticleRow } from './conocimiento-view';

export const dynamic = 'force-dynamic';

// Base de conocimiento (NÚCLEO, 20 nov 2026): lo que la agencia sabe hacer y resolver. Todo el equipo lee las publicadas
// y puede proponer entradas; Enric (admin) revisa las propuestas, escribe, publica e importa de ClickUp.
export default async function ConocimientoPage({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string; cat?: string }> }) {
  const user = await requirePagePermission('view');
  const isAdmin = (await checkPermission('admin')).ok;
  const sp = await searchParams;
  const requested = sp.estado && isKbStatus(sp.estado) ? sp.estado : null;
  // Sin permiso de admin solo se ven las publicadas.
  const status: KbStatus = isAdmin ? (requested ?? 'publicada') : 'publicada';
  const q = (sp.q ?? '').slice(0, 200);
  const [cats, counts, rows, spaces, importStatus] = await Promise.all([
    listCategories(user.tenantId, true),
    countByStatus(user.tenantId),
    listArticles(user.tenantId, { statuses: [status], q, categoryId: sp.cat && /^[0-9a-f-]{36}$/i.test(sp.cat) ? sp.cat : null }),
    isAdmin ? kbSpaceOptions(user.tenantId) : Promise.resolve([]),
    isAdmin ? kbImportStatus(user.tenantId) : Promise.resolve({ imported: 0 })
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const now = new Date();
  const data: ArticleRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    problem: r.problem,
    status: r.status,
    sourceType: r.sourceType,
    category: r.categoryId ? (catName.get(r.categoryId) ?? null) : null,
    tags: r.tags,
    requestedByName: r.requestedByName,
    timesUsed: r.timesUsed,
    helpful: r.helpfulCount,
    notHelpful: r.notHelpfulCount,
    linkCount: r.linkCount,
    updatedAt: r.updatedAt.toISOString(),
    needsReview: needsReview({ status: r.status, reviewedAt: r.reviewedAt, publishedAt: r.publishedAt }, now)
  }));

  return (
    <PageContainer className="space-y-5">
      <PageHeader
        icon={Library}
        title="Conocimiento"
        description="Lo que la agencia sabe hacer y resolver: procedimientos, soluciones y tutoriales con vídeo. Lo usan el equipo y los agentes para responder dudas sin esperar a Enric."
      />
      <ConocimientoView
        isAdmin={isAdmin}
        status={status}
        q={q}
        categoryId={sp.cat ?? ''}
        counts={counts}
        rows={data}
        categories={cats.map((c) => ({ id: c.id, name: c.name, archived: Boolean(c.archivedAt) }))}
        spaces={spaces}
        importedCount={importStatus.imported}
      />
    </PageContainer>
  );
}
