'use client';

// Pestaña «Estrategia» de la ficha del cliente (módulo Estrategia, fase 1, 15 nov 2026; propuestas del estratega en la
// fase 2, 16 nov): plan de seguimiento y la
// frecuencia de cada proceso (editable para este cliente), objetivos con su estado, señales (oportunidades y
// problemas), salud de la web, palabras clave y trabajo hecho con las URLs que se siguen. Solo se ven las secciones de
// los procesos que el cliente tiene activos.
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Activity, CheckCircle2, CircleSlash, Compass, Flag, Globe, KeyRound, ListChecks, Pause, Play, Plus, RefreshCw, RotateCcw, Sparkles, Target, TriangleAlert, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import {
  addKeywordsAction,
  backfillWorkAction,
  closeObjectiveAction,
  deleteKeywordAction,
  deleteObjectiveAction,
  deleteTrackedUrlAction,
  getClientStrategyAction,
  objectiveBaselineAction,
  pauseClientAction,
  runProcessNowAction,
  saveClientOverrideAction,
  saveObjectiveAction,
  setClientPlanAction,
  setSignalStatusAction,
  setWorkUrlAction,
  suggestKeywordsAction,
  updateKeywordAction
} from '@/lib/estrategia/actions';
import type { ClientStrategy, ObjectiveView, ProcessView } from '@/lib/estrategia/report';
import { FREQUENCY_LABEL, addDays, fmtDayYear, type Health } from '@/lib/estrategia/rules';
import { ConfirmDelete } from '../clientes/ui';
import { PropuestasEstratega } from './propuestas-estratega';

const selectCls = 'h-9 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40';
const inputCls = cn(selectCls, 'w-full');
const fmtTime = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const when = (iso: string | null) => (iso ? fmtTime.format(new Date(iso)) : '—');
const n1 = (v: number | null | undefined, format: 'int' | 'pct' | 'dec' = 'int') => (v === null || v === undefined ? '—' : format === 'int' ? Math.round(v).toLocaleString('es-ES') : format === 'pct' ? `${(Math.round(v * 10) / 10).toLocaleString('es-ES')} %` : (Math.round(v * 10) / 10).toLocaleString('es-ES'));

export const HEALTH_TONE: Record<Health, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  en_camino: 'success',
  logrado: 'success',
  vigilar: 'info',
  en_riesgo: 'warning',
  desviado: 'danger',
  vencido: 'danger',
  sin_datos: 'neutral',
  pendiente: 'neutral'
};
const SEV_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = { critico: 'danger', aviso: 'warning', info: 'neutral' };
const SEV_LABEL: Record<string, string> = { critico: 'Crítico', aviso: 'Aviso', info: 'Oportunidad' };
const RUN_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { ok: 'success', aviso: 'warning', error: 'danger', omitido: 'neutral', pendiente: 'neutral' };
const RUN_LABEL: Record<string, string> = { ok: 'Correcto', aviso: 'Con avisos', error: 'Error', omitido: 'Sin datos', pendiente: 'Pendiente' };
const COST_LABEL: Record<string, string> = { gratis: 'Gratis', ia_minima: 'IA mínima', ia: 'IA (Opus)', dataforseo: 'DataForSEO' };

type Section = 'resumen' | 'propuestas' | 'objetivos' | 'palabras' | 'web' | 'trabajo' | 'seguimiento';

export function ClienteEstrategia({ clientId, isAdmin }: { clientId: string; isAdmin: boolean }) {
  const [data, setData] = useState<ClientStrategy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, start] = useTransition();
  const [section, setSection] = useState<Section>('resumen');
  const reqId = useRef(0);
  const load = useCallback(() => {
    const id = ++reqId.current;
    start(async () => {
      const r = await getClientStrategyAction(clientId);
      if (id !== reqId.current) return;
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else setError(r.error);
    });
  }, [clientId]);
  useEffect(load, [load]);

  const on = useMemo(() => new Set((data?.processes ?? []).filter((p) => p.on).map((p) => p.key)), [data]);
  const pendingCount = data?.strategist.suggestions.filter((s) => s.status === 'pendiente').length ?? 0;
  const sections = useMemo(() => {
    const s: { key: Section; label: string; icon: typeof Compass; show: boolean }[] = [
      { key: 'resumen', label: 'Resumen', icon: Compass, show: true },
      { key: 'propuestas', label: `Propuestas${pendingCount ? ` (${pendingCount})` : ''}`, icon: Sparkles, show: on.has('estratega') || (data?.strategist.suggestions.length ?? 0) > 0 },
      { key: 'objetivos', label: 'Objetivos', icon: Target, show: on.has('objetivos') },
      { key: 'palabras', label: 'Palabras clave', icon: KeyRound, show: on.has('keywords') },
      { key: 'web', label: 'Salud de la web', icon: Globe, show: on.has('critico') || on.has('salud') || on.has('velocidad') },
      { key: 'trabajo', label: 'Trabajo e impacto', icon: Wrench, show: on.has('extraccion') || on.has('urls') },
      { key: 'seguimiento', label: 'Plan y frecuencias', icon: ListChecks, show: true }
    ];
    return s.filter((x) => x.show);
  }, [on, data, pendingCount]);

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) return <Skeleton className="h-64 w-full" />;

  if (!data.planId) return <NoPlan data={data} isAdmin={isAdmin} onDone={load} />;
  const current = sections.some((s) => s.key === section) ? section : 'resumen';
  const plan = data.plans.find((p) => p.id === data.planId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Plan <b className="text-foreground">{plan?.name}</b>
          {data.pausedUntil && data.pausedUntil >= data.today && (
            <Badge tone="warning" className="ml-2">
              En pausa hasta el {fmtDayYear(data.pausedUntil)}
            </Badge>
          )}
          {!data.hasGsc && <span className="ml-2 text-xs">· Sin Search Console asignado: palabras clave, URLs y detectores no tienen datos.</span>}
        </p>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={cn(loading && 'animate-spin')} aria-hidden /> Actualizar
        </Button>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Secciones de la estrategia">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            aria-current={current === s.key ? 'page' : undefined}
            className={cn('flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm', current === s.key ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            <s.icon className="size-4" aria-hidden />
            {s.label}
          </button>
        ))}
      </nav>
      {current === 'resumen' && <Resumen data={data} go={setSection} onChange={load} />}
      {current === 'propuestas' && <PropuestasEstratega data={data} onChange={load} />}
      {current === 'objetivos' && <Objetivos data={data} isAdmin={isAdmin} onChange={load} />}
      {current === 'palabras' && <Palabras data={data} onChange={load} />}
      {current === 'web' && <Web data={data} onChange={load} />}
      {current === 'trabajo' && <Trabajo data={data} onChange={load} />}
      {current === 'seguimiento' && <Seguimiento data={data} isAdmin={isAdmin} onChange={load} />}
    </div>
  );
}

function useAct(onDone: () => void) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Si la acción devuelve «message», se enseña (gana a okText).
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, okText?: string) =>
    start(async () => {
      const r = await fn();
      const text = r.message ?? okText;
      setMsg(r.ok ? (text ? { ok: true, text } : null) : { ok: false, text: r.error ?? 'Error' });
      if (r.ok) onDone();
    });
  const Msg = () => (msg ? <span role={msg.ok ? 'status' : 'alert'} className={cn('text-sm', msg.ok ? 'text-success' : 'text-destructive')}>{msg.text}</span> : null);
  return { pending, run, Msg, setMsg };
}

// --- Sin plan -------------------------------------------------------------------------------------------------------

function NoPlan({ data, isAdmin, onDone }: { data: ClientStrategy; isAdmin: boolean; onDone: () => void }) {
  const { pending, run, Msg } = useAct(onDone);
  return (
    <div className="space-y-4">
      <EmptyState
        icon={Compass}
        title="Este cliente no tiene seguimiento activo"
        description={isAdmin ? 'Elige un plan: decide qué se revisa y cada cuánto (la web, la ficha de Google, palabras clave, objetivos y oportunidades). Luego puedes ajustar cada frecuencia solo para este cliente.' : 'Un administrador puede activarlo eligiendo un plan de seguimiento.'}
      />
      {isAdmin && (
        <div className="grid gap-3 md:grid-cols-3">
          {data.plans.map((p) => (
            <div key={p.id} className="flex flex-col rounded-xl border bg-card p-4 shadow-xs">
              <h3 className="text-sm font-semibold">{p.name}</h3>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{p.description}</p>
              <Button size="sm" className="mt-3 self-start" disabled={pending} onClick={() => run(() => setClientPlanAction(data.clientId, p.id))}>
                <Play aria-hidden /> Activar con este plan
              </Button>
            </div>
          ))}
        </div>
      )}
      <Msg />
      {isAdmin && (
        <p className="text-xs text-muted-foreground">
          Los planes y sus frecuencias se editan en <Link href="/dashboard/estrategia?tab=planes" className="underline">Trabajo → Estrategia → Planes</Link>.
        </p>
      )}
    </div>
  );
}

// --- Resumen --------------------------------------------------------------------------------------------------------

function Resumen({ data, go, onChange }: { data: ClientStrategy; go: (s: Section) => void; onChange: () => void }) {
  const open = data.signals.filter((s) => s.status === 'abierta');
  const active = data.objectives.filter((o) => o.status === 'activo');
  const crit = data.health.critico;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <button onClick={() => go('objetivos')} className="rounded-xl border bg-card p-4 text-left shadow-xs hover:border-brand/40">
          <p className="text-xs text-muted-foreground">Objetivos activos</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{active.length}</p>
          <p className="mt-1 flex flex-wrap gap-1">
            {active.map((o) => (
              <Badge key={o.id} tone={HEALTH_TONE[o.health]} dot>
                {o.healthLabel}
              </Badge>
            ))}
          </p>
        </button>
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <p className="text-xs text-muted-foreground">Señales abiertas</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{open.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {open.filter((s) => s.severity === 'critico').length} crítica(s) · {open.filter((s) => s.severity === 'aviso').length} aviso(s) · {open.filter((s) => s.severity === 'info').length} oportunidad(es)
          </p>
        </div>
        <button onClick={() => go('web')} className="rounded-xl border bg-card p-4 text-left shadow-xs hover:border-brand/40">
          <p className="text-xs text-muted-foreground">Web</p>
          <p className="mt-1 text-lg font-semibold">{crit ? (crit.status === 'ok' ? 'Correcta' : crit.status === 'critico' ? 'Con problemas' : 'Con avisos') : 'Sin comprobar'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{crit ? `Comprobada ${when(crit.checkedAt)}` : 'La primera comprobación llega en la próxima hora.'}</p>
        </button>
      </div>
      {data.warnings.length > 0 && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {data.warnings.join(' ')}
        </p>
      )}
      <Signals data={data} onChange={onChange} />
    </div>
  );
}

function Signals({ data, onChange }: { data: ClientStrategy; onChange: () => void }) {
  const { pending, run, Msg } = useAct(onChange);
  const [showClosed, setShowClosed] = useState(false);
  const list = data.signals.filter((s) => showClosed || s.status === 'abierta').sort((a, b) => ['critico', 'aviso', 'info'].indexOf(a.severity) - ['critico', 'aviso', 'info'].indexOf(b.severity));
  return (
    <section className="rounded-xl border bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Señales: oportunidades y problemas</h3>
          <p className="text-xs text-muted-foreground">Las detectan los procesos con los datos de Google y de la web. «Atendida» = ya se está trabajando; «Descartar» = no aplica.</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="size-3.5 accent-[var(--brand)]" /> Ver también las cerradas (30 días)
        </label>
      </div>
      {list.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Nada abierto. Los detectores pasan con la frecuencia de su plan.</p>
      ) : (
        <ul className="divide-y">
          {list.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <Badge tone={SEV_TONE[s.severity] ?? 'neutral'} className="mr-2">
                    {SEV_LABEL[s.severity] ?? s.severity}
                  </Badge>
                  {s.title}
                </p>
                {s.detail && (
                  <details className="mt-1 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Detalle</summary>
                    <p className="mt-1 whitespace-pre-line break-words">{s.detail}</p>
                  </details>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Desde {when(s.firstSeen)}
                  {s.status !== 'abierta' && ` · ${s.status}`}
                </p>
              </div>
              <div className="flex gap-1">
                {s.status === 'abierta' ? (
                  <>
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setSignalStatusAction(s.id, 'atendida'))}>
                      <CheckCircle2 aria-hidden /> Atendida
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setSignalStatusAction(s.id, 'descartada'))}>
                      <CircleSlash aria-hidden /> Descartar
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setSignalStatusAction(s.id, 'abierta'))}>
                    <RotateCcw aria-hidden /> Reabrir
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 pb-3">
        <Msg />
      </div>
    </section>
  );
}

// --- Objetivos ------------------------------------------------------------------------------------------------------

function Objetivos({ data, isAdmin, onChange }: { data: ClientStrategy; isAdmin: boolean; onChange: () => void }) {
  const [editing, setEditing] = useState<ObjectiveView | 'new' | null>(null);
  const { pending, run, Msg } = useAct(onChange);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">El estado compara la cifra de los últimos 28 días con una curva que tiene en cuenta que el SEO tarda en notarse (y la temporada, si hay un año de datos). Nunca sale «desviado» los primeros meses: como mucho «vigilar».</p>
        {!editing && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus aria-hidden /> Nuevo objetivo
          </Button>
        )}
      </div>
      {editing && <ObjectiveForm data={data} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChange(); }} />}
      {data.objectives.length === 0 && !editing ? (
        <EmptyState icon={Target} title="Aún no hay objetivos" description="Crea el primero: elige la cifra (clics, llamadas, conversiones…), calcula su partida con los datos del cliente y elige una meta prudente, esperada o ambiciosa." action={<Button size="sm" onClick={() => setEditing('new')}><Plus aria-hidden /> Nuevo objetivo</Button>} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.objectives.map((o) => (
            <article key={o.id} className={cn('rounded-xl border bg-card p-4 shadow-xs', o.status !== 'activo' && 'opacity-75')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{o.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {o.kind === 'kpi' ? o.kpiLabel : 'Hito (sí o no)'} · {fmtDayYear(o.start)} → {fmtDayYear(o.due)}
                  </p>
                </div>
                <Badge tone={o.status === 'activo' ? HEALTH_TONE[o.health] : o.status === 'logrado' ? 'success' : 'neutral'} dot>
                  {o.healthLabel}
                </Badge>
              </div>
              {o.kind === 'kpi' && (
                <>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <dt className="text-xs text-muted-foreground">Partida</dt>
                      <dd className="font-semibold tabular-nums">{n1(o.baseline, o.format)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Ahora (28 días{o.format === 'int' ? ', al mes' : ''})</dt>
                      <dd className="font-semibold tabular-nums">{n1(o.actual, o.format)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Meta</dt>
                      <dd className="font-semibold tabular-nums">{n1(o.target, o.format)}</dd>
                    </div>
                  </dl>
                  <Progress o={o} />
                </>
              )}
              {o.note && <p className="mt-2 text-xs text-muted-foreground">{o.note}</p>}
              {o.notes && <p className="mt-1 text-xs">{o.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => setEditing(o)} disabled={pending}>
                  Editar
                </Button>
                {o.status === 'activo' ? (
                  <>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => closeObjectiveAction(o.id, 'logrado'))}>
                      <Flag aria-hidden /> Logrado
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => closeObjectiveAction(o.id, 'no_logrado'))}>
                      No logrado
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => closeObjectiveAction(o.id, 'descartado'))}>
                      Descartar
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => closeObjectiveAction(o.id, 'activo'))}>
                    <RotateCcw aria-hidden /> Reabrir
                  </Button>
                )}
                {isAdmin && <ConfirmDelete what={`el objetivo «${o.title}»`} disabled={pending} onConfirm={() => run(() => deleteObjectiveAction(o.id))} />}
              </div>
            </article>
          ))}
        </div>
      )}
      <Msg />
    </div>
  );
}

function Progress({ o }: { o: ObjectiveView }) {
  const pct = o.progressPct === null ? 0 : Math.max(0, Math.min(100, o.progressPct));
  const expectedPct = o.expected !== null && o.baseline !== null && o.target !== null && o.target !== o.baseline ? Math.max(0, Math.min(100, Math.round(((o.expected - o.baseline) / (o.target - o.baseline)) * 100))) : null;
  return (
    <div className="mt-3">
      <div className="relative h-2 rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Avance hacia la meta">
        <div className={cn('h-2 rounded-full', o.health === 'desviado' || o.health === 'vencido' ? 'bg-destructive' : o.health === 'en_riesgo' ? 'bg-warning' : 'bg-success')} style={{ width: `${pct}%` }} />
        {expectedPct !== null && <div className="absolute -top-1 h-4 w-0.5 bg-foreground/70" style={{ left: `${expectedPct}%` }} title="Lo esperado hoy" />}
      </div>
      <p className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>Avance {o.progressPct === null ? '—' : `${o.progressPct} %`}{expectedPct !== null ? ` (esperado hoy: ${expectedPct} %)` : ''}</span>
        <span>Plazo transcurrido: {o.elapsedPct} %</span>
      </p>
    </div>
  );
}

function ObjectiveForm({ data, initial, onClose, onSaved }: { data: ClientStrategy; initial: ObjectiveView | null; onClose: () => void; onSaved: () => void }) {
  const today = data.today;
  const [f, setF] = useState({
    title: initial?.title ?? '',
    kind: (initial?.kind ?? 'kpi') as 'kpi' | 'hito',
    kpiKey: initial?.kpiKey ?? data.kpis[0]?.key ?? '',
    start: initial?.start ?? today,
    due: initial?.due ?? addDays(today, 182),
    baseline: initial?.baseline ?? null,
    baselineYoy: initial?.baselineYoy ?? null,
    target: initial?.target ?? null,
    targetLow: initial?.targetLow ?? null,
    targetHigh: initial?.targetHigh ?? null,
    curve: (initial?.curve ?? 's') as 's' | 'lineal',
    priority: initial?.priority ?? 2,
    notes: initial?.notes ?? ''
  });
  const [info, setInfo] = useState<string | null>(null);
  const { pending, run, Msg } = useAct(onSaved);
  const [calc, startCalc] = useTransition();
  const months = Math.max(1, Math.round((Date.parse(f.due) - Date.parse(f.start)) / (30.4 * 86_400_000)));
  const kpi = data.kpis.find((k) => k.key === f.kpiKey);
  const calculate = () =>
    startCalc(async () => {
      const r = await objectiveBaselineAction(data.clientId, f.kpiKey, months);
      if (!r.ok) return setInfo(r.error);
      if (r.baseline === null) return setInfo('No hay datos de esa cifra para este cliente (¿falta asignar la propiedad en Webs y cuentas?). Puedes poner la partida a mano.');
      setF((x) => ({ ...x, baseline: r.baseline, baselineYoy: r.yoy, targetLow: r.proposals?.low ?? null, target: r.proposals?.mid ?? x.target, targetHigh: r.proposals?.high ?? null }));
      setInfo(`Partida: media mensual de los 3 últimos meses completos${r.yoy !== null ? ` (hace un año: ${n1(r.yoy, kpi?.format)})` : ''}. Metas orientativas para ${months} meses; ajústalas a lo que sabes del cliente.`);
    });
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const save = () =>
    run(() =>
      saveObjectiveAction(data.clientId, {
        id: initial?.id ?? null,
        title: f.title || (kpi ? `${kpi.short}: ${n1(f.target, kpi.format)}` : ''),
        kind: f.kind,
        kpiKey: f.kind === 'kpi' ? f.kpiKey : null,
        baselineValue: f.baseline,
        baselineYoy: f.baselineYoy,
        targetValue: f.target,
        targetLow: f.targetLow,
        targetHigh: f.targetHigh,
        curve: f.curve,
        startDate: f.start,
        dueDate: f.due,
        priority: f.priority,
        notes: f.notes
      })
    );
  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs">
      <h3 className="text-sm font-semibold">{initial ? 'Editar objetivo' : 'Nuevo objetivo'}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-xs text-muted-foreground">Título (opcional; si lo dejas vacío se pone solo)</span>
          <input className={inputCls} value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ej.: Más llamadas desde la ficha de Google" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Tipo *</span>
          <select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'kpi' | 'hito' })}>
            <option value="kpi">Cifra medible</option>
            <option value="hito">Hito (sí o no, p. ej. «web nueva publicada»)</option>
          </select>
        </label>
        {f.kind === 'kpi' && (
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Cifra *</span>
            <select className={inputCls} value={f.kpiKey} onChange={(e) => setF({ ...f, kpiKey: e.target.value, baseline: null, target: null, targetLow: null, targetHigh: null })}>
              {data.kpis.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                  {k.lowerBetter ? ' (mejor si baja)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Inicio *</span>
          <input type="date" className={inputCls} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Fecha límite * ({months} meses)</span>
          <input type="date" className={inputCls} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        </label>
        {f.kind === 'kpi' && (
          <>
            <div className="md:col-span-2 flex flex-wrap items-end gap-3">
              <Button size="sm" variant="outline" onClick={calculate} disabled={calc || !f.kpiKey}>
                <Sparkles aria-hidden /> {calc ? 'Calculando…' : 'Calcular partida y proponer metas'}
              </Button>
              {info && <p className="text-xs text-muted-foreground">{info}</p>}
            </div>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Partida ({kpi?.summable ? 'al mes' : 'valor medio'})</span>
              <input className={inputCls} inputMode="decimal" value={f.baseline ?? ''} onChange={(e) => setF({ ...f, baseline: num(e.target.value) })} />
            </label>
            <div className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Meta * {kpi?.summable ? '(al mes)' : ''}</span>
              <input className={inputCls} inputMode="decimal" value={f.target ?? ''} onChange={(e) => setF({ ...f, target: num(e.target.value) })} />
              {(f.targetLow !== null || f.targetHigh !== null) && (
                <div className="mt-1 flex flex-wrap gap-1 text-xs">
                  {[
                    ['Prudente', f.targetLow],
                    ['Esperada', f.targetLow !== null && f.targetHigh !== null ? Math.round(((f.targetLow + f.targetHigh) / 2) * 100) / 100 : null],
                    ['Ambiciosa', f.targetHigh]
                  ].map(([label, v]) =>
                    v === null ? null : (
                      <button key={String(label)} type="button" onClick={() => setF({ ...f, target: v as number })} className={cn('rounded-md border px-2 py-0.5', f.target === v ? 'border-brand bg-brand/10' : 'hover:bg-muted')}>
                        {label}: {n1(v as number, kpi?.format)}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Ritmo esperado</span>
              <select className={inputCls} value={f.curve} onChange={(e) => setF({ ...f, curve: e.target.value as 's' | 'lineal' })}>
                <option value="s">Curva SEO: lento al principio, grueso entre los meses 3 y 9 (recomendado)</option>
                <option value="lineal">Lineal (campañas, cambios inmediatos)</option>
              </select>
            </label>
          </>
        )}
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Prioridad</span>
          <select className={inputCls} value={f.priority} onChange={(e) => setF({ ...f, priority: Number(e.target.value) })}>
            <option value={1}>Alta</option>
            <option value={2}>Normal</option>
            <option value={3}>Baja</option>
          </select>
        </label>
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-xs text-muted-foreground">Notas (por qué esta meta, qué se acordó con el cliente)</span>
          <textarea className={cn(inputCls, 'h-20 py-2')} maxLength={2000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={pending || (f.kind === 'kpi' && f.target === null)}>
          {pending ? 'Guardando…' : 'Guardar objetivo'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Msg />
      </div>
    </section>
  );
}

// --- Palabras clave -------------------------------------------------------------------------------------------------

function Spark({ values }: { values: (number | null)[] }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v !== null) as { v: number; i: number }[];
  if (pts.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const max = Math.max(...pts.map((p) => p.v));
  const min = Math.min(...pts.map((p) => p.v));
  const y = (v: number) => (max === min ? 10 : 2 + ((v - min) / (max - min)) * 16); // posición: más arriba = mejor
  const x = (i: number) => (i / (values.length - 1)) * 70;
  return (
    <svg width="72" height="20" viewBox="0 0 72 20" role="img" aria-label={`Posición en las últimas semanas: ${pts.map((p) => p.v).join(', ')}`}>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand" points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} />
    </svg>
  );
}

function Palabras({ data, onChange }: { data: ClientStrategy; onChange: () => void }) {
  const [text, setText] = useState('');
  const [critical, setCritical] = useState(false);
  const [sugg, setSugg] = useState<{ keyword: string; impressions: number; clicks: number; position: number }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { pending, run, Msg, setMsg } = useAct(onChange);
  const [loadingS, startS] = useTransition();
  const add = (words: string[], crit: boolean) =>
    run(async () => {
      const r = await addKeywordsAction(data.clientId, words, crit);
      if (!r.ok) return r;
      setText('');
      setPicked(new Set());
      setSugg(null);
      return { ok: true, message: `${r.added} palabra(s) añadida(s). Se revisan con la frecuencia de su plan (o pulsa «Ejecutar ahora» en Plan y frecuencias).` };
    });
  const suggest = () =>
    startS(async () => {
      const r = await suggestKeywordsAction(data.clientId);
      if (r.ok) setSugg(r.items);
      else setMsg({ ok: false, text: r.error });
    });
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <h3 className="text-sm font-semibold">Añadir palabras clave</h3>
        <p className="mt-1 text-xs text-muted-foreground">Una por línea. La posición sale de Search Console (posición media). Las críticas se miran cada día y avisan si bajan.</p>
        <textarea className={cn(inputCls, 'mt-2 h-24 py-2')} value={text} onChange={(e) => setText(e.target.value)} placeholder={'abogado laboralista barcelona\ndespido improcedente'} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} className="size-4 accent-[var(--brand)]" /> Críticas
          </label>
          <Button size="sm" disabled={pending || !text.trim()} onClick={() => add(text.split('\n'), critical)}>
            <Plus aria-hidden /> Añadir
          </Button>
          <Button size="sm" variant="outline" disabled={loadingS || !data.hasGsc} onClick={suggest} title={data.hasGsc ? undefined : 'Asigna antes la propiedad de Search Console'}>
            <Sparkles aria-hidden /> {loadingS ? 'Buscando…' : 'Sugerir desde Search Console'}
          </Button>
          <Msg />
        </div>
        {sugg && (
          <div className="mt-3 rounded-md border">
            {sugg.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No hay consultas nuevas que sugerir.</p>
            ) : (
              <>
                <ul className="max-h-72 divide-y overflow-y-auto text-sm">
                  {sugg.map((s) => (
                    <li key={s.keyword} className="flex items-center gap-2 px-3 py-1.5">
                      <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={picked.has(s.keyword)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s.keyword); else n.delete(s.keyword); return n; })} aria-label={s.keyword} />
                      <span className="flex-1">{s.keyword}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{s.impressions} impr. · pos. {s.position}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 border-t p-2">
                  <Button size="sm" disabled={pending || !picked.size} onClick={() => add([...picked], false)}>
                    Añadir {picked.size || ''} seleccionada(s)
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSugg(null)}>
                    Cerrar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
      {data.keywords.length === 0 ? (
        <EmptyState icon={KeyRound} title="Aún no se sigue ninguna palabra" description="Añádelas arriba o pulsa «Sugerir desde Search Console» para elegir entre las búsquedas que ya le traen impresiones." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th>Palabra</th>
                <th className="text-right">Posición</th>
                <th className="text-right">Semana anterior</th>
                <th className="text-right">Clics (7 días)</th>
                <th className="text-right">Impresiones</th>
                <th>8 semanas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.keywords.map((k) => {
                const diff = k.position !== null && k.prevPosition !== null ? k.prevPosition - k.position : null;
                return (
                  <tr key={k.id} className={cn(!k.active && 'opacity-60')}>
                    <td>
                      <span className="font-medium">{k.keyword}</span>
                      {k.critical && <Badge tone="warning" className="ml-2">Crítica</Badge>}
                      {k.targetUrl && <span className="block truncate text-xs text-muted-foreground">{k.targetUrl}</span>}
                    </td>
                    <td className="text-right tabular-nums">
                      {k.position === null ? <span className="text-muted-foreground">{k.checkedOn ? 'Sin datos' : 'Pendiente'}</span> : n1(k.position, 'dec')}
                      {diff !== null && Math.abs(diff) >= 0.5 && <span className={cn('ml-1 text-xs', diff > 0 ? 'text-success' : 'text-destructive')}>{diff > 0 ? `▲${n1(diff, 'dec')}` : `▼${n1(-diff, 'dec')}`}</span>}
                    </td>
                    <td className="text-right tabular-nums text-muted-foreground">{n1(k.prevPosition, 'dec')}</td>
                    <td className="text-right tabular-nums">{n1(k.clicks)}</td>
                    <td className="text-right tabular-nums">{n1(k.impressions)}</td>
                    <td>
                      <Spark values={k.spark} />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => updateKeywordAction(k.id, { critical: !k.critical }))}>
                        {k.critical ? 'No crítica' : 'Crítica'}
                      </Button>
                      <ConfirmDelete label="Quitar" what={`«${k.keyword}» (y su historial)`} disabled={pending} onConfirm={() => run(() => deleteKeywordAction(k.id))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Salud de la web ------------------------------------------------------------------------------------------------

function Web({ data, onChange }: { data: ClientStrategy; onChange: () => void }) {
  const cards: { key: 'critico' | 'salud' | 'velocidad'; title: string; process: string }[] = [
    { key: 'critico', title: 'Vigilancia crítica', process: 'critico' },
    { key: 'salud', title: 'Salud técnica', process: 'salud' },
    { key: 'velocidad', title: 'Velocidad (Core Web Vitals)', process: 'velocidad' }
  ];
  const active = new Set(data.processes.filter((p) => p.on).map((p) => p.key as string));
  return (
    <div className="space-y-3">
      {cards
        .filter((c) => active.has(c.process))
        .map((c) => {
          const h = data.health[c.key];
          return (
            <section key={c.key} className="rounded-xl border bg-card shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold">{c.title}</h3>
                  <p className="text-xs text-muted-foreground">{h ? `Última comprobación: ${when(h.checkedAt)}` : 'Aún no se ha comprobado.'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {h && <Badge tone={h.status === 'ok' ? 'success' : h.status === 'critico' ? 'danger' : 'warning'} dot>{h.status === 'ok' ? 'Correcto' : h.status === 'critico' ? 'Problemas' : 'Avisos'}</Badge>}
                  <RunNow clientId={data.clientId} process={c.process} onDone={onChange} />
                </div>
              </div>
              {c.key === 'velocidad' && h && <SpeedTable metrics={h.metrics} />}
              {h && h.issues.length > 0 ? (
                <ul className="divide-y text-sm">
                  {h.issues.map((i, k) => (
                    <li key={k} className="flex items-start gap-2 px-4 py-2">
                      <Badge tone={SEV_TONE[i.severity] ?? 'neutral'}>{i.severity === 'info' ? 'Detalle' : SEV_LABEL[i.severity]}</Badge>
                      <span className="min-w-0 flex-1">
                        {i.detail}
                        {i.url && <span className="block break-all text-xs text-muted-foreground">{i.url}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : h ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">Sin problemas.</p>
              ) : null}
            </section>
          );
        })}
    </div>
  );
}

function SpeedTable({ metrics }: { metrics: Record<string, unknown> }) {
  const results = (Array.isArray(metrics.results) ? metrics.results : []) as { url: string; score?: number | null; error?: string; field?: { lcpMs: number | null; inpMs: number | null; cls: number | null; category: string | null; origin: boolean } | null }[];
  if (!results.length) return null;
  const CAT: Record<string, string> = { FAST: 'Aprobado', AVERAGE: 'Necesita mejorar', SLOW: 'Suspenso' };
  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-[640px]">
        <thead>
          <tr>
            <th>Página</th>
            <th>Usuarios reales (28 días)</th>
            <th className="text-right">LCP</th>
            <th className="text-right">INP</th>
            <th className="text-right">CLS</th>
            <th className="text-right">Laboratorio</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.url}>
              <td className="max-w-[260px] truncate">{r.url}</td>
              <td>{r.error ? <span className="text-destructive">{r.error}</span> : r.field ? `${CAT[r.field.category ?? ''] ?? '—'}${r.field.origin ? ' (toda la web)' : ''}` : 'Sin datos de usuarios'}</td>
              <td className="text-right tabular-nums">{r.field?.lcpMs ? `${(r.field.lcpMs / 1000).toFixed(1)} s` : '—'}</td>
              <td className="text-right tabular-nums">{r.field?.inpMs ? `${r.field.inpMs} ms` : '—'}</td>
              <td className="text-right tabular-nums">{r.field?.cls !== null && r.field?.cls !== undefined ? r.field.cls.toFixed(2) : '—'}</td>
              <td className="text-right tabular-nums">{typeof r.score === 'number' ? `${r.score}/100` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunNow({ clientId, process, onDone }: { clientId: string; process: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {msg && <span className="max-w-[280px] truncate text-xs text-muted-foreground" title={msg}>{msg}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await runProcessNowAction(clientId, process);
            setMsg(r.ok ? r.summary : r.error);
            if (r.ok) onDone();
          })
        }
      >
        <Activity className={cn(pending && 'animate-pulse')} aria-hidden /> {pending ? 'Ejecutando…' : 'Ejecutar ahora'}
      </Button>
    </span>
  );
}

// --- Trabajo e impacto ----------------------------------------------------------------------------------------------

function Trabajo({ data, onChange }: { data: ClientStrategy; onChange: () => void }) {
  const { pending, run, Msg } = useAct(onChange);
  const [urlFor, setUrlFor] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  return (
    <div className="space-y-4">
      {data.workload && (
        <p className="text-sm text-muted-foreground">
          Horas este mes: <b className="text-foreground">{data.workload.hoursMonth ?? '—'}</b>
          {data.workload.monthlyHours ? ` de ${data.workload.monthlyHours} contratadas` : ''} · Encargos abiertos: {data.workload.openTasks}
          {data.workload.upcoming !== null ? ` · Planificados (próximos ${data.workload.horizonDays} días): ${data.workload.upcoming}` : ''}
        </p>
      )}
      <section className="rounded-xl border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">URLs trabajadas que se siguen</h3>
            <p className="text-xs text-muted-foreground">Clics de los 28 días antes del cambio frente a los días desde que Google la volvió a rastrear. Hacen falta 4 semanas de datos para comparar; con poco tráfico no se saca conclusión por página (cuenta en el conjunto).</p>
          </div>
        </div>
        {data.tracked.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Aún no hay URLs. Se añaden solas al terminar encargos con URL (o cuando el equipo responde «¿en qué URL?»).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[760px]">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Cambio</th>
                  <th>Rastreada</th>
                  <th className="text-right">Antes (clics/día)</th>
                  <th className="text-right">Después (clics/día)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.tracked.map((t) => {
                  const b = t.before.days ? t.before.clicks / t.before.days : null;
                  const a = t.after.days ? t.after.clicks / t.after.days : null;
                  return (
                    <tr key={t.id}>
                      <td className="max-w-[300px]">
                        <a href={t.url} target="_blank" rel="noreferrer" className="block truncate hover:underline">{t.url}</a>
                        <span className="block truncate text-xs text-muted-foreground">{t.reason}</span>
                      </td>
                      <td className="whitespace-nowrap">{fmtDayYear(t.changedOn)}</td>
                      <td className="whitespace-nowrap">{t.crawledOn ? fmtDayYear(t.crawledOn) : <span className="text-muted-foreground">Esperando a Google</span>}</td>
                      <td className="text-right tabular-nums">{b === null ? '—' : b.toFixed(1)}</td>
                      <td className="text-right tabular-nums">
                        {a === null ? '—' : a.toFixed(1)}
                        {!t.enoughData && <span className="block text-xs text-muted-foreground">faltan datos</span>}
                      </td>
                      <td className="text-right">
                        <ConfirmDelete label="Dejar de seguir" what={`el seguimiento de esta URL`} disabled={pending} onConfirm={() => run(() => deleteTrackedUrlAction(t.id))} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="rounded-xl border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Encargos terminados</h3>
            <p className="text-xs text-muted-foreground">Al cerrarse un encargo se guarda qué se hizo y sobre qué URL. Si falta la URL, se pregunta por Telegram a quien lo hizo; también puedes ponerla aquí.</p>
          </div>
          {data.pendingWork.length > 0 && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(async () => { const r = await backfillWorkAction(data.clientId); return r.ok ? { ok: true, message: `${r.processed} encargo(s) procesado(s).` } : r; })}>
              Procesar {data.pendingWork.length} encargo(s) anterior(es)
            </Button>
          )}
        </div>
        {data.work.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Aún no hay encargos procesados de este cliente.</p>
        ) : (
          <ul className="divide-y">
            {data.work.map((w) => (
              <li key={w.taskId} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p>
                      <Badge tone="neutral" className="mr-2">{w.categoryLabel}</Badge>
                      {w.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {fmtDayYear(w.doneOn)}
                      {w.hours !== null ? ` · ${w.hours} h` : ''}
                      {w.keywords.length ? ` · ${w.keywords.join(', ')}` : ''}
                      {w.extraction === 'reglas' ? ' · sin IA' : ''}
                    </p>
                    {w.urls.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer" className="block break-all text-xs text-brand hover:underline">{u}</a>
                    ))}
                  </div>
                  {(w.urlStatus === 'falta' || w.urlStatus === 'preguntada') && urlFor !== w.taskId && (
                    <Button size="sm" variant="outline" onClick={() => { setUrlFor(w.taskId); setUrl(''); }}>
                      {w.urlStatus === 'preguntada' ? 'Preguntada · poner URL' : 'Poner URL'}
                    </Button>
                  )}
                </div>
                {urlFor === w.taskId && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input className={cn(selectCls, 'min-w-0 flex-1')} placeholder="https://… o /ruta" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="URL trabajada" />
                    <Button size="sm" disabled={pending || !url.trim()} onClick={() => run(async () => { const r = await setWorkUrlAction(data.clientId, w.taskId, url); if (r.ok) setUrlFor(null); return r; })}>
                      Guardar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setUrlFor(null)}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="px-4 pb-3">
          <Msg />
        </div>
      </section>
    </div>
  );
}

// --- Plan y frecuencias ---------------------------------------------------------------------------------------------

function Seguimiento({ data, isAdmin, onChange }: { data: ClientStrategy; isAdmin: boolean; onChange: () => void }) {
  const { pending, run, Msg } = useAct(onChange);
  const [pause, setPause] = useState(data.pausedUntil ?? '');
  const runnable = data.processes.filter((p) => p.runnable);
  const later = data.processes.filter((p) => !p.runnable);
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Plan de seguimiento</span>
            <select className={selectCls} value={data.planId ?? ''} disabled={!isAdmin || pending} onChange={(e) => run(() => setClientPlanAction(data.clientId, e.target.value || null))}>
              {data.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="">Ninguno (desactivar seguimiento)</option>
            </select>
          </label>
          {isAdmin && (
            <>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Pausar hasta</span>
                <input type="date" className={selectCls} value={pause} min={data.today} onChange={(e) => setPause(e.target.value)} />
              </label>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => pauseClientAction(data.clientId, pause || null), pause ? 'Pausado.' : 'Reanudado.')}>
                <Pause aria-hidden /> {pause ? 'Pausar' : 'Quitar pausa'}
              </Button>
            </>
          )}
          <Msg />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {isAdmin ? 'Cada proceso usa la frecuencia del plan; si la cambias aquí, queda ajustada solo para este cliente (marcada) y puedes volver a la del plan. Quitar el plan no borra lo guardado.' : 'Solo un administrador puede cambiar el plan y las frecuencias.'}
        </p>
      </section>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="data-table min-w-[820px]">
          <thead>
            <tr>
              <th>Proceso</th>
              <th>Frecuencia</th>
              <th>Último resultado</th>
              <th>Próxima</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runnable.map((p) => (
              <ProcessRow key={p.key} p={p} data={data} isAdmin={isAdmin} pending={pending} run={run} />
            ))}
          </tbody>
        </table>
      </div>
      {later.length > 0 && (
        <section className="rounded-xl border border-dashed bg-card/50 p-4">
          <h3 className="text-sm font-semibold">Próximamente</h3>
          <p className="mt-1 text-xs text-muted-foreground">Se construyen en las fases 2 y 3 (el estratega con Opus, informes, competencia, visibilidad en IA). Si su plan los incluye, empezarán solos cuando estén listos.</p>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {later.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-2">
                <span>{p.label}</span>
                <span className="text-xs text-muted-foreground">{p.on ? `En su plan · ${p.frequencyLabel}` : 'No incluido'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ProcessRow({ p, data, isAdmin, pending, run }: { p: ProcessView; data: ClientStrategy; isAdmin: boolean; pending: boolean; run: (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => void }) {
  const value = p.on ? String(p.every) : 'off';
  return (
    <tr className={cn(!p.on && 'opacity-60')}>
      <td className="max-w-[320px]">
        <span className="font-medium">{p.label}</span>
        <Badge tone="neutral" className="ml-2">{COST_LABEL[p.cost] ?? p.cost}</Badge>
        <span className="block text-xs text-muted-foreground">{p.description}</span>
      </td>
      <td className="whitespace-nowrap">
        {isAdmin ? (
          <select
            className={selectCls}
            value={value}
            disabled={pending}
            aria-label={`Frecuencia de ${p.label}`}
            onChange={(e) => run(() => saveClientOverrideAction(data.clientId, p.key, e.target.value === 'off' ? { on: false, every: p.every } : { on: true, every: Number(e.target.value) }))}
          >
            <option value="off">Apagado</option>
            {p.frequencies.map((f) => (
              <option key={f} value={String(f)}>
                {FREQUENCY_LABEL[f] ?? `Cada ${f} días`}
              </option>
            ))}
          </select>
        ) : (
          <span>{p.on ? p.frequencyLabel : 'Apagado'}</span>
        )}
        <span className="mt-1 block text-xs">
          {p.from === 'cliente' ? (
            <>
              <Badge tone="info">Ajustada para este cliente</Badge>
              {isAdmin && (
                <button className="ml-1 text-xs underline" disabled={pending} onClick={() => run(() => saveClientOverrideAction(data.clientId, p.key, null))}>
                  Volver a la del plan
                </button>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Del plan</span>
          )}
        </span>
      </td>
      <td className="max-w-[300px]">
        {p.status ? <Badge tone={RUN_TONE[p.status] ?? 'neutral'}>{RUN_LABEL[p.status] ?? p.status}</Badge> : <span className="text-xs text-muted-foreground">{p.every === 0 ? 'Por evento' : '—'}</span>}
        {p.lastRunAt && <span className="ml-1 text-xs text-muted-foreground">{when(p.lastRunAt)}</span>}
        {(p.lastError || p.summary) && <span className="mt-0.5 block text-xs text-muted-foreground">{p.lastError ?? p.summary}</span>}
      </td>
      <td className="whitespace-nowrap text-xs text-muted-foreground">{p.on && p.every > 0 ? when(p.nextRunAt) : '—'}</td>
      <td className="text-right">{p.on && p.every > 0 && <RunNow clientId={data.clientId} process={p.key} onDone={() => run(async () => ({ ok: true }))} />}</td>
    </tr>
  );
}
