'use client';

// Panel del módulo Estrategia: clientes con seguimiento, planes (procesos × frecuencias, con coste estimado),
// calendario de la agencia y ajustes. Editar planes, calendario y ajustes, y activar clientes, es de administradores.
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, Compass, Copy, ListChecks, Play, Plus, Search, Settings2, TriangleAlert, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { deleteEventAction, deletePlanAction, saveEstSettingsAction, saveEventAction, savePlanAction, setClientPlanAction } from '@/lib/estrategia/actions';
import type { OverviewRow } from '@/lib/estrategia/report';
import { FREQUENCY_LABEL, HEALTH_LABEL, fmtDayYear, type Health } from '@/lib/estrategia/rules';
import { ConfirmDelete } from '../clientes/ui';
import { HEALTH_TONE } from './cliente-estrategia';

type ProcCfg = Record<string, { on: boolean; every: number }>;
type PlanV = { id: string; key: string; name: string; description: string; processes: ProcCfg; cost: string; clients: number };
type ProcV = { key: string; label: string; description: string; cost: string; frequencies: number[]; phase: number; needs: string[] };
type EventV = { id: string; date: string; endDate: string | null; kind: string; title: string; notes: string; source: string };
type SettingsV = { onTrackPct: number; atRiskPct: number; graceDays: number; strikingFrom: number; strikingTo: number; minImpressions: number; alertsEnabled: boolean; askUrl: boolean; trackDays: number; aiMonthlyCapUsd: number };
type Tab = 'clientes' | 'planes' | 'calendario' | 'ajustes';

const selectCls = 'h-9 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40';
const COST_LABEL: Record<string, string> = { gratis: 'Gratis', ia_minima: 'IA mínima', ia: 'IA (Opus)', dataforseo: 'DataForSEO' };
const KIND_LABEL: Record<string, string> = { google: 'Actualización de Google', festivo: 'Festivo', datos: 'Incidencia de datos', otro: 'Otro' };

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (okText ? { ok: true, text: okText } : null) : { ok: false, text: r.error ?? 'Error' });
      if (r.ok) router.refresh();
    });
  const Msg = () => (msg ? <span role={msg.ok ? 'status' : 'alert'} className={cn('text-sm', msg.ok ? 'text-success' : 'text-destructive')}>{msg.text}</span> : null);
  return { pending, run, Msg };
}

export function PanelView(props: { initialTab: Tab; isAdmin: boolean; rows: OverviewRow[]; withoutPlan: { id: string; name: string; status: string }[]; plans: PlanV[]; processes: ProcV[]; events: EventV[]; settings: SettingsV }) {
  const [tab, setTab] = useState<Tab>(props.initialTab);
  const tabs: { key: Tab; label: string; icon: typeof Users; show: boolean }[] = [
    { key: 'clientes', label: `Clientes (${props.rows.length})`, icon: Users, show: true },
    { key: 'planes', label: 'Planes', icon: ListChecks, show: true },
    { key: 'calendario', label: 'Calendario', icon: CalendarDays, show: true },
    { key: 'ajustes', label: 'Ajustes', icon: Settings2, show: props.isAdmin }
  ];
  return (
    <div className="space-y-4">
      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Secciones del panel de estrategia">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} aria-current={tab === t.key ? 'page' : undefined} className={cn('flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm', tab === t.key ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              <t.icon className="size-4" aria-hidden />
              {t.label}
            </button>
          ))}
      </nav>
      {tab === 'clientes' && <Clientes {...props} />}
      {/* La clave cambia al guardar o crear planes: el borrador se rehace con lo que hay en el servidor. */}
      {tab === 'planes' && <Planes key={props.plans.map((p) => `${p.id}:${p.name}:${JSON.stringify(p.processes)}`).join('|')} plans={props.plans} processes={props.processes} isAdmin={props.isAdmin} />}
      {tab === 'calendario' && <Calendario events={props.events} isAdmin={props.isAdmin} />}
      {tab === 'ajustes' && props.isAdmin && <Ajustes initial={props.settings} />}
    </div>
  );
}

// --- Clientes -------------------------------------------------------------------------------------------------------

function Clientes({ rows, withoutPlan, plans, isAdmin }: { rows: OverviewRow[]; withoutPlan: { id: string; name: string; status: string }[]; plans: PlanV[]; isAdmin: boolean }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'todos' | 'atencion' | 'pausados'>('todos');
  const [adding, setAdding] = useState(false);
  const [newClient, setNewClient] = useState('');
  const [newPlan, setNewPlan] = useState(plans[0]?.id ?? '');
  const { pending, run, Msg } = useAct();
  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (!r.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
        if (filter === 'atencion') return r.signals.critico + r.signals.aviso > 0 || (r.health.desviado ?? 0) + (r.health.en_riesgo ?? 0) + (r.health.vencido ?? 0) > 0 || r.errors > 0;
        if (filter === 'pausados') return Boolean(r.paused);
        return true;
      }),
    [rows, q, filter]
  );
  const activate = isAdmin && (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      {!adding ? (
        <Button size="sm" onClick={() => setAdding(true)} disabled={!withoutPlan.length}>
          <Plus aria-hidden /> Activar un cliente
        </Button>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Cliente</span>
            <select className={selectCls} value={newClient} onChange={(e) => setNewClient(e.target.value)}>
              <option value="">Elige…</option>
              {withoutPlan.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Plan</span>
            <select className={selectCls} value={newPlan} onChange={(e) => setNewPlan(e.target.value)}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" disabled={pending || !newClient || !newPlan} onClick={() => run(() => setClientPlanAction(newClient, newPlan), 'Cliente activado. Sus primeras comprobaciones llegan en la próxima hora.')}>
            <Play aria-hidden /> Activar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancelar
          </Button>
        </div>
      )}
      <div className="mt-2">
        <Msg />
      </div>
    </div>
  );
  if (!rows.length)
    return (
      <div className="space-y-4">
        <EmptyState icon={Compass} title="Ningún cliente tiene seguimiento todavía" description="Actívalo cliente a cliente eligiendo un plan (Mantenimiento web, SEO local, SEO estratégico o los que crees). Los clientes sin plan no gastan nada." />
        {activate}
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" className="h-9 w-56 rounded-md border border-input bg-card pl-8 pr-2.5 text-sm shadow-xs" />
          </label>
          <div className="flex gap-1" role="group" aria-label="Filtro">
            {(['todos', 'atencion', 'pausados'] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? 'default' : 'ghost'} onClick={() => setFilter(f)}>
                {f === 'todos' ? 'Todos' : f === 'atencion' ? 'Necesitan atención' : 'En pausa'}
              </Button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[860px]">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Plan</th>
                <th>Objetivos</th>
                <th>Señales abiertas</th>
                <th>Web</th>
                <th className="text-right">Horas del mes</th>
                <th>Última revisión</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.clientId}>
                  <td>
                    <Link href={`/dashboard/clientes/${r.clientId}?tab=estrategia`} className="font-medium hover:text-brand hover:underline">
                      {r.name}
                    </Link>
                    {r.paused && <span className="block text-xs text-muted-foreground">En pausa hasta el {fmtDayYear(r.paused)}</span>}
                    {r.errors > 0 && (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <TriangleAlert className="size-3" aria-hidden /> {r.errors} proceso(s) con error
                      </span>
                    )}
                  </td>
                  <td>{r.plan}</td>
                  <td>
                    {r.objectives === 0 ? (
                      <span className="text-xs text-muted-foreground">Sin objetivos</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {(Object.entries(r.health) as [Health, number][]).map(([h, n]) => (
                          <Badge key={h} tone={HEALTH_TONE[h]} dot>
                            {n} {HEALTH_LABEL[h].toLowerCase()}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="text-sm">
                    {r.signals.critico > 0 && <Badge tone="danger" className="mr-1">{r.signals.critico} crítica(s)</Badge>}
                    {r.signals.aviso > 0 && <Badge tone="warning" className="mr-1">{r.signals.aviso} aviso(s)</Badge>}
                    {r.signals.info > 0 && <span className="text-xs text-muted-foreground">{r.signals.info} oportunidad(es)</span>}
                    {!r.signals.critico && !r.signals.aviso && !r.signals.info && <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td>{r.web === null ? <span className="text-xs text-muted-foreground">—</span> : <Badge tone={r.web === 'ok' ? 'success' : r.web === 'error' ? 'danger' : 'warning'} dot>{r.web === 'ok' ? 'Correcta' : r.web === 'aviso' ? 'Avisos' : r.web === 'error' ? 'Error' : 'Pendiente'}</Badge>}</td>
                  <td className="text-right tabular-nums">{r.hours.used === null ? '—' : `${r.hours.used}${r.hours.contracted ? ` / ${r.hours.contracted}` : ''}`}</td>
                  <td className="text-xs text-muted-foreground">{r.lastRun ? new Date(r.lastRun).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : 'Pendiente'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {activate}
    </div>
  );
}

// --- Planes ---------------------------------------------------------------------------------------------------------

function Planes({ plans, processes, isAdmin }: { plans: PlanV[]; processes: ProcV[]; isAdmin: boolean }) {
  const [drafts, setDrafts] = useState<Record<string, PlanV>>(() => Object.fromEntries(plans.map((p) => [p.id, p])));
  const [newName, setNewName] = useState('');
  const { pending, run, Msg } = useAct();
  const dirty = (id: string) => JSON.stringify(drafts[id]) !== JSON.stringify(plans.find((p) => p.id === id));
  const setCell = (planId: string, key: string, value: string) =>
    setDrafts((d) => {
      const p = d[planId] ?? plans.find((x) => x.id === planId)!;
      const procs = { ...p.processes };
      const def = processes.find((x) => x.key === key)!;
      procs[key] = value === 'off' ? { on: false, every: procs[key]?.every ?? def.frequencies[0] } : { on: true, every: Number(value) };
      return { ...d, [planId]: { ...p, processes: procs } };
    });
  const phase1 = processes.filter((p) => p.phase === 1);
  const later = processes.filter((p) => p.phase > 1);
  const row = (pr: ProcV) => (
    <tr key={pr.key} className={cn(pr.phase > 1 && 'opacity-70')}>
      <td className="max-w-[300px]">
        <span className="font-medium">{pr.label}</span>
        <Badge tone="neutral" className="ml-2">{COST_LABEL[pr.cost] ?? pr.cost}</Badge>
        {pr.phase > 1 && <Badge tone="info" className="ml-1">Fase {pr.phase}</Badge>}
        <span className="block text-xs text-muted-foreground">{pr.description}</span>
      </td>
      {plans.map((p) => {
        const c = drafts[p.id]?.processes[pr.key];
        const value = c?.on ? String(c.every) : 'off';
        return (
          <td key={p.id}>
            {isAdmin ? (
              <select className={cn(selectCls, 'w-full min-w-[150px]')} value={value} onChange={(e) => setCell(p.id, pr.key, e.target.value)} aria-label={`${pr.label} en ${p.name}`}>
                <option value="off">Apagado</option>
                {pr.frequencies.map((f) => (
                  <option key={f} value={String(f)}>
                    {FREQUENCY_LABEL[f] ?? `Cada ${f} días`}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm">{c?.on ? FREQUENCY_LABEL[c.every] ?? `Cada ${c.every} días` : '—'}</span>
            )}
          </td>
        );
      })}
    </tr>
  );
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">Cada plan dice qué procesos se ejecutan y cada cuánto. Al guardar un plan cambian todos sus clientes, salvo los procesos que un cliente tenga ajustados a mano en su ficha. Lo diario es solo lo gratuito; las frecuencias por defecto siguen la práctica habitual de las agencias (ver docs/INVESTIGACION-ESTRATEGIA-VIVA.md).</p>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="data-table min-w-[900px]">
          <thead>
            <tr>
              <th>Proceso</th>
              {plans.map((p) => (
                <th key={p.id} className="min-w-[170px]">
                  {isAdmin ? (
                    <input className={cn(selectCls, 'w-full font-medium')} value={drafts[p.id]?.name ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: { ...d[p.id], name: e.target.value } }))} aria-label="Nombre del plan" />
                  ) : (
                    p.name
                  )}
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">{p.clients} cliente(s)</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {phase1.map(row)}
            {later.length > 0 && (
              <tr>
                <td colSpan={plans.length + 1} className="bg-muted/40 text-xs font-medium text-muted-foreground">
                  Próximamente (se pueden dejar ya en el plan: empezarán solos cuando estén construidos)
                </td>
              </tr>
            )}
            {later.map(row)}
            <tr>
              <td className="text-xs text-muted-foreground">Coste estimado</td>
              {plans.map((p) => (
                <td key={p.id} className="text-xs text-muted-foreground">
                  {p.cost}
                </td>
              ))}
            </tr>
            {isAdmin && (
              <tr>
                <td />
                {plans.map((p) => (
                  <td key={p.id}>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" disabled={pending || !dirty(p.id)} onClick={() => run(() => savePlanAction({ id: p.id, name: drafts[p.id].name, description: drafts[p.id].description, processes: drafts[p.id].processes }), `Plan «${drafts[p.id].name}» guardado.`)}>
                        Guardar
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} title="Duplicar" onClick={() => run(() => savePlanAction({ name: `${p.name} (copia)`, description: p.description, processes: drafts[p.id].processes }), 'Plan duplicado.')}>
                        <Copy aria-hidden />
                      </Button>
                      {p.clients === 0 && <ConfirmDelete label="" what={`el plan «${p.name}»`} disabled={pending} onConfirm={() => run(() => deletePlanAction(p.id))} />}
                    </div>
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {isAdmin && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Nuevo plan (empieza vacío; o duplica uno de arriba)</span>
            <input className={selectCls} value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} placeholder="Ej.: SEO e-commerce" />
          </label>
          <Button size="sm" disabled={pending || !newName.trim()} onClick={() => run(() => savePlanAction({ name: newName, processes: {} }), 'Plan creado.')}>
            <Plus aria-hidden /> Crear plan
          </Button>
          <Msg />
        </div>
      )}
    </div>
  );
}

// --- Calendario -----------------------------------------------------------------------------------------------------

function Calendario({ events, isAdmin }: { events: EventV[]; isAdmin: boolean }) {
  const [f, setF] = useState({ date: '', endDate: '', kind: 'google', title: '', notes: '' });
  const { pending, run, Msg } = useAct();
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">Actualizaciones de Google, festivos e incidencias de datos. Salen en las gráficas de Rendimiento, los avisos de caídas dicen si coinciden con una actualización, y servirán para no atribuir a una tarea lo que fue un cambio de Google. Las fechas de las actualizaciones están en el Google Search Status Dashboard.</p>
      {isAdmin && (
        <section className="rounded-xl border bg-card p-4 shadow-xs">
          <h3 className="text-sm font-semibold">Añadir evento</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-5">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Desde *</span>
              <input type="date" className={cn(selectCls, 'w-full')} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Hasta (opcional)</span>
              <input type="date" className={cn(selectCls, 'w-full')} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Tipo *</span>
              <select className={cn(selectCls, 'w-full')} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                {Object.entries(KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-xs text-muted-foreground">Título *</span>
              <input className={cn(selectCls, 'w-full')} maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ej.: Core update de noviembre de 2026" />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={pending || !f.date || !f.title.trim()} onClick={() => run(() => saveEventAction({ date: f.date, endDate: f.endDate || null, kind: f.kind, title: f.title, notes: f.notes }), 'Evento añadido.')}>
              <Plus aria-hidden /> Añadir
            </Button>
            <Msg />
          </div>
        </section>
      )}
      {events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Sin eventos" description={isAdmin ? 'Añade las actualizaciones de Google que vayan saliendo (y los festivos que afecten a los clientes).' : 'Un administrador puede añadirlos.'} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span>
                <Badge tone={e.kind === 'google' ? 'info' : 'neutral'} className="mr-2">{KIND_LABEL[e.kind] ?? e.kind}</Badge>
                <b>{e.title}</b>
                <span className="ml-2 text-xs text-muted-foreground">
                  {fmtDayYear(e.date)}
                  {e.endDate ? ` → ${fmtDayYear(e.endDate)}` : ''}
                </span>
              </span>
              {isAdmin && <ConfirmDelete what={`«${e.title}»`} disabled={pending} onConfirm={() => run(() => deleteEventAction(e.id))} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Ajustes --------------------------------------------------------------------------------------------------------

function Ajustes({ initial }: { initial: SettingsV }) {
  const [s, setS] = useState(initial);
  const { pending, run, Msg } = useAct();
  const numIn = (key: keyof SettingsV, label: string, hint: string, min: number, max: number) => (
    <label className="text-sm">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input type="number" min={min} max={max} value={s[key] as number} onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })} className={cn(selectCls, 'w-28')} />
      <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
    </label>
  );
  const check = (key: keyof SettingsV, label: string, hint: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={Boolean(s[key])} onChange={(e) => setS({ ...s, [key]: e.target.checked })} />
      <span>
        {label}
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
  return (
    <section className="space-y-6 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div>
        <h3 className="text-sm font-semibold">Objetivos</h3>
        <div className="mt-3 flex flex-wrap gap-6">
          {numIn('onTrackPct', '«En camino» desde (% de lo esperado)', 'Por defecto 90 %.', 50, 100)}
          {numIn('atRiskPct', '«En riesgo» desde (%)', 'Por debajo: «desviado». Por defecto 60 %.', 10, 95)}
          {numIn('graceDays', 'Días de gracia', 'Antes no se marca «desviado» (el SEO tarda). Por defecto 90.', 0, 365)}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Detectores de oportunidades</h3>
        <div className="mt-3 flex flex-wrap gap-6">
          {numIn('strikingFrom', 'Consultas al alcance: desde la posición', 'Por defecto 4.', 1, 50)}
          {numIn('strikingTo', 'hasta la posición', 'Por defecto 15.', 2, 100)}
          {numIn('minImpressions', 'Impresiones mínimas (4 semanas)', 'Por debajo no se considera (ruido). Por defecto 100.', 1, 100000)}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Trabajo, avisos y coste</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            {check('alertsEnabled', 'Avisos por Telegram', 'Web caída (confirmada), objetivos que empeoran, caídas fuertes y problemas nuevos con gravedad de aviso. Las oportunidades no avisan: salen en el panel y en el informe semanal.')}
            {check('askUrl', 'Preguntar la URL al cerrar un encargo', 'Si un trabajo sobre una página no dice en qué URL se hizo, el bot lo pregunta a quien lo hizo (con «No aplica»).')}
          </div>
          <div className="flex flex-wrap gap-6">
            {numIn('trackDays', 'Días de seguimiento de cada URL trabajada', 'Por defecto 180.', 30, 730)}
            {numIn('aiMonthlyCapUsd', 'Tope de IA del módulo ($/mes)', 'Al llegar, la extracción sigue sin IA (por reglas). Por defecto 30.', 0, 1000)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => run(() => saveEstSettingsAction(s), 'Ajustes guardados.')} disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar ajustes'}
        </Button>
        <Msg />
      </div>
    </section>
  );
}
