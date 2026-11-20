// Inicio de cada persona del equipo: solo lo suyo (sus tareas de hoy, su jornada, sus dudas y lo nuevo de la base).
// Sin costes ni datos de los demás. Las tareas vienen de ClickUp y llegan después de pintar la página (Suspense).
import Link from 'next/link';
import { Suspense } from 'react';
import { BookOpen, CalendarCheck, Clock, ExternalLink, Home, MessageCircleQuestion, UserRound } from 'lucide-react';
import { EmptyState, PageContainer, PageHeader } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { getMyDay, getMyProfile, getMyQuestions, getNewKnowledge, safeBlock } from '@/lib/inicio/panel';
import { fmtDuration, STATUS_ICON, STATUS_LABEL } from '@/lib/operaciones/jornada-core';
import { getClickUpConnection } from '@/lib/operaciones/queries';
import { getTeamToday } from '@/lib/operaciones/team-today';
import type { OpsTask } from '@/lib/operaciones/clickup';
import { greeting, HomeCard, Loading, todayLabel, Unavailable } from './parts';

const fmtDay = (ms: number) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' }).format(new Date(ms));

export async function TeamHome({ tenantId, userId, firstName }: { tenantId: string; userId: number; firstName: string }) {
  const profile = await safeBlock(tenantId, 'ficha propia', () => getMyProfile(tenantId, userId));
  const name = profile?.name?.split(/\s+/)[0] || firstName;
  const header = <PageHeader icon={Home} title={`${greeting()}, ${name}`} description={`${todayLabel()}. Tu día: tus tareas, tu jornada y tus dudas.`} />;

  if (!profile?.clickupUserId) {
    return (
      <PageContainer className="space-y-6">
        {header}
        <EmptyState
          icon={UserRound}
          title="Tu usuario aún no está enlazado a tu ficha del equipo"
          description="Pide a quien lleva las operaciones que lo enlace en Equipo → Fichas. Después verás aquí tus tareas de hoy, tu jornada y tus dudas."
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
      <Suspense fallback={<HomeCard title="Mis tareas de hoy" icon={CalendarCheck}><Loading text="Cargando tus tareas desde ClickUp…" /></HomeCard>}>
        <MyTasksCard tenantId={tenantId} clickupUserId={cu} />
      </Suspense>
      <div className="grid gap-4 lg:grid-cols-3">
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
    </PageContainer>
  );
}

async function MyTasksCard({ tenantId, clickupUserId }: { tenantId: string; clickupUserId: string }) {
  const conn = await safeBlock(tenantId, 'conexión de ClickUp', () => getClickUpConnection(tenantId));
  if (!conn) {
    return (
      <HomeCard title="Mis tareas de hoy" icon={CalendarCheck}>
        <p className="text-sm text-muted-foreground">ClickUp todavía no está conectado; cuando lo esté, verás aquí tus tareas de hoy.</p>
      </HomeCard>
    );
  }
  const team = await safeBlock(tenantId, 'mis tareas', () => getTeamToday(tenantId));
  const me = team?.members.find((m) => m.member.id === clickupUserId);
  return (
    <HomeCard title="Mis tareas de hoy" icon={CalendarCheck} testId="inicio-mis-tareas">
      {!team ? (
        <Unavailable what="tus tareas" />
      ) : !me || (me.today.length === 0 && me.overdue.length === 0) ? (
        <p className="text-sm text-muted-foreground">No tienes tareas para hoy ni vencidas. Si esperabas alguna, revisa su fecha en ClickUp.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <TaskList title={`Para hoy (${me.today.length})`} tasks={me.today} empty="Nada con fecha de hoy." />
          <TaskList title={`Vencidas (${me.overdue.length})`} tasks={me.overdue} empty="Ninguna vencida. ¡Bien!" late />
        </div>
      )}
    </HomeCard>
  );
}

function TaskList({ title, tasks, empty, late }: { title: string; tasks: OpsTask[]; empty: string; late?: boolean }) {
  return (
    <div>
      <h3 className={cn('mb-1.5 text-sm font-medium', late && tasks.length > 0 && 'text-destructive')}>{title}</h3>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {tasks.slice(0, 8).map((t) => (
            <li key={t.id}>
              <a href={t.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.listName}
                    {late && t.dueDate ? ` · vencía el ${fmtDay(t.dueDate)}` : ''}
                  </span>
                </span>
                <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Abrir en ClickUp" />
              </a>
            </li>
          ))}
          {tasks.length > 8 && <li className="px-3 py-2 text-xs text-muted-foreground">y {tasks.length - 8} más en ClickUp</li>}
        </ul>
      )}
    </div>
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
            Trabajado hoy: {fmtDuration(d.state.workedMin)} · descansos {d.state.breakMin} de {d.breakQuotaMin} min
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
