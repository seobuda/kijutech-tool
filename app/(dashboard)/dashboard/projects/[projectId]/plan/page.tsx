// Proyecto → Plan de mejora (Hito 1 SEO, 23 nov 2026). Propuestas de trabajo hechas por reglas a partir de los hallazgos
// de Salud técnica (sin IA), ordenadas por gravedad e impacto en Google y ajustadas a las horas del proyecto. Al aprobar
// una, se crea el encargo y queda registrada su técnica y su hipótesis para medir después si funcionó.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { clients, projects } from '@/lib/db/schema';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { DISCARD_REASONS, listPlanItems, monthName, planSchedule } from '@/lib/seo/plan/plan';
import { whyLine } from '@/lib/seo/plan/rules';
import { techniqueLabel } from '@/lib/core/techniques';
import { ProjectSeoNav } from '../seo-nav';
import { PlanPanel, type PlanContext, type PlanItemView } from './plan-panel';
import { ResultadosPanel, type ResultView } from './resultados-panel';
import { listProjectInterventions } from '@/lib/core/interventions';

export default async function PlanPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [p] = await db
    .select({ id: projects.id, name: projects.name, clientId: projects.clientId, clientName: clients.name, monthlyHours: projects.monthlyHours })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, user.tenantId)))
    .limit(1);
  if (!p) notFound();
  const [items, canEdit, sched] = await Promise.all([listPlanItems(user.tenantId, projectId), checkPermission('edit').then((r) => r.ok), planSchedule(user.tenantId, projectId)]);
  const monthOf = new Map(sched.items.map((i) => [i.id, i.month]));
  // Parte 8: resultado de cada intervención (lo mide el núcleo cada día).
  const ints = (await listProjectInterventions(user.tenantId, projectId, 300)).filter((i) => i.domain === 'seo' && i.status !== 'cancelada');
  const results: ResultView[] = ints.map((i) => {
    const o = (i.outcome ?? {}) as { verdict?: string; effectPct?: number; reasons?: string[]; effective?: { source?: string }; done?: { status?: string }; checkpoints?: { days: number; metric?: string; reasons?: string[]; incrementalClicks?: number | null }[] };
    const last = o.checkpoints?.[o.checkpoints.length - 1];
    return {
      id: i.id,
      technique: i.technique,
      techniqueLabel: techniqueLabel(i.technique),
      urls: i.urls,
      status: i.status,
      doneAt: i.doneAt?.toISOString() ?? null,
      verdict: o.verdict ?? null,
      effectPct: typeof o.effectPct === 'number' ? o.effectPct : null,
      metric: last?.metric ?? (i.hypothesis?.metric as string | undefined) ?? null,
      reasons: last?.reasons ?? o.reasons ?? [],
      effectiveSource: o.effective?.source ?? null,
      done: o.done?.status ?? null,
      incrementalClicks: last?.incrementalClicks ?? null,
      days: last?.days ?? null
    };
  });
  const maxMonth = Math.max(0, ...sched.items.map((i) => i.month));
  const view: PlanItemView[] = items.map((i) => {
    const ev = i.evidence as { impressions?: number; gainPerMonth?: number; valor?: number | null; severity?: string; overHours?: boolean };
    const st = i.requestRef ? sched.status[i.requestRef] : undefined;
    return {
    id: i.id,
    title: i.title,
    description: i.description,
    technique: i.technique,
    techniqueLabel: techniqueLabel(i.technique),
    priority: i.priority,
    estHours: Number(i.estHours),
    urls: i.urls,
    overHours: Boolean(ev.overHours),
    impressions: Number(ev.impressions ?? 0),
    gainPerMonth: Number(ev.gainPerMonth ?? 0),
    why: whyLine(ev, Number(i.estHours)),
    hypothesis: i.hypothesis,
    status: i.status,
    requestUrl: i.requestUrl,
    requestError: i.requestError,
    decidedBy: i.decidedBy,
    decidedAt: i.decidedAt?.toISOString() ?? null,
    rejectNote: i.rejectNote,
    updatedAt: i.updatedAt.toISOString(),
    month: i.status === 'pendiente' ? (monthOf.get(i.id) ?? 0) : null,
    task: st ? { status: st.status ?? null, assigneeName: st.assigneeName ?? null, dueDate: st.dueDate ?? null, doneAt: st.doneAt } : null
    };
  });
  const ctx: PlanContext = {
    monthlyHours: sched.monthlyHours,
    usedThisMonth: sched.usedThisMonth,
    monthNames: Array.from({ length: maxMonth + 1 }, (_, k) => monthName(k)),
    lists: sched.options?.lists ?? [],
    members: sched.options?.members ?? [],
    defaults: { listId: sched.defaults?.listId ?? null, assigneeId: sched.defaults?.assigneeId ?? null, dueDate: sched.dueDate },
    discardReasons: { ...DISCARD_REASONS }
  };
  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader
        icon={ClipboardList}
        title={`Plan de mejora · ${p.name}`}
        description={
          <>
            {p.clientName ? `Cliente: ${p.clientName}. ` : ''}
            Lo que hay que hacer, agrupado en encargos y repartido por meses con las horas del proyecto: primero lo grave y lo que más puede traer para el negocio. Sale de la auditoría técnica y del mapa de palabras, y se rehace solo. Al aprobar una propuesta (revisando antes a quién va y para cuándo) se crea el encargo.
          </>
        }
      />
      <ProjectSeoNav projectId={projectId} active="plan" />
      <PlanPanel projectId={projectId} items={view} canEdit={canEdit} ctx={ctx} />
      <ResultadosPanel results={results} />
    </PageContainer>
  );
}
