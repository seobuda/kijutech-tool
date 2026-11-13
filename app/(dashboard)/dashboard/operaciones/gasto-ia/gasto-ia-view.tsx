'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertTriangle, Coins, Lightbulb, RefreshCw, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Section, StatCard } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { connectAnthropicAdminAction, disconnectAnthropicAdminAction, refreshOrgCostAction } from '@/lib/operaciones/ai-watch-actions';
import type { AiOverview } from '@/lib/operaciones/ai-watch';

const usd = (n: number) => `${n.toFixed(2)} $`;
const shortDate = (d: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${d}T12:00:00Z`));

export function GastoIaView({ data: d }: { data: AiOverview }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const budget = d.settings.monthly;
  const accountMtd = d.org.connected && !d.org.error ? d.org.mtdUsd : null;
  const spent = accountMtd ?? d.mtd;
  const pct = budget ? Math.round((spent / budget) * 100) : 0;
  const over = d.forecast > budget;

  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) setKey('');
      router.refresh();
    });

  // Gráfica: barras del gasto diario de la herramienta (30 días) y referencia del presupuesto diario.
  const max = Math.max(d.dailyBudget * 1.2, ...d.byDay.map((x) => x.usd), 0.01);

  return (
    <div className="space-y-6">
      {!d.settings.enabled && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning-strong">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            El vigía está apagado: no avisa de picos ni de la previsión. Enciéndelo en{' '}
            <Link className="font-medium underline" href="/dashboard/operaciones/automatizaciones">
              Automatizaciones → Vigía de gasto de IA
            </Link>
            .
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={accountMtd !== null ? 'Gastado este mes (cuenta)' : 'Gastado este mes (herramienta)'}
          value={usd(spent)}
          hint={`${pct} % de ${usd(budget)}`}
          icon={Coins}
          tone={pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'neutral'}
        />
        <StatCard label="Previsión a fin de mes" value={usd(d.forecast)} hint={over ? 'Pasa del presupuesto' : 'Dentro del presupuesto'} icon={TrendingUp} tone={over ? 'warning' : 'success'} />
        <StatCard label="Hoy (herramienta)" value={usd(d.todayUsd)} hint={`Presupuesto diario ≈ ${usd(d.dailyBudget)}`} />
        <StatCard label="Últimos 7 días (herramienta)" value={usd(d.last7)} hint={`≈ ${usd((d.last7 / 7) * 30)} al mes a este ritmo`} />
      </div>

      <Section
        title="Gasto diario de la herramienta (30 días)"
        description={`Cada barra es un día (coste estimado con los tokens de cada llamada). La línea es el presupuesto diario (${usd(d.dailyBudget)}).`}
      >
        <div className="px-5 py-4">
          <div className="relative flex h-40 items-end gap-[2px]" role="img" aria-label="Gasto diario de IA de los últimos 30 días">
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/60"
              style={{ bottom: `${(d.dailyBudget / max) * 100}%` }}
              aria-hidden
            >
              <span className="absolute -top-5 right-0 text-xs text-muted-foreground">presupuesto diario</span>
            </div>
            {d.byDay.map((x) => (
              <div key={x.date} className="group relative flex h-full flex-1 items-end">
                <div
                  className={cn('w-full rounded-t-[4px]', x.usd > d.dailyBudget ? 'bg-warning' : 'bg-primary/80 group-hover:bg-primary')}
                  style={{ height: `${Math.max(x.usd > 0 ? 2 : 0, (x.usd / max) * 100)}%` }}
                />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow-sm group-hover:block">
                  {shortDate(x.date)}: {usd(x.usd)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{shortDate(d.byDay[0].date)}</span>
            <span>hoy</span>
          </div>
          <table className="sr-only">
            <caption>Gasto diario de IA</caption>
            <tbody>
              {d.byDay.map((x) => (
                <tr key={x.date}>
                  <td>{x.date}</td>
                  <td>{usd(x.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {d.spikes.length > 0 && (
        <Section title="Picos de hoy" description="Funciones que hoy gastan mucho más de lo normal, y por qué.">
          <ul className="divide-y text-sm">
            {d.spikes.map((s) => (
              <li key={s.fn} className="px-5 py-3">
                <p className="font-medium">
                  {s.fn} <Badge tone="warning">{usd(s.today.usd)} hoy · normal ≈ {usd(s.baselineUsd)}</Badge>
                </p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {s.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Recomendaciones" description="Reglas sobre el registro de llamadas. El ahorro es aproximado: conviene probar cada cambio con ejemplos reales antes.">
        {d.recommendations.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">Nada que mejorar ahora mismo.</p>
        ) : (
          <ul className="divide-y text-sm">
            {d.recommendations.map((r, i) => (
              <li key={i} className="flex gap-3 px-5 py-3">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <p className="font-medium">
                    {r.title} {r.savingUsdMonth ? <Badge tone="success">≈ {usd(r.savingUsdMonth)}/mes</Badge> : null}
                  </p>
                  <p className="text-muted-foreground">{r.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Por función (30 días)" description="Qué parte de la herramienta gasta, con su tamaño medio por llamada (últimos 7 días).">
        {d.fns.length === 0 ? (
          <EmptyState icon={Coins} title="Sin llamadas a la IA" description="Aún no hay llamadas registradas en los últimos 30 días." className="m-4 border-0" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm">
              <thead>
                <tr>
                  <th>Función</th>
                  <th>Modelo</th>
                  <th>Llamadas</th>
                  <th>Coste 30 d</th>
                  <th>7 d (antes)</th>
                  <th>Entrada/llamada</th>
                  <th>Salida/llamada</th>
                  <th>Fallos</th>
                </tr>
              </thead>
              <tbody>
                {d.fns.map((f) => (
                  <tr key={f.fn}>
                    <td className="font-medium">{f.fn}</td>
                    <td>{f.model ?? '—'}</td>
                    <td>{f.calls30}</td>
                    <td>{usd(f.usd30)}</td>
                    <td>
                      {usd(f.usd7)} <span className="text-muted-foreground">({usd(f.usdPrev7)})</span>
                    </td>
                    <td>{f.calls7 ? Math.round(f.avgIn) : '—'}</td>
                    <td>{f.calls7 ? Math.round(f.avgOut) : '—'}</td>
                    <td>
                      {f.failed30 || '—'}
                      {f.fallback30 ? ` · ${f.fallback30} reserva` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Cuenta de Anthropic (coste real)"
        description="Opcional. Con una clave de administración se lee el coste real de toda la cuenta, también lo que gastan Claude Code u otras claves, que comparten el presupuesto. Anthropic no ofrece consultar el saldo restante: se compara con tu presupuesto."
      >
        <div className="space-y-3 px-5 py-4 text-sm">
          {d.org.connected ? (
            <>
              {d.org.error ? (
                <p className="text-destructive">{d.org.error}</p>
              ) : (
                <p>
                  Este mes la cuenta lleva <b>{usd(d.org.mtdUsd)}</b>: <b>{usd(d.mtd)}</b> de la herramienta y <b>{usd(Math.max(0, d.org.mtdUsd - d.mtd))}</b> de otros usos.
                  <span className="text-muted-foreground"> Actualizado {new Date(d.org.fetchedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} (se refresca cada hora).</span>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => run(refreshOrgCostAction)} disabled={pending}>
                  <RefreshCw className="size-4" aria-hidden /> Actualizar ahora
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.confirm('¿Quitar la clave de administración? Se dejará de ver el coste real de la cuenta.') && run(disconnectAnthropicAdminAction)}
                  disabled={pending}
                >
                  Quitar la clave
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                Créala en la consola de Anthropic (Settings → Admin keys; hace falta ser administrador de la organización). Solo lee informes: no puede enviar
                mensajes. Se guarda cifrada.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-admin01-…" className="max-w-sm" aria-label="Clave de administración de Anthropic" />
                <Button size="sm" onClick={() => run(() => connectAnthropicAdminAction(key))} disabled={pending || !key.trim()}>
                  Conectar
                </Button>
              </div>
            </>
          )}
          {msg && (
            <p role="status" className={msg.ok ? 'text-success' : 'text-destructive'}>
              {msg.text}
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
