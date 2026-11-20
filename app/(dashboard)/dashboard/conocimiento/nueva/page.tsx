import { requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer } from '@/components/ui/page';
import { listCategories } from '@/lib/core/knowledge';
import { ArticleEditor } from '../article-editor';

export const dynamic = 'force-dynamic';

// Nueva entrada de la base de conocimiento (solo admin: publica Enric).
export default async function NuevaEntradaPage() {
  const user = await requirePagePermission('admin');
  const cats = await listCategories(user.tenantId, true);
  return (
    <PageContainer>
      <ArticleEditor data={null} isAdmin categories={cats.map((c) => ({ id: c.id, name: c.name, archived: Boolean(c.archivedAt) }))} />
    </PageContainer>
  );
}
