'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, Bot, CheckCircle2, Inbox, Lightbulb, ListChecks, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section, StatCard } from '@/components/ui/page';
import { savePilotStartAction } from '@/lib/operaciones/pilot-actions';
import type { PersonWeek, PilotData, Stat, SuggestionRow } from '@/lib/operaciones/pilot';

const fmtWeek = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtAt = (ms: number) =>
  new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

function mins(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = m / 60;
  return `${h < 10 ? h.toFixed(1).replace('.0', '') : Math.round(h)} h`;
}
const statText = (s: Stat) => (s ? `${mins(s.avg)} (med. ${mins(s.median)}, n=${s.n})` : '—');
const num = (n: number) => (n === 0 ? '—' : String(n));

type Row = { label: string; hint?: string; value: (p: PersonWeek) => string };

const ROWS: Row[] = [
  { label: 'Encargos creados · desde el bloc', value: (p) => num(p.createdBloc) },
  { label: 'Encargos creados · desde Nuevo encargo', value: (p) => num(p.createdNuevo) },
  { label: 'Encargos creados · desde ClickUp', value: (p) => num(p.createdClickup) },
  { label: 'Del aviso a Empezar', hint: 'Minutos laborables de quien lo empezó', value: (p) => statText(p.toStart) },
  { label: 'De Empezar a Hecho', hint: 'Minutos laborables', value: (p) => statText(p.toDone) },
  { label: 'Bloqueos resueltos por la IA', value: (p) => num(p.blocksAi) },
  { label: 'Bloqueos que llegaron a ti', value: (p) => num(p.blocksOwner) },
  { label: 'Revisiones aceptadas', value: (p) => num(p.reviewsAccepted) },
  { label: 'Revisiones devueltas', value: (p) => num(p.reviewsReturned) },
  { label: 'Recordatorios enviados', value: (p) => num(p.reminders) },
  { label: 'Encargos que acabaron sin respuesta', hint: 'Listados como «Sin respuesta» en un resumen', value: (p) => num(p.unanswered) },
  { label: 'Tareas revisadas en limpiezas', value: (p) => num(p.cleanupReviewed) }
];

export function PilotoView({ data, suggestions }: { data: PilotData; suggestions: SuggestionRow[] }) {
  const router = useRouter();
  const [start, setStart] = useState(data.start);
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setMsg(null);
      const r = await savePilotStartAction(start);
      setMsg(r.ok ? { type: 'ok', text: 'Fecha de inicio guardada.' } : { type: 'error', text: r.error });
      if (r.ok) router.refresh();
    });

  // Resumen de la semana más reciente (solo presentación: sale de los mismos totales de la tabla).
  const latest = data.hasData ? data.weeks[0] : undefined;
  const lt = latest?.total;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Piloto</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground text-pretty">
            Métricas por semana (lunes a domingo) y por persona, calculadas con lo que ya registra el sistema desde la fecha de inicio.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label htmlFor="piloto-inicio" className="block text-xs font-medium">
              Inicio del piloto
            </label>
            <Input
              id="piloto-inicio"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              data-testid="piloto-inicio"
              className="w-40"
            />
          </div>
          <Button
            size="sm"
            className="h-9 bg-brand text-white hover:bg-brand/90"
            disabled={pending || start === data.start || !start}
            onClick={save}
            data-testid="piloto-guardar"
          >
            Guardar
          </Button>
        </div>
      </div>
      {msg && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive'}`}
        >
          {msg.text}
        </p>
      )}

      {!data.hasData && (
        <EmptyState
          icon={TrendingUp}
          title={`Todavía no hay datos desde el ${fmtWeek(data.start)}`}
          description="Las métricas aparecerán solas cuando haya encargos y pulsaciones de botón. Puedes cambiar la fecha de inicio arriba."
        />
      )}

      {latest && lt && (
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Semana del {fmtWeek(latest.weekStart)}
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Encargos creados"
              value={lt.createdBloc + lt.createdNuevo + lt.createdClickup}
              hint={`Bloc ${lt.createdBloc} · Nuevo ${lt.createdNuevo} · ClickUp ${lt.createdClickup}`}
              icon={ListChecks}
              tone="brand"
            />
            <StatCard
              label="Del aviso a Empezar"
              value={lt.toStart ? mins(lt.toStart.avg) : '—'}
              hint={lt.toStart ? `Mediana ${mins(lt.toStart.median)} · n=${lt.toStart.n}` : 'Sin datos'}
              icon={Timer}
              tone="info"
            />
            <StatCard
              label="Bloqueos resueltos por la IA"
              value={lt.blocksAi}
              hint={`${lt.blocksOwner} llegaron a ti`}
              icon={Bot}
              tone="success"
            />
            <StatCard
              label="Revisiones aceptadas"
              value={lt.reviewsAccepted}
              hint={`${lt.reviewsReturned} devueltas`}
              icon={CheckCircle2}
              tone="neutral"
            />
          </div>
        </div>
      )}

      {data.weeks.map((w) => {
        const ids = data.order.filter((id) => w.people[id]);
        return (
          <section
            key={w.weekStart}
            className="overflow-hidden rounded-xl border bg-card shadow-xs"
            data-testid={`semana-${w.weekStart}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Semana del {fmtWeek(w.weekStart)}</h3>
              <Badge tone="neutral">
                {ids.length} persona{ids.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 z-10 min-w-44 bg-muted sm:min-w-56">
                      Métrica
                    </th>
                    {ids.map((id) => (
                      <th key={id} scope="col" className="whitespace-nowrap">
                        {data.names[id] ?? id}
                      </th>
                    ))}
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.label}>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-b bg-card px-3 py-2.5 text-left font-normal"
                        title={r.hint}
                      >
                        {r.label}
                      </th>
                      {ids.map((id) => (
                        <td key={id} className="whitespace-nowrap tabular-nums">
                          {r.value(w.people[id])}
                        </td>
                      ))}
                      <td className="whitespace-nowrap font-medium tabular-nums">{r.value(w.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="flex items-start gap-2 border-t bg-muted/30 px-4 py-3 text-sm" data-testid={`interrupciones-${w.weekStart}`}>
              <Inbox className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className="font-medium">Tu bandeja:</span> {w.immediate} interrupci{w.immediate === 1 ? 'ón inmediata' : 'ones inmediatas'} (urgentes) frente a{' '}
                {w.toDigest} cosa{w.toDigest === 1 ? '' : 's'} que fue{w.toDigest === 1 ? '' : 'ron'} a los resúmenes.
              </span>
            </p>
          </section>
        );
      })}

      <div data-testid="sugerencias">
        <Section title={`Sugerencias (${suggestions.length})`}>
          {suggestions.length === 0 ? (
            <EmptyState
              icon={Lightbulb}
              title="Aún no hay sugerencias"
              description="El equipo las envía al bot con /sugerencia."
              className="py-10"
            />
          ) : (
            <ul className="divide-y">
              {suggestions.map((s) => (
                <li key={s.id} className="py-3 text-sm first:pt-0 last:pb-0">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{s.person}</span>
                    <span aria-hidden>·</span>
                    <span>{fmtAt(s.at)}</span>
                    {!s.shown && (
                      <Badge tone="brand" dot>
                        Nueva
                      </Badge>
                    )}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-pretty">{s.text}</p>
                  {s.hasPhoto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/operaciones/suggestion-photo/${s.id}`}
                      alt="Captura de la sugerencia"
                      className="mt-2 max-h-72 rounded-lg border"
                      loading="lazy"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
