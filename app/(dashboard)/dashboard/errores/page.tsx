import { Bug } from 'lucide-react';
import { requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { wireApp } from '@/lib/app-wiring';
import { errorEvents, errorSources, errorStats, getErrorGroup, getErrorSettings, listErrorGroups, type GroupFilter } from '@/lib/core/errors';
import { SEVERITIES, STATUSES, type Diagnosis } from '@/lib/core/error-rules';
import { ErroresView, type GroupRow, type GroupDetail } from './errores-view';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS = ['abiertos', ...STATUSES, 'todos'] as const;

// Registro central de errores (núcleo, 17 nov 2026): todo lo que falla en la herramienta, agrupado, con su detalle, su
// estado y el diagnóstico del Técnico de mantenimiento. Solo administración.
export default async function ErroresPage({ searchParams }: { searchParams: Promise<{ estado?: string; modulo?: string; gravedad?: string; q?: string; id?: string }> }) {
  const user = await requirePagePermission('admin');
  wireApp();
  const sp = await searchParams;
  const filter: GroupFilter = {
    status: (STATUS_FILTERS as readonly string[]).includes(sp.estado ?? '') ? (sp.estado as GroupFilter['status']) : 'abiertos',
    source: sp.modulo?.slice(0, 40) || undefined,
    severity: (SEVERITIES as string[]).includes(sp.gravedad ?? '') ? (sp.gravedad as GroupFilter['severity']) : undefined,
    q: sp.q?.slice(0, 100) || undefined
  };
  const [stats, groups, sources, settings] = await Promise.all([errorStats(user.tenantId), listErrorGroups(user.tenantId, filter), errorSources(user.tenantId), getErrorSettings(user.tenantId)]);

  let detail: GroupDetail | null = null;
  if (sp.id) {
    const g = await getErrorGroup(user.tenantId, sp.id.slice(0, 40));
    if (g) {
      const evs = await errorEvents(g.id, 15);
      detail = {
        ...toRow(g),
        note: g.note ?? '',
        diagnosis: (g.diagnosis as Diagnosis | null) ?? null,
        diagnosisAt: g.diagnosisAt?.toISOString() ?? null,
        diagnosisRequestedAt: g.diagnosisRequestedAt?.toISOString() ?? null,
        resolvedBy: g.resolvedBy,
        resolvedAt: g.resolvedAt?.toISOString() ?? null,
        reopenedCount: g.reopenedCount,
        events: evs.map((e) => ({
          id: e.id,
          at: e.createdAt.toISOString(),
          message: e.message,
          stack: e.stack,
          userMessage: e.userMessage,
          context: JSON.stringify(e.context ?? {}, null, 2),
          actor: e.actor,
          channel: e.channel,
          path: e.path
        }))
      };
    }
  }

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        icon={Bug}
        title="Errores de la herramienta"
        description="Todo lo que falla (servidor, IA, ClickUp, Telegram, agentes y pantallas) queda aquí agrupado, con cuántas veces pasó y su detalle. El Técnico de mantenimiento lo diagnostica leyendo el código y propone el arreglo; un error resuelto que vuelve a pasar se reabre solo y te avisa."
      />
      <ErroresView
        stats={stats}
        groups={groups.map(toRow)}
        sources={sources}
        filter={{ status: filter.status ?? 'abiertos', source: filter.source ?? '', severity: filter.severity ?? '', q: filter.q ?? '' }}
        settings={settings}
        detail={detail}
      />
    </PageContainer>
  );
}

function toRow(g: Awaited<ReturnType<typeof listErrorGroups>>[number]): GroupRow {
  return {
    id: g.id,
    title: g.title,
    source: g.source,
    area: g.area,
    severity: g.severity,
    status: g.status,
    occurrences: g.occurrences,
    firstSeen: g.firstSeen.toISOString(),
    lastSeen: g.lastSeen.toISOString(),
    diagnosed: Boolean(g.diagnosis),
    diagnosing: Boolean(g.diagnosisRequestedAt && (!g.diagnosisAt || g.diagnosisAt < g.diagnosisRequestedAt)),
    system: g.tenantId === null
  };
}
