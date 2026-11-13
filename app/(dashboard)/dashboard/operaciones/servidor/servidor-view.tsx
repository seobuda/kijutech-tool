'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { HardDrive, Lightbulb, MemoryStick, RefreshCw, Server, Cpu, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, Section, StatCard } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { connectDoTokenAction, disconnectDoTokenAction, refreshInfraAction } from '@/lib/operaciones/infra-actions';
import type { InfraOverview } from '@/lib/operaciones/infra-watch';

const usd = (n: number) => `${n.toFixed(2)} $`;
const period = (p: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${p}-15T12:00:00Z`));

function Meter({ label, value, icon: Icon, hint, warnAt }: { label: string; value: number | null; icon: typeof Cpu; hint: string; warnAt: number }) {
  const v = value ?? 0;
  const tone = value === null ? 'bg-muted' : v >= 95 ? 'bg-destructive' : v >= warnAt ? 'bg-warning' : 'bg-success';
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value === null ? '—' : `${value} %`}</div>
      <div className="mt-2 h-2 rounded-full bg-muted" role="meter" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn('h-2 rounded-full', tone)} style={{ width: `${Math.min(100, v)}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function ServidorView({ data: o }: { data: InfraOverview }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) setToken('');
      router.refresh();
    });

  const d = o.data;
  const c = d?.capacity ?? null;
  const loadPct = c?.loadP95PerCpu != null ? Math.round(c.loadP95PerCpu * 100) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[15px] font-semibold">Servidor y costes</h2>
        <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground text-pretty">
          En DigitalOcean los servidores tienen precio fijo: más procesos no suben la factura, pero pueden llenar la memoria, la CPU o el disco y obligar a
          ampliar. Aquí ves las dos cosas. Se actualiza solo cada hora.
        </p>
      </div>

      {o.connected && d && (
        <>
          {d.error && (
            <p role="alert" className="text-sm text-destructive">
              {d.error}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Este mes (DigitalOcean)" value={usd(d.mtdUsd)} hint={`Presupuesto ${usd(o.settings.monthly)}`} icon={Wallet} />
            <StatCard
              label="Previsión a fin de mes"
              value={o.forecast !== null ? usd(o.forecast) : '—'}
              hint={o.forecast !== null && o.forecast > o.settings.monthly ? 'Pasa del presupuesto' : 'Dentro del presupuesto'}
              tone={o.forecast !== null && o.forecast > o.settings.monthly ? 'warning' : 'success'}
            />
            <StatCard label="Coste fijo mensual estimado" value={o.estimate ? usd(o.estimate.total) : '—'} hint={o.estimate ? `servidores ${usd(o.estimate.droplets)} · copias ${usd(o.estimate.backups)} · snapshots ${usd(o.estimate.snapshots)}` : undefined} />
            <StatCard label="Última factura" value={d.invoices[0] ? usd(d.invoices[0].amount) : '—'} hint={d.invoices[0] ? period(d.invoices[0].period) : undefined} />
          </div>

          {c && (
            <Section title={`Capacidad de ${c.dropletName}`} description={`El servidor de la herramienta (${Math.round(c.memTotalMb / 1024)} GB de memoria). Últimas 24 h.`}>
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                <Meter label="Memoria (la mayor parte del día)" value={c.memUsedPctP95_24h} icon={MemoryStick} warnAt={o.settings.memPct} hint={`Ahora ${c.memUsedPctNow ?? '—'} % · máximo ${c.memUsedPctMax24h ?? '—'} %`} />
                <Meter label="CPU en los momentos altos" value={loadPct} icon={Cpu} warnAt={90} hint="100 % = la CPU al completo" />
                <Meter label="Disco" value={c.diskUsedPct} icon={HardDrive} warnAt={80} hint="Base de datos, copias e imágenes de Docker" />
              </div>
            </Section>
          )}

          <Section title="Recomendaciones">
            {o.recommendations.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Todo en orden: no hace falta ampliar ni hay gasto que revisar.</p>
            ) : (
              <ul className="divide-y text-sm">
                {o.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-3 px-5 py-3">
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <p className="font-medium">
                        {r.title}{' '}
                        {r.deltaUsdMonth !== null && <Badge tone={r.deltaUsdMonth < 0 ? 'success' : 'warning'}>{r.deltaUsdMonth < 0 ? `ahorro ≈ ${usd(-r.deltaUsdMonth)}/mes` : `+${usd(r.deltaUsdMonth)}/mes`}</Badge>}
                      </p>
                      <p className="text-muted-foreground">{r.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Servidores de la cuenta">
            <div className="overflow-x-auto">
              <table className="data-table w-full text-sm">
                <thead>
                  <tr>
                    <th>Servidor</th>
                    <th>Tamaño</th>
                    <th>Precio/mes</th>
                    <th>Copias</th>
                    <th>Creado</th>
                  </tr>
                </thead>
                <tbody>
                  {d.droplets.map((x) => (
                    <tr key={x.id}>
                      <td className="font-medium">
                        <Server className="mr-1 inline size-3.5 text-muted-foreground" aria-hidden />
                        {x.name} {x.name === c?.dropletName && <Badge tone="info">herramienta</Badge>}
                      </td>
                      <td>
                        {x.size} <span className="text-muted-foreground">({x.vcpus} CPU · {Math.round(x.memoryMb / 1024)} GB · {x.diskGb} GB)</span>
                      </td>
                      <td>{usd(x.priceMonthly)}</td>
                      <td>{x.backups ? `sí (+${usd(x.priceMonthly * 0.2)})` : 'no'}</td>
                      <td>{x.createdAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t px-5 py-3 text-sm text-muted-foreground">
              Snapshots: {d.snapshots.length} ({d.snapshots.reduce((s, x) => s + x.sizeGb, 0).toFixed(1)} GB). Facturas: {d.invoices.slice(0, 4).map((i) => `${period(i.period)} ${usd(i.amount)}`).join(' · ') || '—'}.
            </p>
          </Section>
        </>
      )}

      <Section title="Conexión con DigitalOcean" description="Crea en DigitalOcean (API → Tokens) un token personalizado de solo lectura con acceso a facturación (billing), servidores (droplet), snapshots, tamaños (sizes) y monitorización. Se guarda cifrado.">
        <div className="space-y-3 px-5 py-4 text-sm">
          {o.connected ? (
            <>
              <p>
                Conectado {o.tokenSource === 'entorno' ? '(token del entorno del servidor)' : '(token guardado en el panel)'}.
                {d && <span className="text-muted-foreground"> Última lectura: {new Date(d.fetchedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}.</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => run(refreshInfraAction)} disabled={pending}>
                  <RefreshCw className="size-4" aria-hidden /> Actualizar ahora
                </Button>
                {o.tokenSource === 'panel' && (
                  <Button size="sm" variant="ghost" onClick={() => window.confirm('¿Quitar el token de DigitalOcean?') && run(disconnectDoTokenAction)} disabled={pending}>
                    Quitar el token
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="dop_v1_…" className="max-w-sm" aria-label="Token de DigitalOcean" />
              <Button size="sm" onClick={() => run(() => connectDoTokenAction(token))} disabled={pending || !token.trim()}>
                Conectar
              </Button>
            </div>
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
