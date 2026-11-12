'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, AlertTriangle, CheckCircle2, HeartPulse, Lightbulb, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Section, StatCard } from '@/components/ui/page';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { cn } from '@/lib/utils';
import { retryStuckAction } from '@/lib/operaciones/health-actions';
import type { Check } from '@/lib/operaciones/health';

type Incident = {
  id: string;
  checkKey: string;
  severity: string;
  title: string;
  detail: string;
  openedAt: string;
  resolvedAt: string | null;
};

const fmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

const STATUS = {
  ok: { icon: CheckCircle2, tone: 'success' as const, label: 'Bien', cls: 'text-success' },
  aviso: { icon: AlertTriangle, tone: 'warning' as const, label: 'Atención', cls: 'text-warning-strong' },
  critico: { icon: XCircle, tone: 'danger' as const, label: 'Crítico', cls: 'text-destructive' }
};

function duration(a: string, b: string | null) {
  const mins = Math.max(1, Math.round(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 60_000));
  return mins < 60 ? `${mins} min` : mins < 2880 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} días`;
}

// --- Gráficas (SVG propio, una sola escala, barras finas con extremo redondeado y tooltip) ----------------

type Series = { key: string; label: string; color: string };

function BarChart({
  data,
  series,
  format,
  title,
  height = 140
}: {
  data: ({ label: string } & Record<string, number | string>)[];
  series: Series[];
  format: (v: number) => string;
  title: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((d) => series.reduce((a, s) => a + Number(d[s.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const W = 100;
  const step = W / data.length;
  const barW = Math.max(1.2, step * 0.62);
  const every = Math.ceil(data.length / 8);
  return (
    <figure className="relative">
      <figcaption className="sr-only">{title}</figcaption>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground" aria-hidden>
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" className="absolute inset-0 size-full" role="img" aria-label={title}>
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1="0" x2={W} y1={100 - g * 100} y2={100 - g * 100} stroke="var(--border)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
          ))}
          {data.map((d, i) => {
            let y = 100;
            const x = i * step + (step - barW) / 2;
            return (
              <g key={i} opacity={hover === null || hover === i ? 1 : 0.45}>
                {series.map((s) => {
                  const v = Number(d[s.key] ?? 0);
                  const h = (v / max) * 96;
                  if (h <= 0) return null;
                  y -= h;
                  const rect = <rect key={s.key} x={x} y={y} width={barW} height={Math.max(0, h - 0.6)} rx="0.6" fill={s.color} />;
                  return rect;
                })}
              </g>
            );
          })}
          <line x1="0" x2={W} y1="100" y2="100" stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="absolute inset-0 flex">
          {data.map((d, i) => (
            <div key={i} className="h-full flex-1" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
          ))}
        </div>
        {hover !== null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
          >
            <div className="font-medium">{data[hover].label}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
                {series.length > 1 && <span className="size-2 rounded-sm" style={{ background: s.color }} />}
                {series.length > 1 ? `${s.label}: ` : ''}
                <span className="font-medium text-foreground tabular-nums">{format(Number(data[hover][s.key] ?? 0))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex text-[10px] text-muted-foreground tabular-nums" aria-hidden>
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center">
            {i % every === 0 ? d.label : ''}
          </span>
        ))}
      </div>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Ver como tabla</summary>
        <table className="data-table mt-2">
          <thead>
            <tr>
              <th>Periodo</th>
              {series.map((s) => (
                <th key={s.key}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i}>
                <td>{d.label}</td>
                {series.map((s) => (
                  <td key={s.key}>{format(Number(d[s.key] ?? 0))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export function SaludView({
  checks,
  incidents,
  clickupPerHour,
  aiCostPerDay,
  notificationsPerDay,
  uptime7d
}: {
  checks: Check[];
  incidents: Incident[];
  clickupPerHour: { label: string; value: number }[];
  aiCostPerDay: { label: string; value: number }[];
  notificationsPerDay: { label: string; sent: number; failed: number }[];
  uptime7d: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const bad = checks.filter((c) => c.status !== 'ok');
  const critical = bad.some((c) => c.status === 'critico');
  const open = incidents.filter((i) => !i.resolvedAt);
  const totalClickup = clickupPerHour.reduce((a, d) => a + d.value, 0);
  const totalCost = aiCostPerDay.reduce((a, d) => a + d.value, 0);
  const sent7 = notificationsPerDay.reduce((a, d) => a + d.sent, 0);
  const failed7 = notificationsPerDay.reduce((a, d) => a + d.failed, 0);

  const retry = () =>
    start(async () => {
      setMsg(null);
      const res = await retryStuckAction();
      setMsg(
        res.ok
          ? `Reintentado: ${res.notifications} aviso(s), ${res.outbox} cambio(s) de ClickUp, ${res.requests} encargo(s) y ${res.emails} correo(s).`
          : res.error
      );
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-semibold">
            <span className="flex items-center gap-2">
              <HeartPulse className="size-5 text-brand" />
              Salud del sistema
            </span>
            <AutoRefresh everyMs={30_000} className="text-xs font-normal" />
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Se comprueba sola cada 5 minutos. Si algo falla te llega un aviso a Telegram (una vez) y otro cuando se resuelve. Si se cae la
            app entera, avisa el vigilante externo del servidor.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={retry} disabled={pending} className="shrink-0">
          <RotateCcw aria-hidden />
          Reintentar lo atascado
        </Button>
      </div>
      {msg && <p className="rounded-lg bg-muted px-3 py-2 text-sm">{msg}</p>}

      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border p-4',
          bad.length === 0 ? 'border-success/30 bg-success-soft' : critical ? 'border-destructive/40 bg-destructive-soft' : 'border-warning/45 bg-warning-soft'
        )}
        role="status"
      >
        {bad.length === 0 ? <CheckCircle2 className="size-6 text-success" /> : <AlertTriangle className={cn('size-6', critical ? 'text-destructive' : 'text-warning-strong')} />}
        <div>
          <p className="font-semibold">{bad.length === 0 ? 'Todo funciona' : `${bad.length} cosa(s) necesitan atención`}</p>
          <p className="text-sm text-muted-foreground">{bad.length === 0 ? 'Sin colas atascadas ni errores.' : bad.map((c) => c.label).join(' · ')}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Disponibilidad (7 días)"
          value={uptime7d === null ? '—' : `${(uptime7d * 100).toFixed(uptime7d >= 0.999 ? 2 : 1)} %`}
          hint="Según las paradas detectadas al arrancar"
          icon={Activity}
          tone="success"
        />
        <StatCard label="Peticiones a ClickUp (24 h)" value={totalClickup} hint="Límite: 100 por minuto" icon={Activity} tone="info" />
        <StatCard label="Coste de IA (14 días)" value={`${totalCost.toFixed(2)} $`} hint="Estimado por los tokens usados" icon={Activity} tone="brand" />
        <StatCard
          label="Avisos de Telegram (7 días)"
          value={sent7}
          hint={failed7 ? `${failed7} fallidos` : 'Ninguno fallido'}
          icon={Activity}
          tone={failed7 ? 'danger' : 'success'}
        />
      </div>

      <Section title="Estado de cada pieza" description="Con su recomendación cuando algo no va bien.">
        <ul className="divide-y">
          {checks.map((c) => {
            const st = STATUS[c.status];
            return (
              <li key={c.key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <st.icon className={cn('mt-0.5 size-5 shrink-0', st.cls)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.label}</span>
                    <Badge tone={st.tone} dot>
                      {st.label}
                    </Badge>
                  </div>
                  {c.detail && <p className="mt-0.5 text-sm text-muted-foreground">{c.detail}</p>}
                  {c.status !== 'ok' && c.recommendation && (
                    <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-brand-soft px-2.5 py-1.5 text-sm">
                      <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                      {c.recommendation}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Peticiones a ClickUp por hora" description="Últimas 24 horas">
          <BarChart
            title="Peticiones a ClickUp por hora en las últimas 24 horas"
            data={clickupPerHour.map((d) => ({ label: d.label, value: d.value }))}
            series={[{ key: 'value', label: 'Peticiones', color: 'var(--chart-2)' }]}
            format={(v) => `${v} peticiones`}
          />
        </Section>
        <Section title="Coste de IA por día" description="Últimos 14 días">
          <BarChart
            title="Coste estimado de IA por día en los últimos 14 días"
            data={aiCostPerDay.map((d) => ({ label: d.label, value: d.value }))}
            series={[{ key: 'value', label: 'Coste', color: 'var(--chart-1)' }]}
            format={(v) => `${v.toFixed(3)} $`}
          />
        </Section>
        <Section title="Avisos de Telegram por día" description="Últimos 7 días">
          <BarChart
            title="Avisos de Telegram enviados y fallidos por día en los últimos 7 días"
            data={notificationsPerDay.map((d) => ({ label: d.label, sent: d.sent, failed: d.failed }))}
            series={[
              { key: 'sent', label: 'Enviados', color: 'var(--chart-2)' },
              { key: 'failed', label: 'Fallidos', color: 'var(--destructive)' }
            ]}
            format={(v) => String(v)}
          />
        </Section>
      </div>

      <Section title="Incidencias" description={`Últimos 30 días · ${open.length} abierta(s)`}>
        {incidents.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Sin incidencias" description="Nada ha fallado en los últimos 30 días." className="border-0 bg-transparent py-8" />
        ) : (
          <ol className="relative space-y-4 border-l pl-5">
            {incidents.map((i) => {
              const st = i.resolvedAt ? STATUS.ok : STATUS[i.severity === 'critico' ? 'critico' : 'aviso'];
              return (
                <li key={i.id} className="relative">
                  <span
                    className={cn('absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-card', i.resolvedAt ? 'bg-success' : i.severity === 'critico' ? 'bg-destructive' : 'bg-warning')}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{i.title}</span>
                    <Badge tone={st.tone} dot>
                      {i.resolvedAt ? `Resuelta · duró ${duration(i.openedAt, i.resolvedAt)}` : `Abierta hace ${duration(i.openedAt, null)}`}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{fmt.format(new Date(i.openedAt))}</span>
                  </div>
                  {i.detail && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{i.detail}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </div>
  );
}
