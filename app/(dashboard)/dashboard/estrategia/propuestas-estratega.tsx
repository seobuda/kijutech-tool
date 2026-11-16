'use client';

// Sección «Propuestas del estratega» de la pestaña Estrategia (fase 2, 16 nov 2026): el último análisis (resumen,
// diagnóstico y lo que parece funcionar en el cliente), las propuestas pendientes con su evidencia y las decisiones
// (crear encargo, ajustar, más adelante, no con motivo), el historial y los análisis anteriores con su coste.
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Brain, CheckCircle2, ExternalLink, Hourglass, PauseCircle, Pencil, Sparkles, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { decideSuggestionAction, requestAnalysisAction } from '@/lib/estrategia/actions';
import type { ClientStrategy } from '@/lib/estrategia/report';
import type { AnalysisView, SuggestionView } from '@/lib/estrategia/strategist';
import { REJECT_REASONS, SUGGESTION_STATUS_LABEL, fmtHours } from '@/lib/estrategia/strategist-rules';

const fmtTime = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const when = (iso: string | null) => (iso ? fmtTime.format(new Date(iso)) : '—');
const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = { pendiente: 'info', aprobada: 'success', ajustada: 'success', aplazada: 'neutral', rechazada: 'danger', caducada: 'neutral' };
const ANALYSIS_LABEL: Record<string, string> = { pendiente: 'En cola', en_curso: 'Analizando…', hecho: 'Hecho', error: 'Error', omitido: 'No se hizo' };
const TRIGGER_LABEL: Record<string, string> = { programado: 'Programado', alerta: 'Por alerta', manual: 'A mano' };
const EVIDENCE_LABEL: Record<string, string> = { url: 'URL', consulta: 'Consulta', palabra: 'Palabra clave', senal: 'Señal', objetivo: 'Objetivo', kpi: 'Cifra' };
const selectCls = 'h-9 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40';

export function PropuestasEstratega({ data, onChange }: { data: ClientStrategy; onChange: () => void }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { analyses, suggestions } = data.strategist;
  const last = analyses.find((a) => a.status === 'hecho') ?? null;
  const running = analyses.find((a) => a.status === 'pendiente' || a.status === 'en_curso') ?? null;
  const open = suggestions.filter((s) => s.status === 'pendiente').sort((a, b) => b.ice - a.ice);
  const later = suggestions.filter((s) => s.status === 'aplazada' || s.status === 'caducada');
  const decided = suggestions.filter((s) => ['aprobada', 'ajustada', 'rechazada'].includes(s.status));
  const enabled = data.processes.some((p) => p.key === 'estratega' && p.on);

  const ask = () =>
    start(async () => {
      const r = await requestAnalysisAction(data.clientId);
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      onChange();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Brain className="size-4" aria-hidden /> El estratega
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Revisa objetivos, cifras, señales, el trabajo hecho y su efecto, y propone las tareas con más impacto por hora dentro de las horas del contrato. Cada propuesta lleva su evidencia; nada se crea sin tu aprobación (aquí o por Telegram).
          </p>
          {!enabled && <p className="mt-2 text-xs text-warning">Su plan no incluye el análisis periódico del estratega; puedes pedirlo a mano o activarlo en «Plan y frecuencias».</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" onClick={ask} disabled={pending || Boolean(running)}>
            {running ? <Hourglass className="animate-pulse" aria-hidden /> : <Sparkles aria-hidden />} {running ? ANALYSIS_LABEL[running.status] : 'Analizar ahora'}
          </Button>
          <span className="text-xs text-muted-foreground">{running ? 'Tarda unos minutos; pulsa «Actualizar» luego.' : 'Unos 0,10-0,30 $ por análisis (Opus).'}</span>
        </div>
      </div>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={cn('text-sm', msg.ok ? 'text-success' : 'text-destructive')}>
          {msg.text}
        </p>
      )}

      {last ? <LastAnalysis a={last} /> : !running && <EmptyState icon={Brain} title="Aún no hay análisis" description="Pulsa «Analizar ahora» o espera al análisis programado de su plan. Cuantos más datos tenga (objetivos, palabras clave, Search Console, trabajo procesado), mejores serán las propuestas." />}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Propuestas pendientes ({open.length})</h3>
        {open.length === 0 ? <p className="text-sm text-muted-foreground">No hay propuestas por decidir.</p> : open.map((s) => <SuggestionCard key={s.id} s={s} objectives={data.objectives} onChange={onChange} />)}
      </section>

      {later.length > 0 && (
        <details className="rounded-xl border bg-card p-4 shadow-xs">
          <summary className="cursor-pointer text-sm font-semibold">Más adelante y caducadas ({later.length})</summary>
          <div className="mt-3 space-y-3">
            {later.map((s) => (
              <SuggestionCard key={s.id} s={s} objectives={data.objectives} onChange={onChange} />
            ))}
          </div>
        </details>
      )}

      {decided.length > 0 && (
        <details className="rounded-xl border bg-card p-4 shadow-xs">
          <summary className="cursor-pointer text-sm font-semibold">Decididas ({decided.length})</summary>
          <ul className="mt-3 divide-y text-sm">
            {decided.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p>
                    <Badge tone={STATUS_TONE[s.status]} className="mr-2">
                      {SUGGESTION_STATUS_LABEL[s.status]}
                    </Badge>
                    {s.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s.decidedBy ?? '—'} · {when(s.decidedAt)}
                    {s.rejectReason && ` · ${REJECT_REASONS[s.rejectReason as keyof typeof REJECT_REASONS] ?? s.rejectReason}`}
                    {s.rejectNote && `: ${s.rejectNote}`}
                    {s.adjustNote && ` · Ajuste: ${s.adjustNote}`}
                    {s.executed && ' · ✔ Hecha'}
                    {s.taskError && ` · ${s.taskError}`}
                  </p>
                </div>
                {s.taskUrl && (
                  <a href={s.taskUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs underline">
                    ClickUp <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {analyses.length > 0 && (
        <details className="rounded-xl border bg-card p-4 shadow-xs">
          <summary className="cursor-pointer text-sm font-semibold">Análisis anteriores ({analyses.length})</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Fecha</th>
                  <th className="py-1 pr-3 font-medium">Tipo</th>
                  <th className="py-1 pr-3 font-medium">Estado</th>
                  <th className="py-1 pr-3 font-medium">Propuestas</th>
                  <th className="py-1 pr-3 font-medium">Descartadas</th>
                  <th className="py-1 font-medium">Coste</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {analyses.map((a) => (
                  <tr key={a.id}>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{when(a.createdAt)}</td>
                    <td className="py-1.5 pr-3">{TRIGGER_LABEL[a.trigger] ?? a.trigger}</td>
                    <td className="py-1.5 pr-3">
                      {ANALYSIS_LABEL[a.status] ?? a.status}
                      {a.error && <span className="block text-xs text-destructive">{a.error}</span>}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{a.proposed}</td>
                    <td className="py-1.5 pr-3 tabular-nums" title={a.discarded.map((d) => `${d.title}: ${d.reason}`).join('\n')}>
                      {a.discarded.length}
                    </td>
                    <td className="py-1.5 tabular-nums">{a.costUsd !== null ? `${a.costUsd.toFixed(2).replace('.', ',')} $` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className="text-xs text-muted-foreground">
        La calidad del estratega (aceptación, ejecución, motivos de rechazo) está en <Link href="/dashboard/estrategia?tab=calidad" className="underline">Trabajo → Estrategia → Calidad</Link>.
      </p>
    </div>
  );
}

function LastAnalysis({ a }: { a: AnalysisView }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Último análisis</h3>
        <span className="text-xs text-muted-foreground">
          {TRIGGER_LABEL[a.trigger]} · {when(a.finishedAt ?? a.createdAt)}
          {a.reason && ` · ${a.reason}`}
        </span>
      </div>
      {a.summary && <p className="mt-2 whitespace-pre-line text-sm">{a.summary}</p>}
      {a.diagnosis.length > 0 && (
        <>
          <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Diagnóstico</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {a.diagnosis.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </>
      )}
      {a.learnings.length > 0 && (
        <>
          <h4 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Lo que parece funcionar (señales, no pruebas)</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {a.learnings.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </>
      )}
      {a.discarded.length > 0 && (
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Propuestas que el sistema descartó ({a.discarded.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {a.discarded.map((d, i) => (
              <li key={i}>
                {d.title}: {d.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function SuggestionCard({ s, objectives, onChange }: { s: SuggestionView; objectives: ClientStrategy['objectives']; onChange: () => void }) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<'ajustar' | 'rechazar' | null>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string | null } | null>(null);
  const objective = objectives.find((o) => o.id === s.objectiveId);
  const decide = (kind: 'aprobar' | 'ajustar' | 'aplazar' | 'rechazar') =>
    start(async () => {
      const r = await decideSuggestionAction(s.id, { kind, note, reason });
      setMsg(r.ok ? { ok: true, text: r.message, url: r.url } : { ok: false, text: r.error });
      if (r.ok) {
        setMode(null);
        onChange();
      }
    });

  return (
    <article className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="min-w-0 flex-1 text-sm font-semibold">
          <span className="mr-1 text-muted-foreground">{s.rank}.</span>
          {s.title}
        </h4>
        <Badge tone={STATUS_TONE[s.status]}>{SUGGESTION_STATUS_LABEL[s.status]}{s.status === 'aplazada' && s.snoozeUntil ? ` hasta el ${s.snoozeUntil}` : ''}</Badge>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Impacto {s.impact}/10</span>
        <span>Confianza {s.confidence}/10</span>
        <span title={s.hoursSource === 'equipo' ? 'Mediana de lo que tarda el equipo en este tipo de trabajo' : 'Estimación de la IA (aún no hay tiempos del equipo para este tipo)'}>
          {fmtHours(s.hours)} {s.hoursSource === 'equipo' ? '(equipo)' : '(estimada)'}
        </span>
        <span>Prioridad {s.ice.toLocaleString('es-ES', { maximumFractionDigits: 1 })}</span>
        <span>{s.categoryLabel}</span>
        {objective && <span>Objetivo: {objective.title}</span>}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm">{s.description}</p>
      {s.evidence.length > 0 && (
        <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
          <p className="font-semibold">Evidencia</p>
          <ul className="mt-1 space-y-0.5">
            {s.evidence.map((e, i) => (
              <li key={i} className="break-words">
                <span className="text-muted-foreground">{EVIDENCE_LABEL[e.tipo] ?? e.tipo}:</span> {e.ref}
                {e.dato && ` · ${e.dato}`}
                {e.periodo && ` (${e.periodo})`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.expected?.metrica && (
        <p className="mt-2 text-xs text-muted-foreground">
          Se sabrá si funciona por: {s.expected.metrica}
          {s.expected.donde && ` en ${s.expected.donde}`}
          {typeof s.expected.cambio_pct === 'number' && `, ${s.expected.cambio_pct > 0 ? '+' : ''}${s.expected.cambio_pct} %`}
          {s.expected.dias ? ` en unos ${s.expected.dias} días` : ''}.
        </p>
      )}

      {['pendiente', 'aplazada', 'caducada'].includes(s.status) && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => decide('aprobar')}>
              <CheckCircle2 aria-hidden /> Crear encargo
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode(mode === 'ajustar' ? null : 'ajustar')}>
              <Pencil aria-hidden /> Ajustar y crear
            </Button>
            {s.status === 'pendiente' && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => decide('aplazar')}>
                <PauseCircle aria-hidden /> Más adelante
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMode(mode === 'rechazar' ? null : 'rechazar')}>
              <XCircle aria-hidden /> No
            </Button>
          </div>
          {mode === 'ajustar' && (
            <div className="space-y-2">
              <label className="block text-xs font-medium" htmlFor={`aj-${s.id}`}>
                ¿Qué cambias? <span className="text-destructive">*</span>
              </label>
              <textarea id={`aj-${s.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className="w-full rounded-md border border-input bg-card px-2.5 py-2 text-sm" placeholder="Por ejemplo: hazlo solo en la página de Barcelona y que lo lleve Laura." />
              <Button size="sm" disabled={pending || !note.trim()} onClick={() => decide('ajustar')}>
                Crear con el ajuste
              </Button>
            </div>
          )}
          {mode === 'rechazar' && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium">
                Motivo <span className="text-destructive">*</span>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className={cn(selectCls, 'mt-1 block')}>
                  <option value="">Elige…</option>
                  {Object.entries(REJECT_REASONS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-[200px] flex-1 text-xs font-medium">
                Nota (opcional)
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className={cn(selectCls, 'mt-1 block w-full')} placeholder="Lo tendrá en cuenta en los próximos análisis" />
              </label>
              <Button size="sm" variant="outline" disabled={pending || !reason} onClick={() => decide('rechazar')}>
                Descartar
              </Button>
            </div>
          )}
        </div>
      )}
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={cn('mt-2 text-sm', msg.ok ? 'text-success' : 'text-destructive')}>
          {msg.text}{' '}
          {msg.url && (
            <a href={msg.url} target="_blank" rel="noopener noreferrer" className="underline">
              Abrir en ClickUp
            </a>
          )}
        </p>
      )}
    </article>
  );
}
