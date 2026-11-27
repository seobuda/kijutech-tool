'use client';

// Proyecto → Trabajo → Estrategia: crear una estrategia desde el catálogo (solo admin; horas calculadas en vivo con las
// mismas reglas que el servidor) o, con una activa, su ritmo por línea, el marcador de contenido y el calendario por meses
// con «Aprobar el lote del mes» (admin, en los dos primeros ciclos).
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, Check, Loader2, Play, Target, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import type { CycleView } from '@/lib/seo/estrategia/ciclos';
import { availableHours, lineHours, mondayOf, PLAYBOOKS, type PlaybookKey } from '@/lib/seo/estrategia/playbooks';
import { approveMonthAction, cancelCycleAction, createCycleAction, materializeNowAction } from '@/lib/seo/estrategia-actions';

type Res = { ok: true; message?: string } | { ok: false; error: string };
const SLOT_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = { previsto: 'neutral', aprobado: 'info', encargado: 'warning', hecho: 'success', saltado: 'danger' };
const SLOT_LABEL: Record<string, string> = { previsto: 'Por aprobar', aprobado: 'Aprobada', encargado: 'Encargada', hecho: 'Hecha', saltado: 'Saltada' };
const monthName = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

function NewCycle({ projectId, view, isAdmin }: { projectId: string; view: CycleView; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const nextMonday = useMemo(() => {
    const m = mondayOf(new Date());
    return new Date(m.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  }, []);
  const [name, setName] = useState('');
  const [months, setMonths] = useState(3);
  const [startsOn, setStartsOn] = useState(nextMonday);
  const [reserve, setReserve] = useState(30);
  const [thesis, setThesis] = useState('');
  const [chosen, setChosen] = useState<Record<string, Record<string, unknown>>>({});
  const hours = Object.entries(chosen).reduce((a, [k, p]) => a + lineHours(k as PlaybookKey, p, months), 0);
  const avail = availableHours(view.eligibility.monthlyHours, months, reserve);
  const toggle = (k: PlaybookKey) =>
    setChosen((c) => {
      const n = { ...c };
      if (n[k]) delete n[k];
      else n[k] = Object.fromEntries(PLAYBOOKS[k].params.map((d) => [d.key, d.default]));
      return n;
    });
  const setParam = (k: string, key: string, v: unknown) => setChosen((c) => ({ ...c, [k]: { ...c[k], [key]: v } }));

  return (
    <Section title="Nueva estrategia" description="Elige de 1 a 3 líneas del catálogo y su ritmo. Las horas se calculan con lo que cuesta cada tarea; el resto del contrato queda de reserva para los arreglos que vayan saliendo.">
      {msg && <p role="status" className={msg.ok ? 'mb-2 text-sm text-success' : 'mb-2 text-sm text-destructive'}>{msg.text}</p>}
      {!isAdmin && <p className="mb-2 text-sm text-muted-foreground">Solo un administrador puede crear y aprobar estrategias.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          Nombre
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Primer trimestre: contenido de servicios" disabled={!isAdmin} />
        </label>
        <label className="text-sm">
          Duración
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} disabled={!isAdmin} className="mt-1 block h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value={1}>1 mes (solo trabajo técnico)</option>
            <option value={3}>Trimestre (recomendado)</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
          </select>
        </label>
        <label className="text-sm">
          Empieza el lunes
          <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} disabled={!isAdmin} />
        </label>
        <label className="text-sm">
          Reserva para arreglos (%)
          <Input type="number" min={0} max={80} value={reserve} onChange={(e) => setReserve(Number(e.target.value))} disabled={!isAdmin} />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        Por qué esta estrategia (opcional)
        <textarea value={thesis} onChange={(e) => setThesis(e.target.value)} rows={2} disabled={!isAdmin} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" placeholder="P. ej.: tiene demanda en sus servicios y pocas páginas que la recojan." />
      </label>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {view.eligible.map((k) => {
          const pb = PLAYBOOKS[k];
          const on = Boolean(chosen[k]);
          return (
            <div key={k} className={`rounded-lg border p-3 ${on ? 'border-brand bg-brand-soft/30' : ''}`}>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={on} onChange={() => toggle(k)} disabled={!isAdmin || (!on && Object.keys(chosen).length >= 3)} className="mt-1" />
                <span>
                  <span className="font-medium">{pb.label}</span>
                  <span className="block text-xs text-muted-foreground">{pb.description}</span>
                </span>
              </label>
              {on && (
                <div className="mt-2 flex flex-wrap gap-3 pl-6 text-sm">
                  {pb.params.map((d) =>
                    d.kind === 'int' ? (
                      <label key={d.key} className="flex items-center gap-1">
                        {d.label}
                        <Input type="number" min={d.min} max={d.max} value={Number(chosen[k][d.key] ?? d.default)} onChange={(e) => setParam(k, d.key, Number(e.target.value))} className="h-8 w-16" />
                      </label>
                    ) : d.kind === 'enum' ? (
                      <label key={d.key} className="flex items-center gap-1">
                        {d.label}
                        <select value={String(chosen[k][d.key] ?? d.default)} onChange={(e) => setParam(k, d.key, e.target.value)} className="h-8 rounded-md border bg-background px-1 text-sm">
                          <option value="todos">Todos</option>
                          {view.eligibility.services.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span key={d.key} className="flex flex-wrap items-center gap-2">
                        {d.label}:
                        {d.options.map((o) => {
                          const list = (chosen[k][d.key] as string[]) ?? d.default;
                          return (
                            <label key={o} className="flex items-center gap-1 text-xs">
                              <input type="checkbox" checked={list.includes(o)} onChange={() => setParam(k, d.key, list.includes(o) ? list.filter((x) => x !== o) : [...list, o])} />
                              {o}
                            </label>
                          );
                        })}
                      </span>
                    )
                  )}
                  <span className="text-xs text-muted-foreground">≈ {lineHours(k, chosen[k], months)} h en el periodo</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {view.blocked.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Líneas que aún no se pueden hacer ({view.blocked.length})</summary>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {view.blocked.map((b) => (
              <li key={b.key}>
                <strong>{PLAYBOOKS[b.key].label}:</strong> {b.why}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className={`text-sm ${avail != null && hours > avail ? 'text-destructive' : 'text-muted-foreground'}`}>
          Necesita <strong>{Math.round(hours * 10) / 10} h</strong>
          {avail != null ? ` de ${avail} h disponibles para estrategia (${view.eligibility.monthlyHours} h/mes × ${months} meses − ${reserve} % de reserva).` : '. El proyecto no tiene horas al mes: ponlas en Editar proyecto.'}
        </p>
        {isAdmin && (
          <Button
            disabled={pending || !Object.keys(chosen).length || avail == null || hours > avail}
            onClick={() =>
              start(async () => {
                const r: Res = await createCycleAction(projectId, { name, months, startsOn, reservePct: reserve, thesis, lines: Object.entries(chosen).map(([playbook, params]) => ({ playbook, params })) });
                setMsg(r.ok ? { ok: true, text: r.message ?? 'Hecho.' } : { ok: false, text: r.error });
                if (r.ok) router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Activar la estrategia
          </Button>
        )}
      </div>
    </Section>
  );
}

export function EstrategiaPanel({ projectId, view, canEdit, isAdmin }: { projectId: string; view: CycleView; canEdit: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cancelWhy, setCancelWhy] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const act = (fn: () => Promise<Res>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? 'Hecho.' } : { ok: false, text: r.error });
      router.refresh();
    });
  const a = view.active;

  if (!a)
    return (
      <div className="flex flex-col gap-6">
        <EmptyState icon={Target} title="Este proyecto aún no tiene estrategia activa" description="Una estrategia es un periodo (normalmente un trimestre) con 1-3 líneas de trabajo y su ritmo. Las tareas se encargan solas a 2 semanas vista; en las dos primeras estrategias de cada cliente, un administrador aprueba el lote de cada mes." />
        <NewCycle projectId={projectId} view={view} isAdmin={isAdmin} />
        {view.history.length > 0 && <History view={view} />}
      </div>
    );

  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-6">
      {msg && <p role="status" className={msg.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>{msg.text}</p>}
      <Section
        title={a.name}
        description={`${fmt(a.startsOn)} – ${fmt(a.endsOn)} · lectura de resultados el ${fmt(a.readDueOn ?? a.endsOn)} · ${a.approvalMode === 'lote_admin' ? 'un administrador aprueba el lote de cada mes' : 'las tareas se aprueban solas'} · reserva para arreglos ${a.reservePct} %`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => materializeNowAction(projectId))}>
                Encargar ahora
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setShowCancel(!showCancel)}>
                <X className="size-3.5" />
                Cancelar
              </Button>
            )}
          </div>
        }
      >
        {a.thesis && <p className="mb-3 text-sm">{a.thesis}</p>}
        {showCancel && (
          <div className="mb-3 flex flex-wrap gap-2">
            <Input value={cancelWhy} onChange={(e) => setCancelWhy(e.target.value)} placeholder="Por qué se cancela" className="max-w-sm" />
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => act(() => cancelCycleAction(projectId, a.id, cancelWhy))}>
              Cancelar la estrategia
            </Button>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          {a.lines.map((l) => (
            <div key={l.id} className="rounded-lg border p-3">
              <p className="font-medium">{l.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {l.done}
                <span className="text-base font-normal text-muted-foreground"> / {l.planned} hechas</span>
              </p>
              <div className="mt-1 h-2 overflow-hidden rounded bg-muted" aria-hidden>
                <div className="h-2 bg-brand" style={{ width: `${l.planned ? Math.round((l.done / l.planned) * 100) : 0}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {l.encargados} en curso{l.overdue ? ` · ${l.overdue} con retraso` : ''}{l.saltados ? ` · ${l.saltados} saltadas` : ''} · {l.hoursUsed} de {Number(l.hoursBudget)} h
              </p>
            </div>
          ))}
        </div>
        {a.lines.some((l) => ['contenido_cadencia', 'paginas_servicio_zona', 'recuperacion_contenido'].includes(l.playbook)) && (
          <p className="mt-3 text-sm text-muted-foreground">
            Contenido publicado en esta estrategia: <strong>{a.cohort.published}</strong> página(s) · {a.cohort.impressions} impresiones y {a.cohort.clicks} clics en Google desde el inicio (sin las búsquedas anónimas). El resultado real se lee 90 días después del cierre.
          </p>
        )}
      </Section>

      {a.months.map((m) => (
        <Section
          key={m.month}
          title={monthName(m.month)}
          description={m.pendingApproval ? `${m.pendingApproval} tarea(s) por aprobar` : 'Todo aprobado'}
          actions={
            isAdmin && m.pendingApproval > 0 ? (
              <Button size="sm" disabled={pending} onClick={() => act(() => approveMonthAction(projectId, m.month))}>
                <CalendarCheck className="size-3.5" />
                Aprobar el lote de {monthName(m.month).split(' ')[0]} ({m.pendingApproval})
              </Button>
            ) : undefined
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Semana</th>
                  <th className="py-1.5 pr-3 font-medium">Tarea</th>
                  <th className="py-1.5 pr-3 font-medium">Línea</th>
                  <th className="py-1.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {m.slots.map((s) => (
                  <tr key={s.id} className={`border-b ${s.dueWeek < today && ['previsto', 'aprobado'].includes(s.status) ? 'bg-warning-soft/40' : ''}`}>
                    <td className="py-1.5 pr-3 tabular-nums">{fmt(s.dueWeek)}</td>
                    <td className="py-1.5 pr-3">
                      {s.title}
                      {s.skipReason && <span className="block text-xs text-muted-foreground">{s.skipReason}</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{s.line}</td>
                    <td className="py-1.5">
                      <Badge tone={SLOT_TONE[s.status] ?? 'neutral'}>
                        {s.status === 'hecho' && <Check className="size-3" aria-hidden />}
                        {SLOT_LABEL[s.status] ?? s.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
      {view.history.length > 0 && <History view={view} />}
    </div>
  );
}

function History({ view }: { view: CycleView }) {
  return (
    <Section title="Estrategias anteriores">
      <ul className="flex flex-col gap-1 text-sm">
        {view.history.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{h.name}</span>
            <span className="text-muted-foreground">
              {fmt(h.startsOn)} – {fmt(h.endsOn)}
            </span>
            <Badge tone={h.status === 'cancelado' ? 'danger' : 'neutral'}>{h.status}</Badge>
          </li>
        ))}
      </ul>
    </Section>
  );
}
