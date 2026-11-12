import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { Clock, Coffee, ListChecks, Target, UserRound } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { opsTeamProfiles } from '@/lib/db/schema';
import { requirePagePermission } from '@/lib/auth/permissions';
import { Badge, EmptyState, Section, StatCard } from '@/components/ui/page';
import { fmtDuration, STATUS_ICON, STATUS_LABEL } from '@/lib/operaciones/jornada-core';
import { getPersonDay, jornadaSettings } from '@/lib/operaciones/jornada';
import { getMyTimes } from '@/lib/operaciones/tiempos-overview';

export const dynamic = 'force-dynamic';

const DAYS = 30;
const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' }).format(new Date(iso)) : '—';
const VERDICT: Record<string, { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' }> = {
  dentro: { label: 'Dentro', tone: 'success' },
  pasado: { label: 'Por encima', tone: 'warning' },
  rapido: { label: 'Por debajo', tone: 'info' },
  sin_margen: { label: 'Sin margen', tone: 'neutral' }
};

// Equipo → Mi panel (paso 5B): cada persona ve SOLO lo suyo (su jornada de hoy, sus tiempos y su precisión),
// buscado por la ficha enlazada a su usuario. Sin ranking ni datos de compañeros (solo la mediana del equipo).
export default async function MiPanelPage() {
  const user = await requirePagePermission('view');
  const [profile] = await db
    .select({ name: opsTeamProfiles.name, clickupUserId: opsTeamProfiles.clickupUserId })
    .from(opsTeamProfiles)
    .where(and(eq(opsTeamProfiles.tenantId, user.tenantId), eq(opsTeamProfiles.userId, user.id)))
    .limit(1);

  if (!profile?.clickupUserId) {
    return (
      <EmptyState
        icon={UserRound}
        title="Tu usuario aún no está enlazado a tu ficha"
        description="Pide a quien lleva las operaciones que lo enlace en Equipo → Fichas («Mi panel»). Después verás aquí tu jornada, tus tiempos y tu precisión."
      />
    );
  }

  const [day, cfg, mine] = await Promise.all([
    getPersonDay(user.tenantId, profile.clickupUserId),
    jornadaSettings(user.tenantId),
    getMyTimes(user.tenantId, profile.clickupUserId, DAYS)
  ]);
  const st = day?.state;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Hola, {profile.name}. Esto es solo tuyo: sirve para ver cómo vas y mejorar tu precisión, no para compararte con nadie.
      </p>

      {st && cfg.enabled && (
        <Section title="Hoy" description={`${STATUS_ICON[st.status]} ${STATUS_LABEL[st.status]}${st.activeTask && st.status !== 'terminado' ? ` · con «${st.activeTask.name}»` : ''}`}>
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            <StatCard label="Trabajado" value={fmtDuration(st.workedMin)} icon={Clock} tone="success" />
            <StatCard
              label="Descansos"
              value={`${st.breakMin} / ${cfg.breakQuotaMin} min`}
              icon={Coffee}
              tone={st.breakMin > cfg.breakQuotaMin ? 'warning' : 'neutral'}
              hint="Cupo diario"
            />
            <StatCard label="Comida" value={st.lunchMin ? fmtDuration(st.lunchMin) : '—'} icon={Coffee} tone="neutral" />
          </div>
        </Section>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Tareas terminadas" value={mine.stats.n} icon={ListChecks} tone="neutral" hint={`Últimos ${DAYS} días`} />
        <StatCard
          label="Tu precisión"
          value={mine.stats.precision === null ? '—' : `${mine.stats.precision} %`}
          icon={Target}
          tone="success"
          hint={`${mine.stats.estimated} tareas con estimación`}
        />
        <StatCard label="Dentro del margen" value={mine.stats.pctInside === null ? '—' : `${mine.stats.pctInside} %`} icon={Clock} tone="neutral" />
      </div>

      {mine.stats.pendingJustify > 0 && (
        <p role="status" className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning-strong">
          Tienes {mine.stats.pendingJustify} tarea(s) que se pasaron del margen sin explicar. Contesta al bot con el motivo y la URL: así
          ajustamos los márgenes para que sean justos.
        </p>
      )}

      {mine.byType.length > 0 && (
        <Section title="Tus tiempos por tipo" description="Tu mediana frente a la del equipo. Si la tuya es mayor, quizá tus tareas de ese tipo son más grandes: coméntalo.">
          <ul className="divide-y text-sm">
            {mine.byType.map((t) => (
              <li key={t.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5">
                <span className="min-w-[140px] font-medium">{t.label}</span>
                <span className="tabular-nums">tú: {t.myMedian ?? '—'} min</span>
                <span className="text-muted-foreground tabular-nums">equipo: {t.teamMedian ?? '—'} min</span>
                <span className="text-xs text-muted-foreground">({t.n} tareas)</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Tus últimas tareas" description="Minutos de trabajo real (sin pausas) y lo que estimaste.">
        {mine.recent.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            Aún no hay tareas medidas. Aparecen al terminarlas con la jornada y los tiempos encendidos.{' '}
            <Link href="/dashboard/operaciones/bandeja" className="underline">
              Ir a Mi bandeja
            </Link>
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {mine.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                <span className="w-14 shrink-0 text-xs text-muted-foreground">{fmtDate(r.doneAt)}</span>
                <span className="min-w-0 flex-1 truncate" title={r.task}>
                  {r.task}
                </span>
                {r.type && <Badge tone="neutral">{r.type}</Badge>}
                <span className="tabular-nums">
                  <b>{r.minutes ?? '—'} min</b>
                  {r.estimate !== null && <span className="text-xs text-muted-foreground"> · estimaste {r.estimate}{r.hit ? ' 🎯' : ''}</span>}
                </span>
                {r.verdict && <Badge tone={VERDICT[r.verdict].tone}>{VERDICT[r.verdict].label}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
