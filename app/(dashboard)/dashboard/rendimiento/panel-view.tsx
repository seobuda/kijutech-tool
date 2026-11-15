'use client';

// Panel central de Rendimiento: tabla de clientes ordenable por cifra o por variación, con filtro, y (solo admin) los
// ajustes de los avisos de caídas y subidas, el resumen mensual y el apartado del informe semanal.
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, LineChart, Search, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { savePerfSettingsAction } from '@/lib/rendimiento/actions';
import type { OverviewRow } from '@/lib/rendimiento/report';
import { KPI, WATCH_KPIS, fmtDayYear, formatDelta, formatValue } from '@/lib/rendimiento/rules';

type Settings = { alertsEnabled: boolean; alertPct: number; alertRises: boolean; alertMinVolume: number; monthlyReport: boolean; weeklySection: boolean };
type SortKey = 'name' | `${string}:value` | `${string}:pct`;

export function PanelView({ rows, isAdmin, settings }: { rows: OverviewRow[]; isAdmin: boolean; settings: Settings }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('gsc_clicks:pct');
  const [asc, setAsc] = useState(true);
  const shown = useMemo(() => {
    const f = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));
    const val = (r: OverviewRow): number | string | null => {
      if (sort === 'name') return r.name.toLowerCase();
      const [k, field] = sort.split(':');
      const x = r.kpis[k];
      return x ? (field === 'pct' ? x.pct : x.value) : null;
    };
    return [...f].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // sin dato, siempre al final
      if (vb === null) return -1;
      const c = typeof va === 'string' ? va.localeCompare(String(vb), 'es') : va - (vb as number);
      return asc ? c : -c;
    });
  }, [rows, q, sort, asc]);
  const by = (k: SortKey) => {
    if (sort === k) setAsc(!asc);
    else {
      setSort(k);
      setAsc(k === 'name' || k.endsWith(':pct'));
    }
  };
  const SortIcon = ({ k }: { k: SortKey }) => (sort === k ? asc ? <ArrowUp className="inline size-3" aria-hidden /> : <ArrowDown className="inline size-3" aria-hidden /> : null);
  const cols = WATCH_KPIS.filter((k) => rows.some((r) => r.kpis[k]));

  if (!rows.length) {
    return (
      <>
        <EmptyState
          icon={LineChart}
          title="Aún no hay clientes con datos de Google"
          description="Asigna a cada cliente su Search Console, Analytics y ficha de Google (Clientes → ficha → Webs y cuentas → «Buscar en Google»). Desde ese momento se descarga su histórico y aparece aquí."
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/clientes">Ir a Clientes</Link>
            </Button>
          }
        />
        {isAdmin && <SettingsForm initial={settings} />}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" className="h-9 w-56 rounded-md border border-input bg-card pl-8 pr-2.5 text-sm shadow-xs" />
          </label>
          <p className="text-xs text-muted-foreground">Pulsa una columna para ordenar. La variación compara con los 28 días anteriores.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <th>
                  <button onClick={() => by('name')} className="font-medium">
                    Cliente <SortIcon k="name" />
                  </button>
                </th>
                {cols.map((k) => (
                  <th key={k} className="text-right">
                    <button onClick={() => by(`${k}:value`)} className="font-medium">
                      {KPI[k].short} <SortIcon k={`${k}:value`} />
                    </button>
                    <button onClick={() => by(`${k}:pct`)} className="ml-1 text-xs font-normal text-muted-foreground" aria-label={`Ordenar por variación de ${KPI[k].short}`}>
                      % <SortIcon k={`${k}:pct`} />
                    </button>
                  </th>
                ))}
                <th>Datos hasta</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.clientId}>
                  <td>
                    <Link href={`/dashboard/clientes/${r.clientId}?tab=rendimiento`} className="font-medium hover:text-brand hover:underline">
                      {r.name}
                    </Link>
                    {r.syncIssue && (
                      <span className={cn('mt-0.5 flex items-center gap-1 text-xs', r.syncIssue.startsWith('Descargando') ? 'text-muted-foreground' : 'text-destructive')}>
                        {!r.syncIssue.startsWith('Descargando') && <TriangleAlert className="size-3" aria-hidden />}
                        <span className="line-clamp-1">{r.syncIssue}</span>
                      </span>
                    )}
                  </td>
                  {cols.map((k) => {
                    const x = r.kpis[k];
                    return (
                      <td key={k} className="text-right tabular-nums">
                        {x ? (
                          <>
                            {formatValue(x.value, KPI[k].format)}
                            <span className={cn('ml-1.5 text-xs', x.good === null || x.pct === null || Math.round(x.pct) === 0 ? 'text-muted-foreground' : x.good ? 'text-success' : 'text-destructive')}>{formatDelta(x.pct) || ''}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-xs text-muted-foreground">{r.lastData ? fmtDayYear(r.lastData) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {isAdmin && <SettingsForm initial={settings} />}
    </div>
  );
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = () =>
    start(async () => {
      const r = await savePerfSettingsAction(s);
      setMsg(r.ok ? { ok: true, text: 'Ajustes guardados.' } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  const check = (key: keyof Settings, label: string, hint: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={Boolean(s[key])} onChange={(e) => setS({ ...s, [key]: e.target.checked })} />
      <span>
        {label}
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <h2 className="text-sm font-semibold">Avisos e informes</h2>
      <p className="mt-1 text-xs text-muted-foreground">Llegan a Enric por Telegram. Comparan los últimos 7 días con la media de las 4 semanas anteriores; como mucho un aviso por cifra y cliente a la semana.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          {check('alertsEnabled', 'Avisar de caídas fuertes', 'Clics desde Google, sesiones, conversiones, vistas y llamadas de la ficha. Cada día desde las 9:00.')}
          {check('alertRises', 'Avisar también de subidas fuertes', 'Para saber qué ha funcionado.')}
          <div className="flex flex-wrap gap-4">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Umbral de cambio (%)</span>
              <input type="number" min={10} max={90} value={s.alertPct} onChange={(e) => setS({ ...s, alertPct: Number(e.target.value) })} className="h-9 w-24 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Volumen mínimo por semana</span>
              <input type="number" min={1} value={s.alertMinVolume} onChange={(e) => setS({ ...s, alertMinVolume: Number(e.target.value) })} className="h-9 w-24 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs" />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Con poco volumen no avisa (pasar de 3 llamadas a 1 no es una caída real).</p>
        </div>
        <div className="space-y-3">
          {check('monthlyReport', 'Resumen del mes', 'El día 5 de cada mes, las cifras del mes anterior de todos los clientes. El informe de cada uno está en su ficha.')}
          {check('weeklySection', 'Apartado en el informe semanal', 'Total de la semana y los clientes que más caen o suben.')}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar ajustes'}
        </Button>
        {msg && (
          <span role={msg.ok ? 'status' : 'alert'} className={cn('text-sm', msg.ok ? 'text-success' : 'text-destructive')}>
            {msg.text}
          </span>
        )}
      </div>
    </section>
  );
}
