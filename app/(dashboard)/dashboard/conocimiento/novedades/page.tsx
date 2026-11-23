// Conocimiento → Novedades (bitácora de I+D, núcleo; Hito 1 SEO, 23 nov 2026). Lo que publican las fuentes oficiales
// (hoy Google Search: panel de incidencias y blog de Search Central), leído cada 3 horas sin IA. Las actualizaciones de
// Google avisan al momento por Telegram; cada lunes la IA resume la semana como propuesta de entrada de la base.
import Link from 'next/link';
import { ArrowLeft, Newspaper } from 'lucide-react';
import { requirePagePermission } from '@/lib/auth/permissions';
import { Badge, EmptyState, PageContainer, PageHeader, Section } from '@/components/ui/page';
import { listFeedItems, type FeedKind } from '@/lib/core/knowledge-feed';

export const dynamic = 'force-dynamic';

const KIND: Record<FeedKind, { label: string; tone: 'danger' | 'warning' | 'info' | 'neutral' }> = {
  core_update: { label: 'Actualización de Google', tone: 'danger' },
  incidencia: { label: 'Incidencia', tone: 'warning' },
  documentacion: { label: 'Documentación', tone: 'info' },
  novedad: { label: 'Novedad', tone: 'neutral' }
};
const SOURCE: Record<string, string> = { search_status: 'Panel de incidencias de Google Search', search_central_blog: 'Blog de Search Central' };
const fmt = (d: Date | null) => (d ? d.toLocaleDateString('es-ES', { dateStyle: 'medium' }) : '—');

export default async function NovedadesPage() {
  const user = await requirePagePermission('view');
  const items = await listFeedItems(user.tenantId, null, 80);
  const now = Date.now();
  const active = items.filter((i) => i.kind === 'core_update' && i.startsAt && !i.endsAt && now - i.startsAt.getTime() < 30 * 86_400_000);
  return (
    <PageContainer>
      <Link href="/dashboard/conocimiento" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Conocimiento
      </Link>
      <PageHeader
        icon={Newspaper}
        title="Novedades de Google"
        description="La bitácora de I+D: lo que publica Google en sus fuentes oficiales, leído cada 3 horas. Las actualizaciones te llegan al momento por Telegram y cada lunes se propone una entrada de la base con el resumen de la semana."
      />
      {active.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive-soft p-4 text-sm">
          <p className="font-medium">En curso ahora: {active.map((a) => a.title).join(' · ')}</p>
          <p className="mt-1 text-muted-foreground">Mientras dura, los cambios de posiciones y tráfico de los clientes pueden deberse a la actualización y no a nuestro trabajo.</p>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="Aún no hay novedades"
          description="La vigilancia empieza sola en cuanto se usa SEO en la cuenta (por ejemplo, al pasar la primera auditoría de Salud técnica) y se llena en las 3 horas siguientes."
        />
      ) : (
        <Section title={`Últimas ${items.length}`}>
          <ul className="divide-y">
            {items.map((i) => {
              const k = KIND[i.kind as FeedKind] ?? KIND.novedad;
              return (
                <li key={i.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={k.tone}>{k.label}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {fmt(i.publishedAt)}
                      {i.kind === 'core_update' || i.kind === 'incidencia' ? (i.endsAt ? ` → ${fmt(i.endsAt)}` : ' · sin terminar') : ''} · {SOURCE[i.sourceKey] ?? i.sourceKey}
                    </span>
                    {i.articleId && (
                      <Link href={`/dashboard/conocimiento/${i.articleId}`} className="text-xs underline underline-offset-2">
                        en el resumen semanal
                      </Link>
                    )}
                  </div>
                  {i.url ? (
                    <a href={i.url} target="_blank" rel="noreferrer" className="text-sm font-medium underline-offset-2 hover:underline">
                      {i.title}
                    </a>
                  ) : (
                    <p className="text-sm font-medium">{i.title}</p>
                  )}
                  {i.summary && <p className="line-clamp-3 text-sm text-muted-foreground">{i.summary}</p>}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </PageContainer>
  );
}
