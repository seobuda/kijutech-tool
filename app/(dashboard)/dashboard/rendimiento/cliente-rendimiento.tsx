'use client';

// Pestaña «Rendimiento» de la ficha del cliente (módulo Rendimiento, 15 nov 2026): cifras de Google con su variación,
// gráficas con los hitos, canales y dispositivos, consultas y páginas que suben y bajan, hitos de la estrategia con su
// antes y después, informe del mes para copiar y estado de la descarga. Todo sale de lo guardado (sin llamar a Google).
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, CalendarPlus, ClipboardCopy, FileText, Flag, LineChart, Minus, Pencil, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Skeleton } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { deleteAnnotationAction, getClientPerformanceAction, getMonthlyReportAction, resyncClientAction, saveAnnotationAction } from '@/lib/rendimiento/actions';
import type { ClientPerformance, KpiView, AnnotationView } from '@/lib/rendimiento/report';
import { ANNOTATION_KINDS, ANNOTATION_KIND_LABEL, COMPARE_LABEL, PERIOD_LABEL, fmtDay, fmtDayYear, fmtMonthLong, formatDelta, formatValue, type CompareKey, type PeriodKey } from '@/lib/rendimiento/rules';
import { PerfChart } from './perf-chart';

const selectCls = 'h-9 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40';
const inputCls = cn(selectCls, 'w-full');
const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  al_dia: { label: 'Al día', tone: 'success' },
  descargando: { label: 'Descargando histórico', tone: 'info' },
  pendiente: { label: 'Pendiente', tone: 'neutral' },
  error: { label: 'Error', tone: 'danger' },
  inactiva: { label: 'Ya no es la principal', tone: 'neutral' }
};
const fmtTime = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

export function ClienteRendimiento({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [period, setPeriod] = useState<PeriodKey>('28');
  const [compare, setCompare] = useState<CompareKey>('prev');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<ClientPerformance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [syncing, startSync] = useTransition();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const reqId = useRef(0);
  const badRange = period === 'custom' && Boolean(from && to) && from > to;
  const load = useCallback(() => {
    if (period === 'custom' && (!from || !to || from > to)) return;
    const id = ++reqId.current;
    startLoad(async () => {
      const r = await getClientPerformanceAction(clientId, { period, compare, from, to });
      if (id !== reqId.current) return; // llegó tarde: ya se pidió otro periodo
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else setError(r.error);
    });
  }, [clientId, period, compare, from, to]);
  useEffect(load, [load]);

  const resync = () =>
    startSync(async () => {
      setSyncMsg(null);
      const r = await resyncClientAction(clientId);
      if (!r.ok) setSyncMsg(r.error);
      else setSyncMsg(r.errors ? 'Google ha dado error en alguna propiedad: mira el estado abajo.' : r.pending ? 'Descargado lo más reciente; el resto del histórico sigue en segundo plano.' : 'Todo al día.');
      load();
    });

  if (!data && !error) return <Skeleton className="h-64 w-full" />;
  if (error && !data) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  const p = data!;
  const marks = p.annotations.map((a) => ({ date: a.date, title: a.title }));
  const compareShort = compare === 'none' ? null : compare === 'prev' ? 'Periodo anterior' : compare === 'yoy' ? 'Año pasado' : 'Antes del servicio';

  if (!p.sources.length) {
    return (
      <EmptyState
        icon={LineChart}
        title="Aún no hay cuentas de Google de este cliente"
        description={`Asigna su Search Console, Analytics y ficha de Google en «Webs y cuentas» («Buscar en Google»). Desde ese momento se descarga su histórico y se guarda cada día, también lo que Google borra pasados 16 meses.`}
        action={
          <Button asChild size="sm">
            <Link href={`/dashboard/clientes/${clientId}?tab=webs`}>Ir a Webs y cuentas</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className={cn('space-y-4', loading && 'opacity-70 transition-opacity')}>
      {/* Periodo y comparación */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-xs sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Periodo</span>
            <select
              className={selectCls}
              value={period}
              onChange={(e) => {
                const v = e.target.value as PeriodKey;
                setPeriod(v);
                if (v === 'all' && compare === 'prev') setCompare('yoy'); // «todo» no tiene periodo anterior
              }}
            >
              {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((k) => (
                <option key={k} value={k}>
                  {PERIOD_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          {period === 'custom' && (
            <>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Desde</span>
                <input type="date" className={selectCls} value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Hasta</span>
                <input type="date" className={selectCls} value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </>
          )}
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Comparar con</span>
            <select className={selectCls} value={compare} onChange={(e) => setCompare(e.target.value as CompareKey)}>
              {(Object.keys(COMPARE_LABEL) as CompareKey[])
                .filter((k) => !(k === 'prev' && period === 'all'))
                .map((k) => (
                  <option key={k} value={k} disabled={k === 'contract' && !p.serviceStart}>
                    {k === 'none' ? 'Sin comparar' : COMPARE_LABEL[k].charAt(0).toUpperCase() + COMPARE_LABEL[k].slice(1)}
                    {k === 'contract' && !p.serviceStart ? ' (falta la fecha de inicio en la ficha)' : ''}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {syncMsg && <span className="text-xs text-muted-foreground" role="status">{syncMsg}</span>}
          <Button size="sm" variant="outline" onClick={resync} disabled={syncing}>
            <RefreshCw className={cn(syncing && 'animate-spin')} aria-hidden />
            {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
          </Button>
        </div>
      </div>
      {badRange && (
        <p role="alert" className="text-sm text-destructive">
          La fecha «Desde» tiene que ser anterior a «Hasta».
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {!p.hasData ? (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground shadow-xs">
          Descargando el histórico de Google… Las primeras cifras aparecen en unos minutos (o pulsa «Sincronizar ahora»).
        </div>
      ) : (
        <>
          {/* Cifras */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {p.kpis.map((k) => (
              <KpiTile key={k.key} k={k} compare={compare} />
            ))}
          </div>

          {/* Gráficas */}
          <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5 lg:grid-cols-2">
            {p.charts.map((c) => (
              <PerfChart key={c.key} title={c.label} points={c.points} marks={marks} format={(v) => formatValue(v, c.format)} compareLabel={compareShort} />
            ))}
            <p className="text-xs text-muted-foreground lg:col-span-2">
              {p.charts[0]?.points.length && p.charts[0].points[0].from !== p.charts[0].points[0].to ? 'Cada punto es una semana (o un mes en periodos largos).' : 'Cada punto es un día.'} Las líneas naranjas discontinuas son los hitos. Cada fuente acaba en su último día con datos (Search Console y la ficha de Google llegan con 2-3 días de retraso).
            </p>
          </div>

          {(p.channels.length > 0 || p.devices.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {p.channels.length > 0 && (
                <Panel title="Sesiones por canal (Analytics)">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Canal</th>
                        <th className="text-right">Sesiones</th>
                        {compare !== 'none' && <th className="text-right">Variación</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {p.channels.map((c) => (
                        <tr key={c.key}>
                          <td>{c.key}</td>
                          <td className="text-right tabular-nums">{formatValue(c.value, 'int')}</td>
                          {compare !== 'none' && <td className="text-right tabular-nums">{c.prev === null ? '—' : c.prev === 0 ? 'nuevo' : formatDelta(((c.value - c.prev) / c.prev) * 100)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              )}
              {p.devices.length > 0 && (
                <Panel title="Clics por dispositivo (Search Console)">
                  <Bars rows={p.devices.map((d) => ({ label: d.key === 'mobile' ? 'Móvil' : d.key === 'desktop' ? 'Ordenador' : d.key === 'tablet' ? 'Tableta' : d.key, value: d.value }))} />
                </Panel>
              )}
            </div>
          )}

          {p.movers && <MoversPanel m={p.movers} />}
        </>
      )}

      <Milestones clientId={clientId} annotations={p.annotations} onChange={load} />
      <MonthlyReport clientId={clientId} clientName={clientName} />

      {/* Estado de la descarga */}
      <Panel title="Datos guardados">
        <ul className="space-y-2 text-sm">
          {p.sources.map((s) => (
            <li key={s.source} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">
                <span className="font-medium">{s.label}</span> <span className="break-all text-muted-foreground">· {s.property}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge tone={STATUS[s.status]?.tone ?? 'neutral'}>{STATUS[s.status]?.label ?? s.status}</Badge>
                {s.syncedUntil ? `Datos del ${fmtDayYear(s.historyFrom ?? s.syncedUntil)} al ${fmtDayYear(s.syncedUntil)}` : 'Sin datos todavía'}
                {s.lastRunAt ? ` · revisado ${fmtTime.format(new Date(s.lastRunAt))}` : ''}
                {s.others ? ` · ${s.others} propiedad(es) anterior(es) con su histórico` : ''}
              </span>
              {s.status === 'error' && s.lastError && (
                <span className="flex items-start gap-1.5 text-xs text-destructive sm:basis-full">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {s.lastError}. Se reintenta solo; si Google dice que no hay permiso, revisa el acceso en «Webs y cuentas» → «Comprobar accesos».
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Se actualiza cada día desde las 7:00. Google solo guarda 16 meses de Search Console: lo que guardamos aquí no se borra.</p>
      </Panel>
    </div>
  );
}

function Panel({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

function KpiTile({ k, compare }: { k: KpiView; compare: CompareKey }) {
  const Icon = k.pct === null || Math.round(k.pct) === 0 ? Minus : (k.lowerBetter ? k.pct < 0 : k.pct > 0) ? ArrowUpRight : ArrowDownRight;
  const tone = k.good === null || k.pct === null || Math.round(k.pct) === 0 ? 'text-muted-foreground' : k.good ? 'text-success' : 'text-destructive';
  return (
    <div className="rounded-xl border bg-card p-3.5 shadow-xs" title={k.note}>
      <p className="text-xs text-muted-foreground">{k.label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{formatValue(k.value, k.format)}</p>
      {compare !== 'none' && (
        <p className={cn('mt-0.5 flex items-center gap-1 text-xs font-medium tabular-nums', tone)}>
          <Icon className="size-3.5" aria-hidden />
          {k.pct !== null ? formatDelta(k.pct) : k.prev === null ? 'Sin datos para comparar' : '—'}
          {k.prev !== null && <span className="font-normal text-muted-foreground">· antes {formatValue(k.prev, k.format)}</span>}
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {fmtDay(k.range.from)} – {fmtDay(k.range.to)}
      </p>
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const total = rows.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between gap-2">
            <span>{r.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatValue(r.value, 'int')} · {Math.round((r.value / total) * 100)} %
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-[var(--chart-2)]" style={{ width: `${(r.value / total) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function MoversPanel({ m }: { m: NonNullable<ClientPerformance['movers']> }) {
  const [kind, setKind] = useState<'queries' | 'pages'>('queries');
  const set = m[kind];
  const short = (s: string) => (kind === 'pages' ? s.replace(/^https?:\/\/[^/]+/, '') || '/' : s);
  const col = (title: string, rows: typeof set.up, tone: string) => (
    <div className="min-w-0">
      <p className={cn('mb-1.5 text-xs font-semibold', tone)}>{title}</p>
      {rows.length ? (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex justify-between gap-2">
              <span className="truncate" title={r.key}>
                {short(r.key)}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {r.prevClicks} → {r.clicks}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nada destacable.</p>
      )}
    </div>
  );
  return (
    <Panel
      title={`Búsquedas de ${fmtMonthLong(m.month)} frente a ${fmtMonthLong(m.prevMonth)}`}
      actions={
        <div role="tablist" className="flex gap-1 rounded-md bg-muted p-0.5 text-xs">
          {(['queries', 'pages'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={cn('rounded px-2 py-1', kind === k ? 'bg-card font-medium shadow-xs' : 'text-muted-foreground')}>
              {k === 'queries' ? 'Consultas' : 'Páginas'}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        {col('Suben (clics)', set.up, 'text-success')}
        {col('Bajan (clics)', set.down, 'text-destructive')}
        {col('Nuevas', set.fresh, 'text-brand')}
      </div>
      {kind === 'queries' && m.topQueries.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Las que más clics traen: {m.topQueries.slice(0, 6).map((q) => `«${q.key}» (${q.clicks}, pos. ${q.position.toFixed(1)})`).join(' · ')}
        </p>
      )}
    </Panel>
  );
}

type Draft = { id: string | null; date: string; kind: string; title: string; notes: string };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()); // fecha de Madrid

function Milestones({ clientId, annotations, onChange }: { clientId: string; annotations: AnnotationView[]; onChange: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    draft &&
    start(async () => {
      const r = await saveAnnotationAction(clientId, { id: draft.id, date: draft.date, kind: draft.kind, title: draft.title, notes: draft.notes });
      if (!r.ok) return setMsg(r.error);
      setDraft(null);
      setMsg(null);
      onChange();
    });
  const remove = (id: string) =>
    start(async () => {
      const r = await deleteAnnotationAction(id);
      setAsking(null);
      if (!r.ok) return setMsg(r.error);
      onChange();
    });

  return (
    <Panel
      title="Hitos de la estrategia"
      actions={
        !draft && (
          <Button size="sm" variant="outline" onClick={() => setDraft({ id: null, date: today(), kind: 'contenido', title: '', notes: '' })}>
            <CalendarPlus aria-hidden />
            Añadir hito
          </Button>
        )
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">Lo que hacemos y lo que pasa (web nueva, campaña, artículos, cambios de Google). Se marca en las gráficas y se compara la media diaria de las 4 semanas de antes y de después.</p>
      {draft && (
        <div className="mb-4 grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[150px_160px_minmax(0,1fr)]">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Fecha *</span>
            <input type="date" className={inputCls} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Tipo</span>
            <select className={inputCls} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
              {ANNOTATION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ANNOTATION_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Qué pasó *</span>
            <input className={inputCls} value={draft.title} maxLength={200} placeholder="Ej.: publicada la web nueva" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="text-sm sm:col-span-3">
            <span className="mb-1 block text-xs text-muted-foreground">Notas (opcional)</span>
            <input className={inputCls} value={draft.notes} maxLength={2000} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <Button size="sm" onClick={save} disabled={pending || !draft.title.trim() || !draft.date}>
              Guardar hito
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {msg && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {msg}
        </p>
      )}
      {annotations.length ? (
        <ul className="divide-y">
          {annotations.map((a) => (
            <li key={a.id ?? `v${a.date}`} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Flag className="size-3.5 text-brand" aria-hidden />
                  <span className="tabular-nums text-muted-foreground">{fmtDayYear(a.date)}</span>
                  <Badge tone="neutral">{a.kindLabel}</Badge>
                  <span className="font-medium">{a.title}</span>
                  {a.source === 'agente' && <Badge tone="brand">Agente</Badge>}
                </p>
                {a.notes && <p className="mt-0.5 text-xs text-muted-foreground">{a.notes}</p>}
                {a.effects.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    {a.effects.map((e) => (
                      <span key={e.key} className={cn('tabular-nums', e.good === null ? 'text-muted-foreground' : e.good ? 'text-success' : 'text-destructive')}>
                        {e.label}: {formatValue(e.before, e.format === 'int' ? 'dec' : e.format)} → {formatValue(e.after, e.format === 'int' ? 'dec' : e.format)}
                        {e.format === 'int' ? '/día' : ''} {e.pct !== null ? `(${formatDelta(e.pct)})` : ''}
                      </span>
                    ))}
                    {a.effects.some((e) => e.afterDays < 28) && <span className="text-muted-foreground">· aún con {Math.min(...a.effects.map((e) => e.afterDays))} días de «después»</span>}
                  </p>
                )}
              </div>
              {!a.virtual && a.id && (
                <div className="flex shrink-0 items-center gap-1">
                  {asking === a.id ? (
                    <span className="flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive-soft px-2 py-1 text-xs text-destructive">
                      ¿Eliminar?
                      <Button size="sm" variant="destructive" disabled={pending} onClick={() => remove(a.id!)}>
                        Sí
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
                        No
                      </Button>
                    </span>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" aria-label={`Editar el hito ${a.title}`} onClick={() => setDraft({ id: a.id, date: a.date, kind: a.kind, title: a.title, notes: a.notes })}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setAsking(a.id)}>
                        Eliminar
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Sin hitos. Añade el primero (o pon la fecha de inicio del servicio en la ficha y saldrá sola).</p>
      )}
    </Panel>
  );
}

function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = 1; i <= n; i++) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(t.toISOString().slice(0, 10));
  }
  return out;
}

function MonthlyReport({ clientId, clientName }: { clientId: string; clientName: string }) {
  const months = lastMonths(12);
  const [month, setMonth] = useState(months[0]);
  const [text, setText] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const prepare = () =>
    start(async () => {
      const r = await getMonthlyReportAction(clientId, month);
      if (!r.ok) return setMsg(r.error);
      setText(r.text);
      setMsg(r.text ? null : 'No hay datos guardados de ese mes.');
    });
  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setMsg('Copiado.');
    } catch {
      setMsg('No se pudo copiar: selecciona el texto y cópialo a mano.');
    }
  };
  return (
    <Panel title="Informe del mes">
      <p className="mb-3 text-xs text-muted-foreground">Cifras del mes frente al anterior y al mismo mes del año pasado, lo que hicimos (hitos) y las búsquedas que más crecen. Listo para revisar y enviar a {clientName}.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Mes del informe"
          className={selectCls}
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setText(null); // que no se copie el informe de otro mes
            setMsg(null);
          }}
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {fmtMonthLong(m)}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" onClick={prepare} disabled={pending}>
          <FileText aria-hidden />
          {pending ? 'Preparando…' : 'Preparar informe'}
        </Button>
        {text && (
          <Button size="sm" variant="ghost" onClick={copy}>
            <ClipboardCopy aria-hidden />
            Copiar
          </Button>
        )}
        {msg && (
          <span className="text-xs text-muted-foreground" role="status">
            {msg}
          </span>
        )}
      </div>
      {text && <textarea readOnly value={text} rows={Math.min(18, text.split('\n').length + 1)} className="mt-3 w-full rounded-md border bg-muted/30 p-3 font-mono text-xs" aria-label="Texto del informe" />}
    </Panel>
  );
}
