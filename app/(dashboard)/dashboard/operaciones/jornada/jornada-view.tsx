'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useState, useTransition } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, Clock, Coffee, Plus, UserX, Users, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge, EmptyState, Section, StatCard } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { addWorkEventAction, voidWorkEventAction } from '@/lib/operaciones/jornada-actions';
import type { OverviewPerson, WeekRow } from '@/lib/operaciones/jornada-overview';

const KIND_LABEL: Record<string, string> = {
  entrada: '▶️ Entrada',
  descanso: '☕ Descanso',
  comida: '🍽 Comida',
  salida_urgente: '🚪 Salida urgente',
  vuelta: '↩️ Vuelta',
  salida: '⏹ Salida',
  ausencia: '🏠 Ausencia'
};
const SOURCE_LABEL: Record<string, string> = { telegram: 'Telegram', web: 'web', auto: 'automático', correccion: 'corrección' };

const dur = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ''}`);
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const dayName = (date: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', ...opts }).format(new Date(`${date}T12:00:00Z`));

function tone(p: OverviewPerson): 'success' | 'warning' | 'neutral' | 'danger' | 'info' {
  if (p.status === 'trabajando') return 'success';
  if (p.status === 'sin_empezar') return p.workday ? 'warning' : 'neutral';
  if (p.status === 'fuera') return 'danger';
  if (p.status === 'descanso' || p.status === 'comida') return 'info';
  return 'neutral';
}

export function JornadaView({
  date,
  today,
  enabled,
  quotaMin,
  people,
  week,
  dates
}: {
  date: string;
  today: string;
  enabled: boolean;
  quotaMin: number;
  people: OverviewPerson[];
  week: WeekRow[];
  dates: string[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const working = people.filter((p) => p.status === 'trabajando').length;
  const notStarted = people.filter((p) => p.status === 'sin_empezar' && p.workday).length;
  const absent = people.filter((p) => p.status === 'ausente').length;
  const over = people.filter((p) => p.breakOver > 0).length;
  const isToday = date === today;

  return (
    <div className="space-y-6">
      {!enabled && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning-strong">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">La jornada real está apagada.</p>
            <p>
              Mientras esté apagada, el bot no da los buenos días con botones ni registra nada. Actívala cuando hayas explicado el
              sistema al equipo, en{' '}
              <Link href="/dashboard/operaciones/automatizaciones" className="font-medium underline">
                Sistema → Automatizaciones → Jornada real
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" aria-label="Día anterior">
            <Link href={`?fecha=${shift(date, -1)}`}>
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <h2 className="px-2 text-[15px] font-semibold first-letter:uppercase">{dayName(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          {!isToday && (
            <Button asChild variant="outline" size="icon" aria-label="Día siguiente">
              <Link href={`?fecha=${shift(date, 1)}`}>
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          )}
          {!isToday && (
            <Button asChild variant="ghost" size="sm">
              <Link href="?">Hoy</Link>
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Horas en la zona horaria de cada persona · cupo de descansos: {quotaMin} min/día</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={isToday ? 'Trabajando ahora' : 'Trabajaron'} value={isToday ? working : people.filter((p) => p.entrada).length} icon={Users} tone="success" />
        <StatCard label="Sin empezar" value={notStarted} icon={Clock} tone={notStarted ? 'warning' : 'neutral'} hint="En un día laborable suyo" />
        <StatCard label="Ausentes" value={absent} icon={UserX} tone="neutral" />
        <StatCard label="Descansos sobre el cupo" value={over} icon={Coffee} tone={over ? 'danger' : 'neutral'} />
      </div>

      {people.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay personas con ficha activa"
          description="La jornada se registra para cada persona con ficha en Equipo y su Telegram vinculado."
          action={
            <Button asChild className="bg-brand text-white hover:bg-brand/90">
              <Link href="/dashboard/operaciones/equipo">Ir a Fichas</Link>
            </Button>
          }
        />
      ) : (
        <Section title="Registro del día" description="Pulsa una persona para ver su línea de tiempo y corregirla.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Persona</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Entrada</th>
                  <th className="px-3 py-2 font-medium">Comida</th>
                  <th className="px-3 py-2 font-medium">Descansos</th>
                  <th className="px-3 py-2 font-medium">Salidas urgentes</th>
                  <th className="px-3 py-2 font-medium">Salida</th>
                  <th className="px-3 py-2 text-right font-medium">Trabajado</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <Fragment key={p.clickupUserId}>
                    <tr
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                      onClick={() => setOpen(open === p.clickupUserId ? null : p.clickupUserId)}
                      aria-expanded={open === p.clickupUserId}
                    >
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2 font-medium">
                          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open === p.clickupUserId && 'rotate-180')} aria-hidden />
                          {p.name}
                        </div>
                        <div className="pl-6 text-xs text-muted-foreground">{p.workday ? p.scheduleText : 'No es día laborable'}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={tone(p)}>
                          <span aria-hidden>{p.statusIcon}</span> {p.statusLabel}
                        </Badge>
                        {p.absenceReason && <div className="mt-1 text-xs text-muted-foreground">«{p.absenceReason}»</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        {p.entrada ? (
                          <>
                            <span className={cn('tabular-nums', p.lateMin > 5 && 'font-medium text-warning-strong')}>{p.entrada}</span>
                            {p.lateMin > 5 && <span className="ml-1 text-xs text-warning-strong">+{p.lateMin} min</span>}
                            {p.firstTask && <div className="max-w-[200px] truncate text-xs text-muted-foreground" title={p.firstTask}>{p.firstTask}</div>}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {p.lunchMin ? (
                          <span className={cn(p.lunchMin > p.lunchPlanned + 5 && 'font-medium text-warning-strong')}>
                            {dur(p.lunchMin)}
                            {p.lunchMin > p.lunchPlanned + 5 && ` (+${p.lunchMin - p.lunchPlanned})`}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {p.breakCount ? (
                          <span className={cn(p.breakOver > 0 && 'font-medium text-destructive')}>
                            {p.breakCount} · {dur(p.breakMin)}
                            {p.breakOver > 0 && ` (+${p.breakOver})`}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {p.exits.length
                          ? p.exits.map((x, i) => (
                              <div key={i}>
                                {x.start}
                                {x.end ? `–${x.end}` : ''} {x.reason && <span className="text-muted-foreground">«{x.reason}»</span>}
                              </div>
                            ))
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {p.salida ? (
                          p.salidaAuto ? (
                            <span className="font-medium text-warning-strong" title="No marcó «Termino»: cierre automático">
                              {p.salida} (auto)
                            </span>
                          ) : (
                            p.salida
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{p.workedMin ? dur(p.workedMin) : '—'}</td>
                    </tr>
                    {open === p.clickupUserId && (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={8} className="px-5 py-4">
                          <Timeline person={p} date={date} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {week.length > 0 && (
        <Section title="Últimos 7 días" description="Horas trabajadas por día (sin pausas). En rojo, minutos de descanso por encima del cupo; «auto», salida sin marcar.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Persona</th>
                  {dates.map((d) => (
                    <th key={d} className="px-3 py-2 text-right font-medium">
                      <Link href={`?fecha=${d}`} className="hover:underline first-letter:uppercase">
                        {dayName(d, { weekday: 'short', day: 'numeric' })}
                      </Link>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {week.map((r) => (
                  <tr key={r.clickupUserId} className="border-b last:border-0">
                    <td className="px-5 py-2.5 font-medium">{r.name}</td>
                    {r.days.map((d) => (
                      <td key={d.date} className={cn('px-3 py-2.5 text-right tabular-nums', !d.workday && 'text-muted-foreground/60')}>
                        {d.status === 'ausente' ? '🏠' : d.workedMin ? dur(d.workedMin) : '—'}
                        {d.over > 0 && <div className="text-xs text-destructive">+{d.over} desc.</div>}
                        {d.auto && <div className="text-xs text-warning-strong">auto</div>}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      {dur(r.totalMin)}
                      {r.overTotal > 0 && <div className="text-xs font-normal text-destructive">+{r.overTotal} desc.</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

function Timeline({ person, date }: { person: OverviewPerson; date: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: 'entrada', time: '', reason: '', planned: '' });

  const doVoid = (id: string) =>
    start(async () => {
      setError(null);
      const res = await voidWorkEventAction(id, voidReason);
      if (!res.ok) return setError(res.error);
      setVoiding(null);
      setVoidReason('');
      router.refresh();
    });

  const doAdd = () =>
    start(async () => {
      setError(null);
      const res = await addWorkEventAction({
        clickupUserId: person.clickupUserId,
        date,
        kind: form.kind,
        time: form.time,
        reason: form.reason,
        plannedMinutes: form.planned ? Number(form.planned) : null
      });
      if (!res.ok) return setError(res.error);
      setAdding(false);
      setForm({ kind: 'entrada', time: '', reason: '', planned: '' });
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {person.events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin registros este día.</p>
      ) : (
        <ol className="space-y-1.5">
          {person.events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className={cn('w-12 tabular-nums', e.voided && 'text-muted-foreground line-through')}>{e.time}</span>
              <span className={cn('font-medium', e.voided && 'text-muted-foreground line-through')}>{KIND_LABEL[e.kind] ?? e.kind}</span>
              {e.planned && <span className="text-xs text-muted-foreground">{e.planned} min previstos</span>}
              {e.reason && <span className="text-xs text-muted-foreground">«{e.reason}»</span>}
              <Badge tone={e.source === 'auto' ? 'warning' : e.source === 'correccion' ? 'info' : 'neutral'}>
                {SOURCE_LABEL[e.source] ?? e.source}
                {e.createdByName ? ` · ${e.createdByName}` : ''}
              </Badge>
              {e.voided ? (
                <span className="text-xs text-muted-foreground">
                  Anulado por {e.voidedByName}
                  {e.voidReason ? `: «${e.voidReason}»` : ''}
                </span>
              ) : voiding === e.id ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Input
                    value={voidReason}
                    onChange={(ev) => setVoidReason(ev.target.value)}
                    placeholder="Motivo de la corrección"
                    className="h-8 w-56"
                    aria-label="Motivo de la anulación"
                  />
                  <Button size="sm" variant="destructive" disabled={pending} onClick={() => doVoid(e.id)}>
                    Confirmar anulación
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setVoiding(null)}>
                    Cancelar
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setVoiding(e.id)}>
                  <Undo2 aria-hidden /> Anular
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}

      {adding ? (
        <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[160px_110px_120px_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor={`k-${person.clickupUserId}`}>Tipo *</Label>
            <select
              id={`k-${person.clickupUserId}`}
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`t-${person.clickupUserId}`}>Hora *</Label>
            <Input id={`t-${person.clickupUserId}`} type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`p-${person.clickupUserId}`}>Min. previstos</Label>
            <Input
              id={`p-${person.clickupUserId}`}
              type="number"
              min={1}
              max={600}
              value={form.planned}
              onChange={(e) => setForm({ ...form, planned: e.target.value })}
              placeholder="opcional"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`r-${person.clickupUserId}`}>Motivo de la corrección *</Label>
            <Input id={`r-${person.clickupUserId}`} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="p. ej. olvidó marcar la vuelta" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={doAdd} className="bg-brand text-white hover:bg-brand/90">
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus aria-hidden /> Añadir registro
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Nada se borra: lo anulado queda tachado con quién y por qué. Horas en {person.timezone}.</p>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
