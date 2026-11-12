'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertTriangle, Clock, ExternalLink, Gauge, ListChecks, Pencil, Target, Timer, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section, StatCard } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { correctTaskTimeAction, saveBandAction, voidTaskTimeAction } from '@/lib/operaciones/tiempos-actions';
import type { TiemposOverview, TimeRow, TypeRow } from '@/lib/operaciones/tiempos-overview';

const VERDICT: Record<string, { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' }> = {
  dentro: { label: 'Dentro', tone: 'success' },
  pasado: { label: 'Por encima', tone: 'warning' },
  rapido: { label: 'Por debajo', tone: 'info' },
  sin_margen: { label: 'Sin margen', tone: 'neutral' }
};
const JUSTIFY: Record<string, string> = { pendiente: 'Esperando motivo', enviada: 'Explicada', no_necesaria: '' };
const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
const band = (min: number | null, max: number | null) => (min === null && max === null ? '—' : `${min ?? 0}–${max ?? '∞'} min`);
const pctText = (v: number | null) => (v === null ? '—' : `${v} %`);

export function TiemposView({ data, periods }: { data: TiemposOverview; periods: number[] }) {
  const { settings, types, people, outliers, recent, open, days } = data;
  const total = people.reduce((s, p) => s + p.n, 0);
  const pending = people.reduce((s, p) => s + p.pendingJustify, 0);
  const est = people.reduce((s, p) => s + p.estimated, 0);
  const hits = people.reduce((s, p) => s + Math.round(((p.precision ?? 0) * p.estimated) / 100), 0);
  const withBand = types.filter((t) => t.maxMinutes !== null || t.minMinutes !== null).length;

  return (
    <div className="space-y-6">
      {!settings.on && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning-strong">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">
              {!settings.jornadaEnabled ? 'Los tiempos necesitan la jornada real encendida.' : 'Los tiempos de tarea están apagados.'}
            </p>
            <p>
              El tiempo de cada tarea sale de la jornada: los minutos trabajados con esa tarea activa, sin pausas. Puedes preparar los
              márgenes ya y encenderlo en{' '}
              <Link href="/dashboard/operaciones/automatizaciones" className="font-medium underline">
                Sistema → Automatizaciones → Tiempos de tarea
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Periodo">
          {periods.map((p) => (
            <Button key={p} asChild size="sm" variant={p === days ? 'default' : 'outline'}>
              <Link href={`?dias=${p}`}>{p} días</Link>
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          El tiempo es información para ajustar márgenes y plazos, no una nota. Precisión: acierto de la estimación propia (±{settings.precisionPct} %).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tareas terminadas" value={total} icon={ListChecks} tone="neutral" hint={`Últimos ${days} días`} />
        <StatCard label="Precisión del equipo" value={est ? `${Math.round((hits / est) * 100)} %` : '—'} icon={Target} tone="success" hint={`${est} con estimación`} />
        <StatCard label="Esperando motivo" value={pending} icon={Clock} tone={pending ? 'warning' : 'neutral'} hint="Se pasaron del margen" />
        <StatCard label="Tipos con margen" value={`${withBand}/${types.length}`} icon={Gauge} tone={withBand < types.length ? 'warning' : 'success'} />
      </div>

      <Section title="Márgenes por tipo de trabajo" description="Mínimo y máximo de minutos de una tarea de cada tipo. Con suficientes tareas, se propone el margen real (percentiles 25–75).">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Margen (min)</th>
                <th className="px-3 py-2 font-medium">Propuesta real</th>
                <th className="px-3 py-2 font-medium">Mediana</th>
                <th className="px-3 py-2 font-medium">Tareas</th>
                <th className="px-3 py-2 font-medium">Dentro</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <BandRow key={t.key} t={t} minSamples={settings.minSamples} />
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Por persona" description="Sin ranking: cada fila es para conversar con esa persona, no para compararla.">
        {people.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Timer} title="Aún no hay tareas medidas" description="Aparecen al terminar tareas con la jornada y los tiempos encendidos." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Persona</th>
                  <th className="px-3 py-2 font-medium">Tareas</th>
                  <th className="px-3 py-2 font-medium">Tiempo medido</th>
                  <th className="px-3 py-2 font-medium">Dentro del margen</th>
                  <th className="px-3 py-2 font-medium">Precisión</th>
                  <th className="px-3 py-2 font-medium">Esperando motivo</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.clickupUserId} className="border-b last:border-0">
                    <td className="px-5 py-2.5 font-medium">{p.name}</td>
                    <td className="px-3 py-2.5 tabular-nums">{p.n}</td>
                    <td className="px-3 py-2.5 tabular-nums">{Math.round(p.totalMin / 6) / 10} h</td>
                    <td className="px-3 py-2.5 tabular-nums">{pctText(p.pctInside)}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {pctText(p.precision)} <span className="text-xs text-muted-foreground">({p.estimated})</span>
                    </td>
                    <td className="px-3 py-2.5">{p.pendingJustify ? <Badge tone="warning">{p.pendingJustify}</Badge> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Fuera de margen" description="Por encima: con el motivo y la URL que dio la persona. Por debajo: suele ser un tipo mal puesto.">
        <TimesTable rows={outliers} empty="Ninguna tarea fuera de margen en este periodo." />
      </Section>

      {open.length > 0 && (
        <Section title="En curso" description="Tareas empezadas que aún no se han terminado.">
          <ul className="divide-y text-sm">
            {open.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                <span className="font-medium">{o.person}</span>
                <span className="min-w-0 flex-1 truncate">{o.task}</span>
                {o.type && <Badge tone="neutral">{o.type}</Badge>}
                {o.estimate && <span className="text-xs text-muted-foreground">estimó {o.estimate} min</span>}
                <span className="text-xs text-muted-foreground">desde {fmtDate(o.startedAt)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Todas las tareas medidas" description="Anula una fila errónea o corrige sus minutos: queda anotado quién y por qué; nada se borra.">
        <TimesTable rows={recent} empty="Aún no hay tareas medidas en este periodo." editable />
      </Section>
    </div>
  );
}

function BandRow({ t, minSamples }: { t: TypeRow; minSamples: number }) {
  const router = useRouter();
  const [min, setMin] = useState(t.minMinutes?.toString() ?? '');
  const [max, setMax] = useState(t.maxMinutes?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const dirty = min !== (t.minMinutes?.toString() ?? '') || max !== (t.maxMinutes?.toString() ?? '');

  const save = (a: string, b: string) =>
    start(async () => {
      setError(null);
      const res = await saveBandAction({ key: t.key, min: a === '' ? null : Number(a), max: b === '' ? null : Number(b) });
      if (!res.ok) return setError(res.error);
      setSaved(true);
      router.refresh();
    });

  return (
    <tr className="border-b align-top last:border-0">
      <td className="px-5 py-2.5 font-medium">{t.label}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Input aria-label={`Mínimo de ${t.label}`} type="number" min={0} inputMode="numeric" className="h-8 w-20" value={min} onChange={(e) => (setMin(e.target.value), setSaved(false))} placeholder="mín" />
          <span className="text-muted-foreground">–</span>
          <Input aria-label={`Máximo de ${t.label}`} type="number" min={1} inputMode="numeric" className="h-8 w-20" value={max} onChange={(e) => (setMax(e.target.value), setSaved(false))} placeholder="máx" />
          <Button size="sm" variant="outline" disabled={!dirty || pending} onClick={() => save(min, max)}>
            Guardar
          </Button>
          {saved && !dirty && <span className="text-xs text-success">Guardado</span>}
        </div>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
      <td className="px-3 py-2.5">
        {t.suggestion ? (
          <div className="flex items-center gap-2">
            <span className="tabular-nums">
              {t.suggestion.min}–{t.suggestion.max} min
            </span>
            <span className="text-xs text-muted-foreground">({t.suggestion.n})</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setMin(String(t.suggestion!.min));
                setMax(String(t.suggestion!.max));
                save(String(t.suggestion!.min), String(t.suggestion!.max));
              }}
            >
              Aplicar
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Con {minSamples} tareas terminadas</span>
        )}
      </td>
      <td className="px-3 py-2.5 tabular-nums">{t.median !== null ? `${t.median} min` : '—'}</td>
      <td className="px-3 py-2.5 tabular-nums">{t.n}</td>
      <td className="px-3 py-2.5 tabular-nums">{pctText(t.pctInside)}</td>
    </tr>
  );
}

function TimesTable({ rows, empty, editable = false }: { rows: TimeRow[]; empty: string; editable?: boolean }) {
  if (!rows.length) return <p className="px-5 py-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y text-sm">
      {rows.map((r) => (
        <TimeItem key={r.id} r={r} editable={editable} />
      ))}
    </ul>
  );
}

function TimeItem({ r, editable }: { r: TimeRow; editable: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'none' | 'void' | 'fix'>('none');
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(r.minutes?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const v = r.verdict ? VERDICT[r.verdict] : null;

  const submit = () =>
    start(async () => {
      setError(null);
      const res = mode === 'void' ? await voidTaskTimeAction(r.id, reason) : await correctTaskTimeAction({ id: r.id, minutes: Number(minutes), reason });
      if (!res.ok) return setError(res.error);
      setMode('none');
      setReason('');
      router.refresh();
    });

  return (
    <li className={cn('px-5 py-3', r.voided && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-28 shrink-0 text-xs text-muted-foreground">{fmtDate(r.doneAt)}</span>
        <span className="font-medium">{r.person}</span>
        <span className={cn('min-w-0 flex-1 truncate', r.voided && 'line-through')} title={r.task}>
          {r.task}
        </span>
        {r.type && <Badge tone="neutral">{r.type}</Badge>}
        <span className="tabular-nums">
          <b>{r.minutes ?? '—'} min</b>
          <span className="text-xs text-muted-foreground"> · margen {band(r.bandMin, r.bandMax)}</span>
          {r.estimate !== null && <span className="text-xs text-muted-foreground"> · estimó {r.estimate}{r.hit ? ' 🎯' : ''}</span>}
        </span>
        {v && <Badge tone={v.tone}>{v.label}</Badge>}
        {JUSTIFY[r.justifyStatus] && <Badge tone={r.justifyStatus === 'pendiente' ? 'warning' : 'info'}>{JUSTIFY[r.justifyStatus]}</Badge>}
        {r.source !== 'bot' && <span className="text-xs text-muted-foreground">{r.source === 'clickup' ? 'cerrada en ClickUp' : r.source}</span>}
        {editable && !r.voided && mode === 'none' && (
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setMode('fix')} aria-label={`Corregir minutos de ${r.task}`}>
              <Pencil aria-hidden /> Corregir
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('void')} aria-label={`Anular ${r.task}`}>
              <Undo2 aria-hidden /> Anular
            </Button>
          </span>
        )}
      </div>
      {(r.reason || r.url || r.note) && (
        <p className="mt-1 pl-0 text-xs text-muted-foreground sm:pl-[124px]">
          {r.reason && <>«{r.reason}»</>}
          {r.note && <> · {r.note}</>}
          {r.url && (
            <>
              {' · '}
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-foreground underline">
                URL <ExternalLink className="size-3" aria-hidden />
              </a>
            </>
          )}
        </p>
      )}
      {r.voided && r.voidReason && <p className="mt-1 text-xs text-muted-foreground sm:pl-[124px]">Anulada: {r.voidReason}</p>}
      {mode !== 'none' && (
        <div className="mt-2 flex flex-wrap items-end gap-2 sm:pl-[124px]">
          {mode === 'fix' && (
            <Input aria-label="Minutos correctos" type="number" min={0} className="h-8 w-24" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          )}
          <Input aria-label="Motivo" className="h-8 min-w-[220px] flex-1" placeholder="Motivo (obligatorio)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" disabled={pending || reason.trim().length < 3} onClick={submit}>
            {mode === 'void' ? 'Anular' : 'Guardar corrección'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => (setMode('none'), setError(null))}>
            Cancelar
          </Button>
          {error && <p className="w-full text-xs text-destructive">{error}</p>}
        </div>
      )}
    </li>
  );
}
