// SEO → Fuentes de novedades (27 nov 2026, petición de Enric). Lo que lee la agencia cada 3 horas para estar al día:
// oficiales (Google, Bing), blogs y canales de las herramientas SEO de referencia y lo que añada un administrador (un RSS,
// una web o blog —su RSS se busca solo— o un canal de YouTube). Lo oficial avisa y va al resumen semanal; lo demás se
// guarda aparte como opinión. Verlo: lectura; cambiarlo: administradores.
import Link from 'next/link';
import { ArrowLeft, Rss } from 'lucide-react';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { listSeoSources } from '@/lib/seo/id/fuentes';
import { FuentesView } from './fuentes-view';

export const dynamic = 'force-dynamic';

export default async function FuentesPage() {
  const user = await requirePagePermission('view');
  const [sources, admin] = await Promise.all([listSeoSources(user.tenantId), checkPermission('admin')]);
  return (
    <PageContainer>
      <Link href="/dashboard/conocimiento/novedades" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Novedades
      </Link>
      <PageHeader
        icon={Rss}
        title="Fuentes de novedades SEO"
        description="Lo que la agencia lee cada 3 horas para estar al día, sin IA. Las oficiales (Google, Bing) avisan por Telegram de las actualizaciones y van al resumen semanal de la base de conocimiento; los blogs y canales de herramientas se guardan aparte como opinión, nunca como criterio. Puedes añadir un RSS, una web o blog (su RSS se busca solo) o un canal de YouTube."
      />
      <FuentesView sources={JSON.parse(JSON.stringify(sources))} canEdit={admin.ok} />
    </PageContainer>
  );
}
