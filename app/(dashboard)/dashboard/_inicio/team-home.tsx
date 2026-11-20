// Inicio de cada persona del equipo, como panel: arriba lo urgente (lo que le pide algo), luego sus cifras de la semana,
// su día (tareas de hoy y vencidas, con enlace a Mis tareas) y, al lado, su jornada, sus dudas y lo nuevo de la base.
// Solo lo suyo: sin costes, sin datos de los demás y sin ranking (las cifras son para mejorar, no para compararse).
import Link from 'next/link';
import { Suspense } from 'react';
import { AlertTriangle, BookOpen, CalendarCheck, CheckCircle2, Clock, Gauge, Home, ListChecks, MessageCircleQuestion, Target, Timer, UserRound } from 'lucide-react';
import { EmptyState, PageContainer, PageHeader, StatCard } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { getMyDay, getMyProfile, getMyQuestions, getMyStats, getMyUrgent, getNewKnowledge, safeBlock } from '@/lib/inicio/panel';
import { waitLabel } from '@/lib/operaciones/inbox';
import { fmtDuration, STATUS_ICON, STATUS_LABEL } from '@/lib/operaciones/jornada-core';
import { getMyTasks } from '@/lib/operaciones/my-tasks';
import { getClickUpConnection } from '@/lib/operaciones/queries';
import { TaskList } from '../mis-tareas/task-list';
import { greeting, HomeCard, Loading, todayLabel, Unavailable } from './parts';

export async function TeamHome({ tenantId, userId, firstName }: { tenantId: string; userId: number; firstName: string }) {
  const profile = await safeBlock(tenantId, 'ficha propia', () => getMyProfile(tenantId, userId));
  const name = profile?.name?.split(/\s+/)[0] || firstName;
  const header = <PageHeader icon={Home} title={`${greeting()}, ${name}`} description={`${todayLabel()}. Lo urgente, tu día y cómo vas.`} />;

  if (!profile?.clickupUserId) {
    return (
      <PageContainer className="space-y-6">
        {header}
        <EmptyState
          icon={UserRound}
          title="Tu usuario aún no está enlazado a tu ficha del equipo"
          description="Pide a quien lleva las operaciones que lo enlace en Equipo → Fichas. Después verás aquí lo urgente, tus tareas de hoy, tu jornada y cómo vas."
        />
        <Suspense fallback={null}>
          <NewKnowledgeCard tenantId={tenantId} />
        </Suspense>
      </PageContainer>
    );
  }

  const cu = profile.clickupUserId;
  return (
    <PageContainer className="space-y-6">
      {header}
      <Suspense fallback={null}>
        <UrgentBlock tenantId={tenantId} clickupUserId={cu} />
      </Suspense>
      <Suspense fallback={<StatsSkeleton />}>
        <StatsRow tenantId={tenantId} clickupUserId={cu} />
      </Suspense>
      <div className="grid gap-4 lg:grid-cols-3">
        <Suspense fallback={<HomeCard title="Tu día" icon={CalendarCheck} className="lg:col-span-2"><Loading text="Cargando tus tareas…" /></HomeCard>}>
          <MyDayTasks tenantId={tenantId} clickupUserId={cu} />
        </Suspense>
        <div className="space-y-4">
          <Suspense fallback={<HomeCard title="Mi jornada" icon={Clock}><Loading text="Mirando tu jornada…" /></HomeCard>}>
            <MyDayCard tenantId={tenantId} clickupUserId={cu} />
          </Suspense>
          <Suspense fallback={<HomeCard title="Mis dudas" icon={MessageCircleQuestion}><Loading text="Buscando tus dudas…" /></HomeCard>}>
            <MyQuestionsCard tenantId={tenantId} clickupUserId={cu} />
          </Suspense>
          <Suspense fallback={<HomeCard title="Lo nuevo de la base" icon={BookOpen}><Loading text="Buscando novedades…" /></HomeCard>}>
            <NewKnowledgeCard tenantId={tenantId} />
          </Suspense>
        </div>
      </div>
    </PageContainer>
  );
}

// --- Lo urgente -----------------------------------------------------------------------------------------------------

async function UrgentBlock({ tenantId, clickupUserId }: { tenantId: string; clickupUserId: string }) {
  const u = await safeBlock(tenantId, 'lo urgente', () => getMyUrgent(tenantId, clickupUserId));
  if (!u) return null;
  const items: { key: string; tone: 'danger' | 'warning' | 'info'; title: string; detail: string }[] = [
    ...u.returned.map((r) => ({
      key: `r-${r.id}`,
      tone: 'danger' as const,
      title: `Te han devuelto «${r.title}»`,
      detail: `${r.clientName ? `${r.clientName} · ` : ''}hace ${waitLabel(r.since)}. Revisa el comentario y vuelve a empezarla desde Telegram.`
    })),
    ...u.blocked.map((b) => ({
      key: `b-${b.id}`,
      tone: 'warning' as const,
      title: 'Tu bloqueo espera respuesta',
      detail: `«${b.question.slice(0, 120)}» · hace ${waitLabel(b.since)}${b.status === 'escalado' ? ' · ya lo tiene Enric' : ''}`
    })),
    ...(u.toRate > 0
      ? [{ key: 'rate', tone: 'info' as const, title: `${u.toRate} respuesta(s) a tus dudas sin valorar`, detail: 'Dile al jefe de operaciones en Telegram si te sirvió: así aprende y te responde mejor.' }]
      : [])
  ];
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground shadow-xs" data-testid="inicio-urgente">
        <CheckCircle2 className="size-4 text-success" aria-hidden />
        Nada urgente: no tienes devoluciones ni bloqueos pendientes.
      </p>
    );
  }
  const toneCls = { danger: 'border-destructive/40 bg-destructive-soft/40', warning: 'border-warning/50 bg-warning-soft/50', info: 'border-info/30 bg-info-soft/40' };
  return (
    <section aria-labelledby="urgente-titulo" className="space-y-2" data-testid="inicio-urgente">
      <h2 id="urgente-titulo" className="flex items-center gap-2 text-[15px] font-semibold">
        <AlertTriangle className="size-4 text-destructive" aria-hidden />
        Lo urgente · {items.length}
      </h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((i) => (
          <li key={i.key} className={cn('rounded-lg border px-3 py-2.5', toneCls[i.tone])}>
            <span className="block text-sm font-medium">{i.title}</span>
            <span className="block text-xs text-muted-foreground">{i.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- Cómo vas ---------------------------------------------------------------------------------------------------------

function StatsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[104px] animate-pulse rounded-xl border bg-card" />
      ))}
    </div>
  );
}

async function StatsRow({ tenantId, clickupUserId }: { tenantId: string; clickupUserId: string }) {
  const s = await safeBlock(tenantId, 'mis cifras', () => getMyStats(tenantId, clickupUserId));
  if (!s) return <Unavailable what="tus cifras" />;
  const pct = (v: number | null) => (v === null ? '—' : `${v} %`);
  return (
    <section aria-label="Cómo vas esta semana" className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Terminadas" value={s.finished} icon={ListChecks} tone="success" hint={`Últimos ${s.days} días`} />
        <StatCard
          label="Entregadas a tiempo"
          value={s.completed ? `${s.onTime} de ${s.completed}` : '—'}
          icon={Target}
          tone={s.completed && s.onTime < s.completed ? 'warning' : 'success'}
          hint="Encargos con fecha, últimos 7 días"
        />
        <StatCard label="Dentro del margen" value={pct(s.pctInside)} icon={Timer} tone="info" hint="Tiempo real frente al margen de cada tipo" />
        <StatCard
          label="Tu precisión"
          value={pct(s.precision)}
          icon={Gauge}
          tone="brand"
          hint={s.pendingJustify ? `${s.pendingJustify} tiempo(s) por explicar en Telegram` : 'Cuánto aciertas tus estimaciones'}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Solo lo ves tú: sirve para ver cómo vas, no para compararte. Más detalle en{' '}
        <Link href="/dashboard/operaciones/mi-panel" className="underline-offset-2 hover:underline">Mi panel</Link>.
      </p>
    </section>
  );
}

// --- Tu día ----------------------------------------------------------------------------------------------------------

async function MyDayTasks({ tenantId, clickupUserId }: { tenantId: string; clickupUserId: string }) {
  const conn = await safeBlock(tenantId, 'conexión de ClickUp', () => getClickUpConnection(tenantId));
  const t = conn ? await safeBlock(tenantId, 'mis tareas', () => getMyTasks(tenantId, clickupUserId)) : null;
  return (
    <HomeCard title="Tu día" icon={CalendarCheck} href="/dashboard/mis-tareas" linkLabel="Todas mis tareas" className="lg:col-span-2" testId="inicio-mis-tareas">
      {!conn ? (
        <p className="text-sm text-muted-foreground">Las tareas todavía no están conectadas.</p>
      ) : !t ? (
        <Unavailable what="tus tareas" />
      ) : (
        <div className="space-y-4">
          {t.overdue.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-medium text-destructive">Vencidas ({t.overdue.length})</h3>
              <TaskList tasks={t.overdue} late limit={5} empty="" />
            </div>
          )}
          <div>
            <h3 className="mb-1.5 text-sm font-medium">Para hoy ({t.today.length})</h3>
            <TaskList tasks={t.today} limit={8} showDue={false} empty="Nada con fecha de hoy." />
          </div>
          <p className="text-xs text-muted-foreground">
            Próximos 7 días: {t.week.length} · <Link href="/dashboard/mis-tareas" className="text-brand underline-offset-2 hover:underline">ver todas</Link>
          </p>
        </div>
      )}
    </HomeCard>
  );
}

async function MyDayCard({ tenantId, clickupUserId }: { tenantId: string; clickupUserId: string }) {
  const d = await safeBlock(tenantId, 'mi jornada', () => getMyDay(tenantId, clickupUserId));
  return (
    <HomeCard title="Mi jornada" icon={Clock} href="/dashboard/operaciones/mi-panel" linkLabel="Mi panel">
      {!d ? (
        <Unavailable what="tu jornada" />
      ) : !d.enabled || !d.state ? (
        <p className="text-sm text-muted-foreground">El registro de jornada no está activado.</p>
      ) : (
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            <span aria-hidden>{STATUS_ICON[d.state.status]}</span> {STATUS_LABEL[d.state.status]}
          </p>
          {d.state.activeTask && d.state.status === 'trabajando' && <p className="text-muted-foreground">Con «{d.state.activeTask.name}»</p>}
          <p className="text-muted-foreground">
            Hoy: {fmtDuration(d.state.workedMin)} · descansos {d.state.breakMin} de {d.breakQuotaMin} min
          </p>
          {d.state.status === 'sin_empezar' && <p className="text-muted-foreground">Tu jornada empieza al empezar tu primera tarea desde Telegram.</p>}
        </div>
      )}
    </HomeCard>
  );
}

const Q_STATUS: Record<string, string> = {
  respondida: 'Respondida, ¿te sirvió?',
  pendiente_aprobacion: 'Enric revisa la respuesta',
  escalada: 'Pasada a Enric'
};

async function MyQuestionsCard({ tenantId, clickupUserId }: { tenantId: string; clickupUserId: string }) {
  const qs = await safeBlock(tenantId, 'mis dudas', () => getMyQuestions(tenantId, clickupUserId));
  return (
    <HomeCard title="Mis dudas" icon={MessageCircleQuestion}>
      {!qs ? (
        <Unavailable what="tus dudas" />
      ) : qs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tienes dudas abiertas. Si te atascas, pregúntale al jefe de operaciones por tu chat de Telegram.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {qs.map((q) => (
            <li key={q.id}>
              <span className="line-clamp-2">{q.question}</span>
              <span className="text-xs text-muted-foreground">{Q_STATUS[q.status] ?? q.status}</span>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}

async function NewKnowledgeCard({ tenantId }: { tenantId: string }) {
  const rows = await safeBlock(tenantId, 'novedades de la base', () => getNewKnowledge(tenantId));
  return (
    <HomeCard title="Lo nuevo de la base" icon={BookOpen} href="/dashboard/conocimiento" linkLabel="Ver la base">
      {!rows ? (
        <Unavailable what="las novedades" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada nuevo en las últimas dos semanas.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/dashboard/conocimiento/${r.id}`} className="hover:underline">
                {r.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
