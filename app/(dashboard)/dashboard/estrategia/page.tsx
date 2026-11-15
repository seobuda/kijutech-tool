import { Compass } from 'lucide-react';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { wireApp } from '@/lib/app-wiring';
import { planCostNote, strategyOverview } from '@/lib/estrategia/report';
import { getSettings, listEvents } from '@/lib/estrategia/store';
import { PROCESSES, addDays, madridNow } from '@/lib/estrategia/rules';
import { PanelView } from './panel-view';

export const dynamic = 'force-dynamic';

// Panel propio del módulo Estrategia (fase 1): clientes con seguimiento, planes con la frecuencia de cada proceso,
// calendario de la agencia (actualizaciones de Google, festivos) y ajustes. Separado de Rendimiento y de Operaciones.
export default async function EstrategiaPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePagePermission('edit');
  wireApp();
  const [{ tab }, overview, isAdmin, settings] = await Promise.all([searchParams, strategyOverview(user.tenantId), checkPermission('admin').then((r) => r.ok), getSettings(user.tenantId)]);
  const events = await listEvents(user.tenantId, addDays(madridNow().date, -400));
  return (
    <PageContainer className="space-y-6">
      <PageHeader
        icon={Compass}
        title="Estrategia de los clientes"
        description="Qué se revisa de cada cliente y cada cuánto, según su plan: la web, la ficha de Google, palabras clave, objetivos y oportunidades. Los planes y sus frecuencias se editan aquí; cada cliente puede tener ajustes propios en su ficha → Estrategia."
      />
      <PanelView
        initialTab={tab === 'planes' || tab === 'calendario' || tab === 'ajustes' ? tab : 'clientes'}
        isAdmin={isAdmin}
        rows={overview.rows}
        withoutPlan={overview.withoutPlan}
        plans={overview.plans.map((p) => ({ id: p.id, key: p.key, name: p.name, description: p.description, processes: p.processes, cost: planCostNote(p.processes), clients: overview.rows.filter((r) => r.planId === p.id).length }))}
        processes={PROCESSES.map((p) => ({ key: p.key, label: p.label, description: p.description, cost: p.cost, frequencies: p.frequencies, phase: p.phase, needs: p.needs }))}
        events={events.map((e) => ({ id: e.id, date: e.date, endDate: e.endDate, kind: e.kind, title: e.title, notes: e.notes ?? '', source: e.source }))}
        settings={{
          onTrackPct: settings.onTrackPct,
          atRiskPct: settings.atRiskPct,
          graceDays: settings.graceDays,
          strikingFrom: settings.strikingFrom,
          strikingTo: settings.strikingTo,
          minImpressions: settings.minImpressions,
          alertsEnabled: settings.alertsEnabled,
          askUrl: settings.askUrl,
          trackDays: settings.trackDays,
          aiMonthlyCapUsd: Number(settings.aiMonthlyCapUsd)
        }}
      />
    </PageContainer>
  );
}
