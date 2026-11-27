'use client';

// Proyecto → Autoridad: encender o apagar (admin), consultar ahora, comparación con la competencia, nuevos y perdidos,
// huecos y la prueba de cobertura frente a Search Console (admin, una vez al día).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, Link2, Power, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Section } from '@/components/ui/page';
import type { AutoridadView } from '@/lib/seo/autoridad/autoridad';
import { coverageTestAction, runAutoridadNowAction, setAutoridadAction } from '@/lib/seo/cierre-actions';

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('es-ES'));

export function AutoridadPanel({ projectId, view, canEdit, isAdmin }: { projectId: string; view: AutoridadView; canEdit: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [gsc, setGsc] = useState('');
  const [cov, setCov] = useState<{ share: number | null; found: number; total: number; dfsTotal: number | null; missing: string[] } | null>(null);

  const act = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { type: 'ok', text: r.message } : null) : { type: 'error', text: r.error });
      router.refresh();
    });

  const toggle = isAdmin && (
    <Button size="sm" variant={view.on ? 'outline' : 'default'} disabled={pending} onClick={() => act(() => setAutoridadAction(projectId, !view.on))}>
      <Power className="size-3.5" />
      {view.on ? 'Apagar' : 'Encender Autoridad'}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      {msg && (
        <p role="status" className={msg.type === 'ok' ? 'text-sm text-success' : 'text-sm text-destructive'}>
          {msg.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge tone={view.on ? 'success' : 'neutral'} dot>
          {view.on ? 'Encendida: una consulta al mes' : 'Apagada'}
        </Badge>
        <span>
          Gasto este mes: <strong>{view.spentOp.toFixed(2)} $</strong> de {view.budget} $ (unos 0,15-0,30 $ por consulta completa).
        </span>
        {toggle}
        {canEdit && view.on && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => runAutoridadNowAction(projectId))}>
            <RefreshCw className="size-3.5" />
            Consultar ahora
          </Button>
        )}
      </div>

      {!view.rows.length ? (
        <EmptyState
          icon={Link2}
          title={view.on ? 'Aún no hay datos' : 'Autoridad está apagada en este proyecto'}
          description={
            view.on
              ? 'La primera consulta llega en unos minutos. Hacen falta la web en el alcance del proyecto y, para los huecos, 2 o más competidores confirmados (Expediente).'
              : 'Antes de encenderla en todos los clientes, comprueba abajo que DataForSEO encuentra la mayoría de las webs que Search Console dice que enlazan a este cliente (criterio: 60 % o más, en 3 clientes).'
          }
          action={toggle || undefined}
        />
      ) : (
        <>
          <Section title={`Comparación · ${view.rows[0]?.month ?? ''}`} description="Webs distintas que enlazan (lo que más pesa), enlaces totales, fuerza (0-100) y puntuación de spam (cuanto más baja, mejor).">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Web</th>
                    <th className="py-2 pr-3 font-medium">Webs que enlazan</th>
                    <th className="py-2 pr-3 font-medium">Enlaces</th>
                    <th className="py-2 pr-3 font-medium">Fuerza</th>
                    <th className="py-2 pr-3 font-medium">Spam</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => (
                    <tr key={r.domain} className={r.isClient ? 'border-b font-medium' : 'border-b'}>
                      <td className="py-2 pr-3">
                        {r.domain} {r.isClient && <Badge tone="info">Cliente</Badge>}
                      </td>
                      <td className="py-2 pr-3">{n(r.summary.referringDomains)}</td>
                      <td className="py-2 pr-3">{n(r.summary.backlinks)}</td>
                      <td className="py-2 pr-3">{n(r.summary.rank)}</td>
                      <td className="py-2 pr-3">{n(r.summary.spamScore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {view.newLost.length > 0 && (
            <Section title="Webs que enlazan: ganadas y perdidas por mes" description="Del cliente, en los últimos 12 meses.">
              <ul className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
                {view.newLost.slice(-8).map((m) => (
                  <li key={m.month} className="rounded-md border px-2 py-1">
                    <span className="text-xs text-muted-foreground">{m.month}</span>
                    <br />
                    <span className="text-success">+{m.newDomains}</span> · <span className="text-destructive">−{m.lostDomains}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={`Huecos (${view.gap.length})`} description="Webs que enlazan a dos o más competidores y no al cliente, sin directorios ni redes, las más fuertes primero. Con 5 o más se propone un encargo en el Plan de mejora.">
            {!view.gap.length ? (
              <p className="text-sm text-muted-foreground">Sin huecos (o menos de 2 competidores confirmados en el Expediente).</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {view.gap.map((g) => (
                  <li key={g.domain} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{g.domain}</span>
                    <Badge tone="neutral">fuerza {n(g.rank)}</Badge>
                    <span className="text-xs text-muted-foreground">enlaza a {g.linksTo.join(', ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {isAdmin && (
        <Section title="Probar cobertura" description="Pega aquí los dominios de Search Console → Enlaces → «Sitios que más enlazan» (Exportar) de este cliente. Se comparan con lo que encuentra DataForSEO (unos 0,06 $, una vez al día).">
          <div className="flex flex-col gap-2">
            <textarea value={gsc} onChange={(e) => setGsc(e.target.value)} rows={5} className="w-full rounded-md border bg-background p-2 text-sm" placeholder={'ejemplo.com\notraweb.es\n…'} aria-label="Dominios de Search Console" />
            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !gsc.trim()}
                onClick={() =>
                  start(async () => {
                    const r = await coverageTestAction(projectId, gsc);
                    if (r.ok) {
                      setCov(r);
                      setMsg(null);
                    } else setMsg({ type: 'error', text: r.error });
                    router.refresh();
                  })
                }
              >
                <FlaskConical className="size-3.5" />
                Comparar
              </Button>
            </div>
            {cov && (
              <div className="text-sm">
                <p>
                  DataForSEO encuentra <strong>{cov.found} de {cov.total}</strong> ({cov.share == null ? '—' : `${Math.round(cov.share * 100)} %`}) de los dominios de Search Console, y {n(cov.dfsTotal)} en total.{' '}
                  {cov.share != null && (cov.share >= 0.6 ? <Badge tone="success">Cumple el criterio (60 %)</Badge> : <Badge tone="warning">No llega al 60 %</Badge>)}
                </p>
                {cov.missing.length > 0 && <p className="mt-1 text-xs text-muted-foreground">No los encuentra: {cov.missing.join(', ')}</p>}
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
