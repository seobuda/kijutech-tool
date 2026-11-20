// Inicio de administración: arriba lo que espera de ti; debajo, una tarjeta por área (clientes, equipo, agentes, sistema).
// Lo accionable primero, nunca un muro de gráficas. Cada tarjeta carga por su cuenta (Suspense), así la página se pinta
// al momento y lo que tarda (las tareas de ClickUp) llega después con su indicador.
import Link from 'next/link';
import { Suspense } from 'react';
import { AlertTriangle, Bot, Building2, CheckCircle2, Cog, Home, Inbox, UsersRound } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { getAgentsSummary, getClientsSummary, getTeamNow, getWaiting, safeBlock } from '@/lib/inicio/panel';
import { waitLabel } from '@/lib/operaciones/inbox';
import { STATUS_ICON, STATUS_LABEL, type DayStatus } from '@/lib/operaciones/jornada-core';
import { getClickUpConnection } from '@/lib/operaciones/queries';
import { getTeamToday } from '@/lib/operaciones/team-today';
import { errorStats } from '@/lib/core/errors';
import { Dot, greeting, HomeCard, Loading, todayLabel, Unavailable } from './parts';

export function AdminHome({ tenantId, firstName, withCosts }: { tenantId: string; firstName: string; withCosts: boolean }) {
  return (
    <PageContainer className="space-y-6">
      <PageHeader icon={Home} title={`${greeting()}, ${firstName}`} description={`${todayLabel()}. Lo que espera de ti y cómo va cada área hoy.`} />

      <Suspense fallback={<HomeCard title="Lo que espera de ti" icon={Inbox}><Loading text="Mirando qué está pendiente…" /></HomeCard>}>
        <WaitingBlock tenantId={tenantId} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<HomeCard title="Clientes" icon={Building2}><Loading text="Calculando el semáforo…" /></HomeCard>}>
          <ClientsCard tenantId={tenantId} />
        </Suspense>
        <HomeCard title="Equipo hoy" icon={UsersRound} href="/dashboard/operaciones/equipo-hoy" linkLabel="Ver el equipo" testId="inicio-equipo">
          <Suspense fallback={<Loading text="Mirando la jornada…" />}>
            <TeamNowBlock tenantId={tenantId} />
          </Suspense>
          <div className="mt-4 border-t pt-3">
            <Suspense fallback={<Loading text="Cargando las tareas de hoy desde ClickUp…" />}>
              <TeamTasksBlock tenantId={tenantId} />
            </Suspense>
          </div>
        </HomeCard>
        <Suspense fallback={<HomeCard title="Agentes" icon={Bot}><Loading text="Contando la actividad…" /></HomeCard>}>
          <AgentsCard tenantId={tenantId} />
        </Suspense>
        <Suspense fallback={<HomeCard title="Sistema" icon={Cog}><Loading text="Revisando el sistema…" /></HomeCard>}>
          <SystemCard tenantId={tenantId} withCosts={withCosts} />
        </Suspense>
      </div>
    </PageContainer>
  );
}

// --- Lo que espera de ti --------------------------------------------------------------------------------------

async function WaitingBlock({ tenantId }: { tenantId: string }) {
  const items = await safeBlock(tenantId, 'lo que espera de ti', () => getWaiting(tenantId));
  if (!items) {
    return (
      <HomeCard title="Lo que espera de ti" icon={Inbox}>
        <Unavailable what="lo pendiente" />
      </HomeCard>
    );
  }
  const pending = items
    .filter((i) => i.count > 0)
    .sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)) || (a.oldest?.getTime() ?? Infinity) - (b.oldest?.getTime() ?? Infinity));
  const total = pending.reduce((a, i) => a + i.count, 0);
  return (
    <HomeCard title={total ? `Lo que espera de ti · ${total}` : 'Lo que espera de ti'} icon={Inbox} href="/dashboard/operaciones/bandeja" linkLabel="Ir a Mi bandeja" testId="inicio-pendiente">
      {pending.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" aria-hidden />
          Nada espera tu decisión ahora mismo. Cuando el equipo o los agentes necesiten algo, aparecerá aquí.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {pending.map((i) => (
            <li key={i.key}>
              <Link
                href={i.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring',
                  i.urgent && 'border-destructive/40 bg-destructive-soft/40'
                )}
              >
                <span className={cn('min-w-8 text-center text-xl font-semibold tabular-nums', i.urgent ? 'text-destructive' : 'text-foreground')}>{i.count}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{i.label}</span>
                  {i.oldest && <span className="block text-xs text-muted-foreground">Lo más antiguo espera {waitLabel(i.oldest)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}

// --- Clientes ---------------------------------------------------------------------------------------------------

async function ClientsCard({ tenantId }: { tenantId: string }) {
  const s = await safeBlock(tenantId, 'clientes', () => getClientsSummary(tenantId));
  return (
    <HomeCard title="Clientes" icon={Building2} href="/dashboard/clientes" linkLabel="Ver clientes" testId="inicio-clientes">
      {!s ? (
        <Unavailable what="el semáforo de clientes" />
      ) : s.total === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay clientes activos. <Link href="/dashboard/clientes?nuevo=1" className="text-brand underline-offset-2 hover:underline">Crea el primero</Link>.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5"><Dot tone="red" />{s.red} sin actividad</span>
            <span className="flex items-center gap-1.5"><Dot tone="amber" />{s.amber} sin planificar</span>
            <span className="flex items-center gap-1.5"><Dot tone="green" />{s.green} al día</span>
            {s.gray > 0 && <span className="flex items-center gap-1.5 text-muted-foreground"><Dot tone="gray" />{s.gray} sin datos</span>}
          </div>
          {s.attention.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {s.attention.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/clientes/${c.id}`} className="flex items-start gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent">
                    <span className="mt-1.5"><Dot tone={c.state} /></span>
                    <span className="min-w-0">
                      <span className="font-medium">{c.name}</span>
                      {c.note && <span className="block text-xs text-muted-foreground">{c.note}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ningún cliente en alerta.</p>
          )}
        </div>
      )}
    </HomeCard>
  );
}

// --- Equipo ----------------------------------------------------------------------------------------------------

const STATUS_ORDER: DayStatus[] = ['trabajando', 'descanso', 'comida', 'fuera', 'sin_empezar', 'terminado', 'ausente'];

async function TeamNowBlock({ tenantId }: { tenantId: string }) {
  const t = await safeBlock(tenantId, 'jornada del equipo', () => getTeamNow(tenantId));
  if (!t) return <Unavailable what="la jornada del equipo" />;
  if (!t.enabled || t.people.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        La jornada no está activada o no hay fichas activas. Se configura en{' '}
        <Link href="/dashboard/operaciones/automatizaciones" className="text-brand underline-offset-2 hover:underline">Automatizaciones</Link>.
      </p>
    );
  }
  const people = [...t.people].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  return (
    <ul className="space-y-1.5" aria-label="Estado de cada persona">
      {people.map((p) => (
        <li key={p.name} className="flex items-baseline gap-2 text-sm">
          <span aria-hidden>{STATUS_ICON[p.status]}</span>
          <span className="font-medium">{p.name}</span>
          <span className="min-w-0 truncate text-muted-foreground">
            {STATUS_LABEL[p.status]}
            {p.task && p.status === 'trabajando' ? ` · ${p.task}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

async function TeamTasksBlock({ tenantId }: { tenantId: string }) {
  const conn = await safeBlock(tenantId, 'conexión de ClickUp', () => getClickUpConnection(tenantId));
  if (!conn) {
    return <p className="text-sm text-muted-foreground">Conecta ClickUp en Ajustes para ver las tareas de hoy y las vencidas.</p>;
  }
  const team = await safeBlock(tenantId, 'tareas del equipo', () => getTeamToday(tenantId));
  if (!team) return <Unavailable what="las tareas de ClickUp" />;
  const today = team.members.reduce((a, m) => a + m.today.length, 0);
  const overdue = team.members.reduce((a, m) => a + m.overdue.length, 0);
  const late = team.members.filter((m) => m.overdue.length > 0).sort((a, b) => b.overdue.length - a.overdue.length).slice(0, 4);
  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className="font-semibold tabular-nums">{today}</span> tareas para hoy ·{' '}
        <span className={cn('font-semibold tabular-nums', overdue > 0 && 'text-destructive')}>{overdue}</span> vencidas
      </p>
      {late.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <AlertTriangle className="size-3.5 text-warning-strong" aria-hidden />
          {late.map((m) => (
            <span key={m.member.id}>
              {m.member.username}: {m.overdue.length}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

// --- Agentes ---------------------------------------------------------------------------------------------------

async function AgentsCard({ tenantId }: { tenantId: string }) {
  const s = await safeBlock(tenantId, 'agentes', () => getAgentsSummary(tenantId));
  return (
    <HomeCard title="Agentes" icon={Bot} href="/dashboard/agentes" linkLabel="Ver agentes" testId="inicio-agentes">
      {!s ? (
        <Unavailable what="la actividad de los agentes" />
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Acciones hoy</dt>
            <dd className="text-xl font-semibold tabular-nums">{s.today}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Acierto (30 días)</dt>
            <dd className="text-xl font-semibold tabular-nums">{s.acceptance === null ? '—' : `${Math.round(s.acceptance * 100)} %`}</dd>
            {s.decided30 > 0 && (
              <dd className="text-xs text-muted-foreground">
                {s.approved30} aprobadas · {s.corrected30} corregidas · {s.rejected30} rechazadas
              </dd>
            )}
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">Dudas del equipo hoy</dt>
            <dd>
              {s.questionsToday === 0 ? (
                'Ninguna todavía.'
              ) : (
                <>
                  <span className="font-semibold tabular-nums">{s.questionsToday}</span>, {s.questionsWithoutEnric} resueltas sin ti
                </>
              )}
            </dd>
          </div>
        </dl>
      )}
    </HomeCard>
  );
}

// --- Sistema -----------------------------------------------------------------------------------------------------

const usd = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;

async function SystemCard({ tenantId, withCosts }: { tenantId: string; withCosts: boolean }) {
  const [errors, ai] = await Promise.all([
    safeBlock(tenantId, 'errores', () => errorStats(tenantId)),
    // Solo super_admin ve los costes de la plataforma (el admin, no).
    withCosts ? safeBlock(tenantId, 'gasto de IA', async () => (await import('@/lib/operaciones/ai-watch')).getAiOverview(tenantId)) : Promise.resolve(null)
  ]);
  return (
    <HomeCard title="Sistema" icon={Cog} href="/dashboard/operaciones/salud" linkLabel="Ver la salud" testId="inicio-sistema">
      <div className="space-y-3 text-sm">
        {!errors ? (
          <Unavailable what="los errores" />
        ) : errors.open === 0 ? (
          <p className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success" aria-hidden />Sin errores abiertos.</p>
        ) : (
          <p>
            <Link href="/dashboard/errores" className="hover:underline">
              <span className="font-semibold tabular-nums">{errors.open}</span> errores abiertos
              {errors.critical > 0 && <span className="text-destructive"> · {errors.critical} críticos</span>}
              {errors.new24 > 0 && <span className="text-muted-foreground"> · {errors.new24} nuevos en 24 h</span>}
            </Link>
          </p>
        )}
        {withCosts &&
          (ai ? (
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <Link href="/dashboard/operaciones/gasto-ia" className="text-muted-foreground hover:underline">Gasto de IA este mes</Link>
                <span className="tabular-nums">
                  <span className="font-semibold">{usd(ai.mtd)}</span>
                  {ai.settings.monthly > 0 && <span className="text-muted-foreground"> de {usd(ai.settings.monthly)}</span>}
                </span>
              </div>
              {ai.settings.monthly > 0 && (
                <>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
                    <div
                      className={cn('h-full rounded-full', ai.forecast > ai.settings.monthly ? 'bg-destructive' : 'bg-brand')}
                      style={{ width: `${Math.min(100, (ai.mtd / ai.settings.monthly) * 100)}%` }}
                    />
                  </div>
                  <p className={cn('mt-1 text-xs', ai.forecast > ai.settings.monthly ? 'text-destructive' : 'text-muted-foreground')}>
                    Previsión a fin de mes: {usd(ai.forecast)}
                    {ai.forecast > ai.settings.monthly ? ' (por encima del presupuesto)' : ''}
                  </p>
                </>
              )}
            </div>
          ) : (
            <Unavailable what="el gasto de IA" />
          ))}
      </div>
    </HomeCard>
  );
}
