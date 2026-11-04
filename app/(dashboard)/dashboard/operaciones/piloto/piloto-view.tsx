'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Piloto</h2>
          <p className="text-sm text-muted-foreground">
            Métricas por semana (lunes a domingo) y por persona, calculadas con lo que ya registra el sistema desde la fecha de inicio.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs">
            <span className="mb-1 block font-medium">Inicio del piloto</span>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} data-testid="piloto-inicio" className="w-40" />
          </label>
          <Button size="sm" disabled={pending || start === data.start || !start} onClick={save} data-testid="piloto-guardar">
            Guardar
          </Button>
        </div>
      </div>
      {msg && <p className={`text-sm ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}

      {!data.hasData && (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center space-y-1">
          <p className="font-medium">Todavía no hay datos desde el {fmtWeek(data.start)}</p>
          <p className="text-sm text-muted-foreground">
            Las métricas aparecerán solas cuando haya encargos y pulsaciones de botón. Puedes cambiar la fecha de inicio arriba.
          </p>
        </div>
      )}

      {data.weeks.map((w) => {
        const ids = data.order.filter((id) => w.people[id]);
        return (
          <section key={w.weekStart} className="space-y-2" data-testid={`semana-${w.weekStart}`}>
            <h3 className="text-sm font-medium">Semana del {fmtWeek(w.weekStart)}</h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Métrica</th>
                    {ids.map((id) => (
                      <th key={id} className="px-3 py-2 font-medium">{data.names[id] ?? id}</th>
                    ))}
                    <th className="px-3 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ROWS.map((r) => (
                    <tr key={r.label}>
                      <td className="px-3 py-1.5" title={r.hint}>{r.label}</td>
                      {ids.map((id) => (
                        <td key={id} className="px-3 py-1.5 tabular-nums">{r.value(w.people[id])}</td>
                      ))}
                      <td className="px-3 py-1.5 font-medium tabular-nums">{r.value(w.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm" data-testid={`interrupciones-${w.weekStart}`}>
              <span className="font-medium">Tu bandeja:</span> {w.immediate} interrupci{w.immediate === 1 ? 'ón inmediata' : 'ones inmediatas'} (urgentes) frente a{' '}
              {w.toDigest} cosa{w.toDigest === 1 ? '' : 's'} que fue{w.toDigest === 1 ? '' : 'ron'} a los resúmenes.
            </p>
          </section>
        );
      })}

      <section className="space-y-2" data-testid="sugerencias">
        <h3 className="text-sm font-medium">Sugerencias ({suggestions.length})</h3>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay sugerencias. El equipo las envía al bot con /sugerencia.</p>
        ) : (
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.id} className="rounded-md border border-gray-200 bg-white p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-gray-700">{s.person}</span> · {fmtAt(s.at)}
                  {!s.shown && <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-orange-800">Nueva</span>}
                </p>
                <p className="mt-1 whitespace-pre-line">{s.text}</p>
                {s.hasPhoto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/operaciones/suggestion-photo/${s.id}`} alt="Captura de la sugerencia" className="mt-2 max-h-72 rounded border border-gray-200" loading="lazy" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
