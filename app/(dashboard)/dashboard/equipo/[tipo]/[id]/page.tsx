import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getTenantRoleNames, requirePagePermission } from '@/lib/auth/permissions';
import { Badge, PageContainer, Section, StatCard } from '@/components/ui/page';
import { MemberAvatar } from '@/components/equipo/member-avatar';
import { AvatarEditor } from '@/components/equipo/avatar-editor';
import { DepartmentSelect } from '@/components/equipo/department-select';
import { activityOf, getActivityToday, getTeamOrg } from '@/lib/equipo/team';
import { getAgentsSummary, getMyProfile, getMyStats, safeBlock } from '@/lib/inicio/panel';
import { agentMonthSpend, listAgents, listDepartments } from '@/lib/agentes/store';
import { ActivityFeed } from '../../activity-feed';

export const dynamic = 'force-dynamic';

// Ficha de un miembro del equipo (fase 3 UX, 21 nov 2026): la misma ficha para personas y agentes, con su foto o
// avatar, su departamento, su estado ahora, sus cifras y lo que ha hecho hoy. Administración ve cualquiera; cada
// persona, solo la suya. Lo que ya tiene su pantalla (horario, instrucciones del agente…) se enlaza, no se duplica.
export default async function MiembroPage({ params }: { params: Promise<{ tipo: string; id: string }> }) {
  const user = await requirePagePermission('view');
  const { tipo, id } = await params;
  if ((tipo !== 'persona' && tipo !== 'agente') || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const roles = await getTenantRoleNames(user.id);
  const isSuper = roles.includes('super_admin');
  const isAdmin = isSuper || roles.includes('admin');
  const me = await getMyProfile(user.tenantId, user.id);
  const isMe = tipo === 'persona' && me?.id === id;
  if (!isAdmin && !isMe) redirect('/dashboard/equipo');

  const [org, depts, activity] = await Promise.all([
    getTeamOrg(user.tenantId, { withDetail: isAdmin }),
    listDepartments(user.tenantId),
    safeBlock(user.tenantId, 'actividad del miembro', () => getActivityToday(user.tenantId, { limit: 200 }))
  ]);
  const m = org.all.find((x) => x.kind === tipo && x.id === id);
  if (!m) notFound();
  const dept = depts.find((d) => d.key === m.deptKey);
  const mine = activity ? activityOf(activity, m) : null;

  return (
    <PageContainer className="space-y-6">
      <Link href="/dashboard/equipo" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Equipo
      </Link>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs sm:flex-row sm:items-start">
        <MemberAvatar name={m.name} kind={m.kind} avatarUrl={m.avatarUrl} initials={m.initials} hue={m.hue} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{m.name}</h1>
            <Badge tone={m.kind === 'agente' ? 'info' : 'neutral'}>{m.kind === 'agente' ? 'IA' : 'Humano'}</Badge>
            {m.isHead && <Badge tone="brand">Jefe de {dept?.name ?? 'departamento'}</Badge>}
            {!m.active && <Badge>Apagado</Badge>}
          </div>
          {m.role && <p className="max-w-3xl text-sm text-muted-foreground text-pretty">{m.role}</p>}
          <p className="text-sm">
            <span className="text-muted-foreground">Ahora:</span> {m.status.label}
            {m.status.detail ? ` · ${m.status.detail}` : ''}
            {' · '}
            <span className="text-muted-foreground">Departamento:</span> {dept?.name ?? 'sin departamento'}
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
            {(isAdmin || isMe) && <AvatarEditor kind={m.kind} id={m.id} hasPhoto={Boolean(m.avatarUrl)} />}
            {isAdmin && m.kind === 'persona' && <DepartmentSelect profileId={m.id} value={m.deptKey} options={depts.filter((d) => d.active).map((d) => ({ key: d.key, name: d.name }))} />}
            {isAdmin && m.kind === 'agente' && (
              <span className="text-sm text-muted-foreground">El departamento de un agente se cambia en sus instrucciones.</span>
            )}
          </div>
        </div>
      </section>

      {m.kind === 'persona' ? (
        <PersonBlocks tenantId={user.tenantId} clickupUserId={m.clickupUserId} isAdmin={isAdmin} isMe={isMe} />
      ) : (
        <AgentBlocks tenantId={user.tenantId} agentKey={m.agentKey!} withCost={isSuper} />
      )}

      <Section title="Hoy" description={m.kind === 'agente' ? 'Trabajos, respuestas y propuestas de hoy.' : 'Lo que ha hecho hoy desde Telegram.'}>
        <div className="p-4">
          {mine ? <ActivityFeed items={mine} empty="Nada todavía hoy." /> : <p className="text-sm text-muted-foreground">No se ha podido cargar la actividad.</p>}
        </div>
      </Section>
    </PageContainer>
  );
}

function Links({ links }: { links: { href: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline">
          {l.label} <ExternalLink className="size-3" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

async function PersonBlocks({ tenantId, clickupUserId, isAdmin, isMe }: { tenantId: string; clickupUserId: string | null; isAdmin: boolean; isMe: boolean }) {
  const s = clickupUserId ? await safeBlock(tenantId, 'cifras del miembro', () => getMyStats(tenantId, clickupUserId)) : null;
  const pct = (v: number | null) => (v === null ? '—' : `${v} %`);
  const links = [
    ...(isAdmin
      ? [
          { href: '/dashboard/operaciones/equipo', label: 'Horario y ficha completa' },
          { href: '/dashboard/operaciones/jornada', label: 'Jornada' },
          { href: '/dashboard/operaciones/tiempos', label: 'Tiempos' }
        ]
      : []),
    ...(isMe ? [{ href: '/dashboard/operaciones/mi-panel', label: 'Mi panel' }, { href: '/dashboard/mis-tareas', label: 'Mis tareas' }] : [])
  ];
  return (
    <Section title="Cómo va (7 días)" description="Cifras propias, sin comparar con nadie.">
      <div className="space-y-4 p-4">
        {!clickupUserId ? (
          <p className="text-sm text-muted-foreground">Esta ficha no está enlazada a ClickUp: todavía no hay cifras.</p>
        ) : !s ? (
          <p className="text-sm text-muted-foreground">No se han podido cargar las cifras.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Terminadas" value={s.finished} />
            <StatCard label="Entregadas a tiempo" value={s.completed ? `${s.onTime} de ${s.completed}` : '—'} />
            <StatCard label="Dentro del margen" value={pct(s.pctInside)} />
            <StatCard label="Precisión estimando" value={pct(s.precision)} hint={s.pendingJustify ? `${s.pendingJustify} tiempo(s) por explicar` : undefined} />
          </div>
        )}
        {links.length > 0 && <Links links={links} />}
      </div>
    </Section>
  );
}

async function AgentBlocks({ tenantId, agentKey, withCost }: { tenantId: string; agentKey: string; withCost: boolean }) {
  const agents = await listAgents(tenantId);
  const a = agents.find((x) => x.key === agentKey);
  if (!a) return null;
  const [summary, spent] = await Promise.all([
    a.kind === 'principal' ? safeBlock(tenantId, 'acierto del agente', () => getAgentsSummary(tenantId)) : Promise.resolve(null),
    withCost ? safeBlock(tenantId, 'gasto del agente', () => agentMonthSpend(tenantId, a.key)) : Promise.resolve(null)
  ]);
  const budget = a.monthlyBudgetUsd !== null ? Number(a.monthlyBudgetUsd) : null;
  return (
    <Section title="Cómo trabaja" description="Su configuración vive en Agentes; aquí, el resumen.">
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Modelo" value={<span className="text-base">{a.model ?? 'el de por defecto'}</span>} />
          <StatCard label="Herramientas" value={a.tools.length} />
          {summary && (
            <StatCard
              label="Acierto (30 días)"
              value={summary.acceptance === null ? '—' : `${Math.round(summary.acceptance * 100)} %`}
              hint={summary.decided30 ? `${summary.approved30} aprobadas · ${summary.corrected30} corregidas · ${summary.rejected30} rechazadas` : 'Sin decisiones todavía'}
            />
          )}
          {withCost && spent !== null && (
            <StatCard label="Gasto este mes" value={`${spent.toFixed(2).replace('.', ',')} $`} hint={budget !== null ? `Presupuesto ${budget.toFixed(2).replace('.', ',')} $` : 'Sin presupuesto propio'} />
          )}
        </div>
        <Links
          links={[
            { href: `/dashboard/agentes?editar=${a.key}`, label: 'Instrucciones y herramientas' },
            { href: '/dashboard/agentes/trabajos', label: 'Trabajos' },
            { href: '/dashboard/agentes/conversaciones', label: 'Conversaciones' }
          ]}
        />
      </div>
    </Section>
  );
}
