import { Compass } from 'lucide-react';
import { ClientesTabs } from '@/components/clientes-tabs';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { wireApp } from '@/lib/app-wiring';
import { planCostNote, strategyOverview } from '@/lib/estrategia/report';
import { getSettings, listEvents } from '@/lib/estrategia/store';
import { PROCESSES, addDays, madridNow } from '@/lib/estrategia/rules';
import { strategistQuality, strategistSettings } from '@/lib/estrategia/strategist';
import { PanelView } from './panel-view';

export const dynamic = 'force-dynamic';

const TABS = ['clientes', 'planes', 'calendario', 'calidad', 'ajustes'] as const;
const QUALITY_DAYS = [30, 90, 180];

// Panel propio del módulo Estrategia: clientes con seguimiento, planes con la frecuencia de cada proceso, calendario
// de la agencia (actualizaciones de Google, festivos), calidad del estratega (fase 2) y ajustes. Separado de
// Rendimiento y de Operaciones.
export default async function EstrategiaPage({ searchParams }: { searchParams: Promise<{ tab?: string; dias?: string }> }) {
  const user = await requirePagePermission('edit');
  wireApp();
  const { tab, dias } = await searchParams;
  const days = QUALITY_DAYS.includes(Number(dias)) ? Number(dias) : 90;
  const [overview, isAdmin, settings, strategist, quality] = await Promise.all([
    strategyOverview(user.tenantId),
    checkPermission('admin').then((r) => r.ok),
    getSettings(user.tenantId),
    strategistSettings(user.tenantId),
    strategistQuality(user.tenantId, days)
  ]);
  const events = await listEvents(user.tenantId, addDays(madridNow().date, -400));
  const names = new Map([...overview.rows.map((r) => [r.clientId, r.name] as const), ...overview.withoutPlan.map((c) => [c.id, c.name] as const)]);
  return (
    <PageContainer className="space-y-6">
      <ClientesTabs active="estrategia" />
      <PageHeader
        icon={Compass}
        title="Estrategia de los clientes"
        description="Qué se revisa de cada cliente y cada cuánto, según su plan: la web, la ficha de Google, palabras clave, objetivos y oportunidades, y las tareas que propone el estratega. Los planes y sus frecuencias se editan aquí; cada cliente puede tener ajustes propios en su ficha → Estrategia."
      />
      <PanelView
        initialTab={(TABS as readonly string[]).includes(tab ?? '') ? (tab as (typeof TABS)[number]) : 'clientes'}
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
        strategist={strategist}
        quality={{
          days: quality.days,
          dayOptions: QUALITY_DAYS,
          stats: quality.stats,
          analyses: quality.analyses,
          byClient: quality.byClient
            .map((c) => ({ clientId: c.clientId, name: names.get(c.clientId) ?? 'Cliente', analyses: c.analyses, costUsd: c.costUsd, total: c.stats.total, accepted: c.stats.accepted, rejected: c.stats.rejected, pending: c.stats.pending, acceptanceRate: c.stats.acceptanceRate, executionRate: c.stats.executionRate }))
            .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
        }}
      />
    </PageContainer>
  );
}
